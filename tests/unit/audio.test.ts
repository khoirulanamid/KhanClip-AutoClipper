import { describe, it, expect } from 'vitest';
import { generateCandidatesFromTranscript } from '@/domain/candidate/generator';
import { TranscriptDocument } from '@/domain/transcript/types';
import { ProjectSettings } from '@/domain/project/types';

describe('Real Candidate Generator & Audio Segment Algorithm', () => {
  it('generates real quality candidates from speech transcript', () => {
    const transcript: TranscriptDocument = {
      id: 'trans-1',
      projectId: 'proj-1',
      language: 'id',
      modelId: 'whisper-local',
      segments: [
        { id: 's1', startUs: 0, endUs: 10000000, text: 'Halo selamat datang di video ini.', words: [] },
        { id: 's2', startUs: 11000000, endUs: 25000000, text: 'Kita akan membahas strategi paling efektif.', words: [] },
        { id: 's3', startUs: 26000000, endUs: 40000000, text: 'Pastikan Anda menyimak sampai akhir.', words: [] },
      ],
    };

    const settings: ProjectSettings = {
      language: 'id',
      candidateCount: 3,
      targetDurationSec: '15_30',
      layoutTemplate: 'smart_editorial',
      performanceProfile: 'balanced',
      outputResolution: '1080x1920',
    };

    const candidates = generateCandidatesFromTranscript('proj-1', transcript, settings);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].score.totalScore).toBeGreaterThan(0);
    expect(candidates[0].headline).toBeDefined();
    expect(candidates[0].startUs).toBe(0);
  });
});
