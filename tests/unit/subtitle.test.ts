import { describe, it, expect } from 'vitest';
import {
  secondsToUs,
  usToSeconds,
  buildCandidateSubtitleTrack,
  getActiveSubtitleCue,
  getActiveWord,
  groupWordsIntoReadableCues,
  extractTranscriptWords,
  estimateWordsFromText,
  MAX_WORDS_PER_CUE,
} from '@/domain/transcript/subtitle';
import { TranscriptWord, SubtitleWord, TranscriptDocument } from '@/domain/transcript/types';

/** Test helper: builds a SubtitleWord whose local time equals source time. */
const sw = (id: string, text: string, startUs: number, endUs: number): SubtitleWord => ({
  id,
  transcriptWordId: id,
  text,
  sourceStartUs: startUs,
  sourceEndUs: endUs,
  localStartUs: startUs,
  localEndUs: endUs,
  emphasis: 'none',
});

describe('Subtitle Timing & Rebase System (SUBTITLE_FIX_SPEC.md)', () => {
  it('converts seconds to microseconds and vice versa correctly', () => {
    expect(secondsToUs(1.5)).toBe(1_500_000);
    expect(usToSeconds(2_500_000)).toBe(2.5);
  });

  it('rebases sourceStartUs into localStartUs = sourceStartUs - candidateStartUs', () => {
    const transcriptWords: TranscriptWord[] = [
      { id: 'w1', text: 'Halo', sourceStartUs: 10_000_000, sourceEndUs: 10_500_000, timingPrecision: 'word-native' },
      { id: 'w2', text: 'dunia', sourceStartUs: 10_500_000, sourceEndUs: 11_000_000, timingPrecision: 'word-native' },
      { id: 'w3', text: 'luar', sourceStartUs: 20_000_000, sourceEndUs: 20_500_000, timingPrecision: 'word-native' },
    ];

    const candidateStartUs = 10_000_000;
    const candidateEndUs = 15_000_000;

    const track = buildCandidateSubtitleTrack(transcriptWords, candidateStartUs, candidateEndUs);

    expect(track.cues.length).toBeGreaterThan(0);
    expect(track.cues[0].words[0].text).toBe('Halo');
    expect(track.cues[0].words[0].localStartUs).toBe(0); // 10_000_000 - 10_000_000
    expect(track.cues[0].words[0].localEndUs).toBe(500_000); // 10_500_000 - 10_000_000
  });

  it('resolves getActiveSubtitleCue and getActiveWord correctly for preview and render parity', () => {
    const transcriptWords: TranscriptWord[] = [
      { id: 'w1', text: 'Satu', sourceStartUs: 0, sourceEndUs: 1_000_000, timingPrecision: 'word-native' },
      { id: 'w2', text: 'Dua', sourceStartUs: 1_000_000, sourceEndUs: 2_000_000, timingPrecision: 'word-native' },
    ];

    const track = buildCandidateSubtitleTrack(transcriptWords, 0, 5_000_000);

    const activeCue = getActiveSubtitleCue(500_000, track.cues);
    expect(activeCue).not.toBeNull();
    expect(activeCue?.text).toContain('Satu');

    if (activeCue) {
      const activeWord = getActiveWord(500_000, activeCue);
      expect(activeWord).not.toBeNull();
      expect(activeWord?.text).toBe('Satu');
    }

    const inactiveCue = getActiveSubtitleCue(4_000_000, track.cues);
    expect(inactiveCue).toBeNull();
  });

  it('groups subtitle words into readable phrase cues', () => {
    const words: SubtitleWord[] = [
      { id: 'sw1', transcriptWordId: 'w1', text: 'Tes', sourceStartUs: 0, sourceEndUs: 500_000, localStartUs: 0, localEndUs: 500_000, emphasis: 'none' },
    ];
    const cues = groupWordsIntoReadableCues(words);
    expect(cues.length).toBe(1);
    expect(cues[0].text).toBe('Tes');
  });

  it('applies globalOffsetUs correctly to localStartUs and localEndUs', () => {
    const transcriptWords: TranscriptWord[] = [
      { id: 'w1', text: 'Tes', sourceStartUs: 5_000_000, sourceEndUs: 6_000_000, timingPrecision: 'word-native' },
    ];

    const globalOffsetUs = 200_000; // +200ms
    const track = buildCandidateSubtitleTrack(transcriptWords, 5_000_000, 10_000_000, globalOffsetUs);

    expect(track.cues[0].words[0].localStartUs).toBe(200_000);
    expect(track.cues[0].words[0].localEndUs).toBe(1_200_000);
  });

  it('breaks cues at punctuation marks', () => {
    const words: SubtitleWord[] = [
      sw('a', 'Ini', 0, 400_000),
      sw('b', 'video.', 400_000, 900_000),
      sw('c', 'Lalu', 900_000, 1_300_000),
      sw('d', 'kita', 1_300_000, 1_700_000),
      sw('e', 'coba', 1_700_000, 2_100_000),
    ];

    const cues = groupWordsIntoReadableCues(words);

    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('Ini video.');
    expect(cues[1].text).toBe('Lalu kita coba');
  });

  it('breaks cues at long pauses between words', () => {
    const words: SubtitleWord[] = [
      sw('a', 'Pertama', 0, 500_000),
      sw('b', 'kedua', 500_000, 1_000_000),
      // 2 second pause before the next word
      sw('c', 'ketiga', 3_000_000, 3_500_000),
      sw('d', 'keempat', 3_500_000, 4_000_000),
    ];

    const cues = groupWordsIntoReadableCues(words);

    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('Pertama kedua');
    expect(cues[1].text).toBe('ketiga keempat');
  });

  it('never exceeds MAX_WORDS_PER_CUE words per cue', () => {
    const words: SubtitleWord[] = [];
    for (let i = 0; i < 9; i++) {
      words.push(sw(`w${i}`, `kata${i}`, i * 300_000, i * 300_000 + 250_000));
    }

    const cues = groupWordsIntoReadableCues(words);

    for (const cue of cues) {
      expect(cue.words.length).toBeLessThanOrEqual(MAX_WORDS_PER_CUE);
    }
    expect(cues[0].words.length).toBe(MAX_WORDS_PER_CUE);
  });

  it('merges a single-word leftover into the previous cue when it stays readable', () => {
    const words: SubtitleWord[] = [
      sw('a', 'Satu', 0, 300_000),
      sw('b', 'dua', 300_000, 600_000),
      sw('c', 'tiga.', 600_000, 900_000), // punctuation forces break after 3 words
      sw('d', 'Empat', 900_000, 1_200_000), // single leftover
    ];

    const cues = groupWordsIntoReadableCues(words);

    expect(cues.length).toBe(1);
    expect(cues[0].text).toBe('Satu dua tiga. Empat');
  });

  it('extractTranscriptWords filters transcript words to the candidate window', () => {
    const doc: TranscriptDocument = {
      id: 'trans-1',
      projectId: 'proj-1',
      language: 'id',
      modelId: 'test',
      segments: [
        {
          id: 'seg-1',
          startUs: 10_000_000,
          endUs: 12_000_000,
          text: 'Halo semua',
          words: [
            { word: 'Halo', startUs: 10_000_000, endUs: 11_000_000, confidence: 0.9 },
            { word: 'semua', startUs: 11_000_000, endUs: 12_000_000, confidence: 0.9 },
          ],
        },
        {
          id: 'seg-2',
          startUs: 20_000_000,
          endUs: 21_000_000,
          text: 'Diluar',
          words: [{ word: 'Diluar', startUs: 20_000_000, endUs: 21_000_000 }],
        },
      ],
    };

    const words = extractTranscriptWords(doc, 10_000_000, 15_000_000);

    expect(words.length).toBe(2);
    expect(words[0].text).toBe('Halo');
    expect(words[0].sourceStartUs).toBe(10_000_000); // stays in source time
    expect(words[0].timingPrecision).toBe('segment-derived');
    expect(words[0].confidence).toBe(0.9);
    expect(words.every((w) => w.sourceEndUs <= 15_000_000)).toBe(true);
  });

  it('estimateWordsFromText spreads words evenly and labels them estimated', () => {
    const words = estimateWordsFromText('satu dua tiga empat', 0, 4_000_000);

    expect(words.length).toBe(4);
    expect(words[0].sourceStartUs).toBe(0);
    expect(words[1].sourceStartUs).toBe(1_000_000);
    expect(words.every((w) => w.timingPrecision === 'estimated')).toBe(true);
  });

  it('preview and render resolve the identical cue from extracted words (parity)', () => {
    const doc: TranscriptDocument = {
      id: 'trans-2',
      projectId: 'proj-1',
      language: 'id',
      modelId: 'test',
      segments: [
        {
          id: 'seg-1',
          startUs: 10_000_000,
          endUs: 11_000_000,
          text: 'Satu dua',
          words: [
            { word: 'Satu', startUs: 10_000_000, endUs: 10_500_000 },
            { word: 'dua', startUs: 10_500_000, endUs: 11_000_000 },
          ],
        },
      ],
    };

    const words = extractTranscriptWords(doc, 10_000_000, 15_000_000);
    const offsetUs = 250_000;

    // Identical track construction for preview and render paths.
    const previewTrack = buildCandidateSubtitleTrack(words, 10_000_000, 15_000_000, offsetUs);
    const renderTrack = buildCandidateSubtitleTrack(words, 10_000_000, 15_000_000, offsetUs);

    const localTimeUs = 300_000; // 10_300_000 source -> 300ms local
    const previewCue = getActiveSubtitleCue(localTimeUs, previewTrack.cues);
    const renderCue = getActiveSubtitleCue(localTimeUs, renderTrack.cues);

    expect(previewCue).not.toBeNull();
    expect(previewCue?.id).toBe(renderCue?.id);
    expect(previewCue?.text).toBe('Satu dua');
  });
});
