import { describe, it, expect } from 'vitest';
import {
  mapLanguageToWhisper,
  pickWhisperModel,
  resampleAudioTo16k,
  chunksToTranscriptDocument,
  planTranscriptionRanges,
  splitRangesIntoShards,
  pickTranscriptionWorkerCount,
  WHISPER_TARGET_SAMPLE_RATE,
  WhisperWordChunk,
} from '@/infrastructure/media/transcription/whisper';

describe('Whisper transcription adapter (Phase B)', () => {
  it('maps app language codes to Whisper language names', () => {
    expect(mapLanguageToWhisper('id')).toBe('indonesian');
    expect(mapLanguageToWhisper('en')).toBe('english');
    expect(mapLanguageToWhisper('auto')).toBeUndefined();
  });

  it('picks tiny by default and base only for max profile on capable devices', () => {
    expect(pickWhisperModel('eco')).toBe('Xenova/whisper-tiny');
    expect(pickWhisperModel('balanced')).toBe('Xenova/whisper-tiny');
    expect(pickWhisperModel('max')).toBe('Xenova/whisper-base');
    // Low-memory devices always get tiny so transcription runs everywhere.
    expect(pickWhisperModel('max', 2)).toBe('Xenova/whisper-tiny');
    expect(pickWhisperModel('max', 8)).toBe('Xenova/whisper-base');
  });

  it('resamples 32kHz stereo audio to 16kHz mono', () => {
    const length = 320; // 10ms at 32kHz -> 160 samples at 16kHz
    const left = new Float32Array(length).fill(1);
    const right = new Float32Array(length).fill(0.5);

    const out = resampleAudioTo16k([left, right], 32_000);

    expect(out.length).toBe(160);
    // Stereo mixdown averages the channels.
    expect(out[0]).toBeCloseTo(0.75, 5);
  });

  it('returns identical samples when already at 16kHz mono', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const out = resampleAudioTo16k([input], WHISPER_TARGET_SAMPLE_RATE);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0.1, 5);
    expect(out[1]).toBeCloseTo(0.2, 5);
    expect(out[2]).toBeCloseTo(0.3, 5);
  });

  it('returns empty output for empty input', () => {
    expect(resampleAudioTo16k([], 44_100).length).toBe(0);
  });

  it('converts word chunks into a TranscriptDocument with microsecond timestamps', () => {
    const chunks: WhisperWordChunk[] = [
      { text: ' Halo', timestamp: [0, 0.5] },
      { text: ' semua.', timestamp: [0.5, 1.2] },
      { text: ' Selamat', timestamp: [2.5, 3.0] },
      { text: ' datang', timestamp: [3.0, 3.4] },
    ];

    const doc = chunksToTranscriptDocument(chunks, 'proj-1', 'id', 'Xenova/whisper-tiny');

    expect(doc.language).toBe('id');
    expect(doc.modelId).toBe('Xenova/whisper-tiny');
    // Sentence punctuation breaks segments; 1.3s pause also breaks.
    expect(doc.segments.length).toBe(2);
    expect(doc.segments[0].text).toBe('Halo semua.');
    expect(doc.segments[0].startUs).toBe(0);
    expect(doc.segments[0].endUs).toBe(1_200_000);
    expect(doc.segments[0].words[0]).toMatchObject({
      word: 'Halo',
      startUs: 0,
      endUs: 500_000,
    });
    expect(doc.segments[1].text).toBe('Selamat datang');
    expect(doc.segments[1].startUs).toBe(2_500_000);
  });

  it('deduplicates overlapping words at chunk boundaries', () => {
    const chunks: WhisperWordChunk[] = [
      { text: ' ini', timestamp: [0, 0.4] },
      { text: ' adalah', timestamp: [0.4, 0.9] },
      // Duplicate from overlapping stride window.
      { text: ' adalah', timestamp: [0.5, 1.0] },
      { text: ' cara', timestamp: [1.0, 1.4] },
    ];

    const doc = chunksToTranscriptDocument(chunks, 'proj-1', 'id', 'test-model');
    const words = doc.segments.flatMap((s) => s.words.map((w) => w.word));

    expect(words).toEqual(['ini', 'adalah', 'cara']);
  });

  it('skips chunks without valid timestamps and handles null end', () => {
    const chunks: WhisperWordChunk[] = [
      { text: ' tanpa', timestamp: [null, null] },
      { text: ' waktu', timestamp: [1.0, null] },
      { text: '', timestamp: [2.0, 2.5] },
    ];

    const doc = chunksToTranscriptDocument(chunks, 'proj-1', 'auto', 'test-model');

    expect(doc.segments.length).toBe(1);
    expect(doc.segments[0].words.length).toBe(1);
    expect(doc.segments[0].words[0].word).toBe('waktu');
    expect(doc.segments[0].words[0].endUs).toBe(1_000_000); // falls back to start
  });

  it('falls back to full-duration 2-minute ranges without speech segments', () => {
    const ranges = planTranscriptionRanges(undefined, 300_000_000);
    expect(ranges).toEqual([
      { startUs: 0, endUs: 120_000_000 },
      { startUs: 120_000_000, endUs: 240_000_000 },
      { startUs: 240_000_000, endUs: 300_000_000 },
    ]);
  });

  it('pads, merges nearby segments, and clamps to total duration', () => {
    const ranges = planTranscriptionRanges(
      [
        { startUs: 10_000_000, endUs: 20_000_000 },
        { startUs: 21_000_000, endUs: 30_000_000 }, // 1s gap -> merged after padding
        { startUs: 500_000_000, endUs: 510_000_000 }, // far away -> separate
      ],
      505_000_000
    );
    expect(ranges).toEqual([
      { startUs: 9_000_000, endUs: 31_000_000 },
      { startUs: 499_000_000, endUs: 505_000_000 }, // clamped to total
    ]);
  });
});

