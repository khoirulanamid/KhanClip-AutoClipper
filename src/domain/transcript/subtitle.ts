import {
  TranscriptWord,
  SubtitleWord,
  SubtitleCue,
  SubtitleTrack,
} from './types';

export const SECOND_US = 1_000_000;
export const MILLISECOND_US = 1_000;

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
 * Groups individual subtitle words into readable phrase cues (2-7 words per cue).
 */
export function groupWordsIntoReadableCues(words: SubtitleWord[]): SubtitleCue[] {
  if (!words || words.length === 0) return [];

  const cues: SubtitleCue[] = [];
  const targetWordsPerCue = 4;

  for (let i = 0; i < words.length; i += targetWordsPerCue) {
    const cueWords = words.slice(i, i + targetWordsPerCue);
    if (cueWords.length === 0) continue;

    const sourceStartUs = cueWords[0].sourceStartUs;
    const sourceEndUs = cueWords[cueWords.length - 1].sourceEndUs;
    const localStartUs = cueWords[0].localStartUs;
    const localEndUs = cueWords[cueWords.length - 1].localEndUs;

    cues.push({
      id: `cue-${i / targetWordsPerCue + 1}`,
      words: cueWords,
      text: cueWords.map((w) => w.text).join(' '),
      sourceStartUs,
      sourceEndUs,
      localStartUs,
      localEndUs,
    });
  }

  return cues;
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
