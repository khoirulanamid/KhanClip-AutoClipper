import { describe, it, expect } from 'vitest';
import { generateCandidatesFromTranscript } from '@/domain/candidate/generator';
import { TranscriptDocument } from '@/domain/transcript/types';
import { ProjectSettings } from '@/domain/project/types';

const settings: ProjectSettings = {
  language: 'id',
  candidateCount: 3,
  targetDurationSec: '15_30',
  layoutTemplate: 'smart_editorial',
  performanceProfile: 'balanced',
  outputResolution: '1080x1920',
  autoSubtitles: true,
  clipStartMinute: 0,
  clipEndMinute: 0,
};

/** Builds a transcript of four 10-second speech segments with per-word timestamps. */
const buildTranscript = (): TranscriptDocument => {
  const sentences = [
    'Kunci strategi belajar yang pertama',
    'adalah metode eksekusi harian yang penting',
    'hindari kesalahan besar saat mengambil keputusan',
    'kesimpulan utamanya kuasai ilmu dasar ini',
  ];

  return {
    id: 'trans-gen',
    projectId: 'proj-gen',
    language: 'id',
    modelId: 'test',
    segments: sentences.map((text, i) => {
      const startUs = i * 10_000_000;
      const endUs = startUs + 10_000_000;
      const parts = text.split(/\s+/);
      const wordDurUs = Math.round((endUs - startUs) / parts.length);
      return {
        id: `seg-${i + 1}`,
        startUs,
        endUs,
        text,
        words: parts.map((word, w) => ({
          word,
          startUs: startUs + w * wordDurUs,
          endUs: Math.min(endUs, startUs + (w + 1) * wordDurUs),
        })),
      };
    }),
  };
};

describe('Candidate Generator — real word timestamp flow', () => {
  it('attaches per-word source timestamps to every candidate', () => {
    const transcript = buildTranscript();
    const candidates = generateCandidatesFromTranscript('proj-gen', transcript, settings);

    expect(candidates.length).toBeGreaterThan(0);

    for (const cand of candidates) {
      expect(cand.transcriptWords).toBeDefined();
      expect(cand.transcriptWords!.length).toBeGreaterThan(0);

      for (const word of cand.transcriptWords!) {
        // Words must overlap the candidate window and stay in source time.
        expect(word.sourceEndUs).toBeGreaterThan(cand.startUs);
        expect(word.sourceStartUs).toBeLessThan(cand.endUs);
        expect(word.timingPrecision).toBe('segment-derived');
      }

      // Timestamps must be ordered.
      const starts = cand.transcriptWords!.map((w) => w.sourceStartUs);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    }
  });

  it('candidate words match the candidate transcript text sequence', () => {
    const transcript = buildTranscript();
    const candidates = generateCandidatesFromTranscript('proj-gen', transcript, settings);

    for (const cand of candidates) {
      const joined = cand.transcriptWords!.map((w) => w.text).join(' ');
      expect(joined).toBe(cand.transcriptText);
    }
  });

  it('leaves transcriptWords empty when autoSubtitles is off', () => {
    const candidates = generateCandidatesFromTranscript('proj-gen', buildTranscript(), {
      ...settings,
      autoSubtitles: false,
    });

    expect(candidates.length).toBeGreaterThan(0);
    for (const cand of candidates) {
      expect(cand.transcriptWords).toEqual([]);
    }
  });
});