describe('Parallel transcription worker pool', () => {
  it('keeps a single worker for one range or low-memory devices', () => {
    expect(pickTranscriptionWorkerCount(1, 16, 16)).toBe(1);
    expect(pickTranscriptionWorkerCount(10, 16, 2)).toBe(1);
  });

  it('caps workers at half the cores, max four, never more than ranges', () => {
    expect(pickTranscriptionWorkerCount(10, 16)).toBe(4);
    expect(pickTranscriptionWorkerCount(10, 4)).toBe(2);
    expect(pickTranscriptionWorkerCount(2, 16)).toBe(2);
    expect(pickTranscriptionWorkerCount(10, undefined)).toBe(1); // unknown cores -> conservative
  });

  it('splits ranges into contiguous shards covering every range exactly once', () => {
    const ranges = [
      { startUs: 0, endUs: 60_000_000 },
      { startUs: 60_000_000, endUs: 120_000_000 },
      { startUs: 200_000_000, endUs: 260_000_000 },
      { startUs: 260_000_000, endUs: 320_000_000 },
    ];

    const shards = splitRangesIntoShards(ranges, 2);

    expect(shards.length).toBe(2);
    expect(shards.flatMap((s) => s.ranges)).toEqual(ranges);
    for (const shard of shards) {
      expect(shard.sliceStartUs).toBe(shard.ranges[0].startUs);
      expect(shard.sliceEndUs).toBe(shard.ranges[shard.ranges.length - 1].endUs);
    }
    // Balanced by duration: 120s each.
    expect(shards[0].ranges.length).toBe(2);
    expect(shards[1].ranges.length).toBe(2);
  });

  it('never creates more shards than ranges and balances uneven durations', () => {
    const ranges = [
      { startUs: 0, endUs: 100_000_000 },
      { startUs: 100_000_000, endUs: 120_000_000 },
    ];

    const shards = splitRangesIntoShards(ranges, 4);

    expect(shards.length).toBe(2);
    // The long range must not share a shard with the short one.
    expect(shards[0].ranges).toEqual([ranges[0]]);
    expect(shards[1].ranges).toEqual([ranges[1]]);
  });
});
