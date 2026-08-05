import { describe, it, expect } from 'vitest';
import { Ok, Err, createAppError } from '@/domain/common/Result';
import { Candidate } from '@/domain/candidate/types';

describe('Domain Result Pattern & Types', () => {
  it('creates successful result correctly', () => {
    const res = Ok({ data: 'hello' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.data).toBe('hello');
    }
  });

  it('creates error result correctly', () => {
    const err = createAppError('CODEC_ERROR', 'VideoDecoder not supported');
    const res = Err(err);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CODEC_ERROR');
    }
  });

  it('calculates Candidate duration correctly', () => {
    const candidate: Candidate = {
      id: 'cand-test',
      projectId: 'proj-01',
      title: 'Test Candidate',
      headline: 'Test Headline',
      transcriptText: 'Test transcript text',
      keywords: ['test'],
      startUs: 10000000,
      endUs: 40000000,
      durationUs: 30000000,
      score: {
        totalScore: 90,
        hookScore: 90,
        flowScore: 90,
        clarityScore: 90,
        relevanceScore: 90,
        reasons: ['Good hook'],
      },
      recommendedLayout: 'smart_editorial',
      selectedLayout: 'smart_editorial',
      smartCropPoints: [],
      selectedForRender: true,
      manualOverride: false,
    };

    expect(candidate.endUs - candidate.startUs).toBe(candidate.durationUs);
  });
});
