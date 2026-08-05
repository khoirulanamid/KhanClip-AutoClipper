import { describe, it, expect } from 'vitest';
import {
  secondsToUs,
  usToSeconds,
  buildCandidateSubtitleTrack,
  getActiveSubtitleCue,
  getActiveWord,
  groupWordsIntoReadableCues,
} from '@/domain/transcript/subtitle';
import { TranscriptWord, SubtitleWord } from '@/domain/transcript/types';

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
});
