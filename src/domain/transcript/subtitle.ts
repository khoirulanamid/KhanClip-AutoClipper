import {
  TranscriptWord,
  TranscriptDocument,
  SubtitleWord,
  SubtitleCue,
  SubtitleTrack,
} from './types';

export const SECOND_US = 1_000_000;
export const MILLISECOND_US = 1_000;

/** Readable cue limits per SUBTITLE_FIX_SPEC.md §5.8 (2-7 words, break on punctuation/pause). */
export const MIN_WORDS_PER_CUE = 2;
export const MAX_WORDS_PER_CUE = 7;
export const CUE_PAUSE_BREAK_US = 600_000;

export function secondsToUs(seconds: number): number {
  return Math.round(seconds * SECOND_US);
}

export function usToSeconds(microseconds: number): number {
  return microseconds / SECOND_US;
}

/**
 * Shared function to resolve the active subtitle cue at localTimeUs.
 * Used by BOTH preview player and final MP4 renderer for 100% timing parity.
 */
export function getActiveSubtitleCue(
  localTimeUs: number,
  cues: SubtitleCue[]
): SubtitleCue | null {
  return (
    cues.find(
      (cue) => localTimeUs >= cue.localStartUs && localTimeUs < cue.localEndUs
    ) ?? null
  );
}

/**
 * Resolves active word within a cue for Kinetic Word Highlighting.
 */
export function getActiveWord(
  localTimeUs: number,
  cue: SubtitleCue
): SubtitleWord | null {
  return (
    cue.words.find(
      (word) => localTimeUs >= word.localStartUs && localTimeUs < word.localEndUs
    ) ?? null
  );
}

/**
 * Groups individual subtitle words into readable phrase cues.
 * A cue breaks at punctuation, at a long pause, or at MAX_WORDS_PER_CUE;
 * single-word leftovers are merged into the previous cue when it stays readable.
 */
export function groupWordsIntoReadableCues(words: SubtitleWord[]): SubtitleCue[] {
  if (!words || words.length === 0) return [];

  const raw: SubtitleWord[][] = [];
  let current: SubtitleWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      raw.push(current);
      current = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    current.push(word);

    const endsWithPunctuation = /[.!?,;:…]$/.test(word.text);
    const nextWord = words[i + 1];
    const hasLongPause = nextWord
      ? nextWord.localStartUs - word.localEndUs > CUE_PAUSE_BREAK_US
      : false;

    if (current.length >= MAX_WORDS_PER_CUE || endsWithPunctuation || hasLongPause) {
      flush();
    }
  }
  flush();

  // Avoid leaving a short single-word cue behind.
  const merged: SubtitleWord[][] = [];
  for (const cueWords of raw) {
    const prev = merged[merged.length - 1];
    if (
      cueWords.length < MIN_WORDS_PER_CUE &&
      prev &&
      prev.length + cueWords.length <= MAX_WORDS_PER_CUE
    ) {
      prev.push(...cueWords);
    } else {
      merged.push([...cueWords]);
    }
  }

  return merged.map((cueWords, idx) => ({
    id: `cue-${idx + 1}`,
    words: cueWords,
    text: cueWords.map((w) => w.text).join(' '),
    sourceStartUs: cueWords[0].sourceStartUs,
    sourceEndUs: cueWords[cueWords.length - 1].sourceEndUs,
    localStartUs: cueWords[0].localStartUs,
    localEndUs: cueWords[cueWords.length - 1].localEndUs,
  }));
}

/**
 * Flattens a transcript's per-segment word timestamps into TranscriptWords,
 * filtered to the candidate window. Timestamps stay in source video time;
 * rebasing to local clip time happens in buildCandidateSubtitleTrack.
 */
export function extractTranscriptWords(
  doc: TranscriptDocument,
  startUs: number,
  endUs: number
): TranscriptWord[] {
  const result: TranscriptWord[] = [];
  let index = 0;

  for (const segment of doc.segments) {
    for (const w of segment.words) {
      if (w.endUs <= startUs || w.startUs >= endUs) continue;
      result.push({
        id: `tw-${segment.id}-${index++}`,
        text: w.word,
        sourceStartUs: w.startUs,
        sourceEndUs: w.endUs,
        confidence: w.confidence,
        timingPrecision: 'segment-derived',
      });
    }
  }

  return result;
}

/**
 * Fallback word timing estimator: distributes words evenly across the window.
 * Used only when real timestamps are unavailable (e.g. user-edited text);
 * words are explicitly labeled 'estimated'.
 */
export function estimateWordsFromText(
  text: string,
  startUs: number,
  endUs: number,
  idPrefix = 'est-w'
): TranscriptWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || endUs <= startUs) return [];

  const durUs = Math.max(200_000, Math.round((endUs - startUs) / parts.length));

  return parts.map((word, idx) => {
    const srcStart = startUs + idx * durUs;
    return {
      id: `${idPrefix}-${idx}`,
      text: word,
      sourceStartUs: srcStart,
      sourceEndUs: Math.min(endUs, srcStart + durUs),
      timingPrecision: 'estimated' as const,
    };
  });
}

/**
 * Single-pass rebase function:
 * Filter words within candidateStartUs..candidateEndUs range,
 * and rebase sourceStartUs -> localStartUs = sourceStartUs - candidateStartUs + globalOffsetUs.
 */
export function buildCandidateSubtitleTrack(
  words: TranscriptWord[],
  candidateStartUs: number,
  candidateEndUs: number,
  globalOffsetUs: number = 0
): SubtitleTrack {
  const selectedWords: SubtitleWord[] = words
    .filter(
      (word) =>
        word.sourceEndUs > candidateStartUs &&
        word.sourceStartUs < candidateEndUs
    )
    .map((word, idx) => {
      const rebasedStart = Math.max(
        0,
        word.sourceStartUs - candidateStartUs + globalOffsetUs
      );
      const rebasedEnd = Math.min(
        candidateEndUs - candidateStartUs,
        word.sourceEndUs - candidateStartUs + globalOffsetUs
      );

      return {
        id: `sub-word-${idx + 1}`,
        transcriptWordId: word.id,
        text: word.text,
        sourceStartUs: word.sourceStartUs,
        sourceEndUs: word.sourceEndUs,
        localStartUs: rebasedStart,
        localEndUs: rebasedEnd,
        emphasis: 'none' as const,
      };
    });

  const cues = groupWordsIntoReadableCues(selectedWords);

  return {
    id: `track-${Date.now()}`,
    candidateId: '',
    transcriptId: '',
    candidateStartUs,
    candidateEndUs,
    mode: 'phrase',
    globalOffsetUs,
    cues,
  };
}
