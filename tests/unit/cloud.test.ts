import { describe, it, expect } from 'vitest';
import {
  pcmToWavBytes,
  groupRangesForUpload,
  apiSegmentsToTranscriptDocument,
  UPLOAD_CHUNK_MAX_US,
} from '@/infrastructure/media/transcription/cloud';

describe('Cloud transcription adapter (opt-in)', () => {
  it('writes a valid 16-bit mono WAV header', () => {
    const pcm = new Float32Array([0.5, -0.5, 1, -1]);
    const buffer = pcmToWavBytes(pcm, 16_000);
    expect(buffer.byteLength).toBe(44 + pcm.length * 2);

    const view = new DataView(buffer);
    expect(tag(view, 0)).toBe('RIFF');
    expect(tag(view, 8)).toBe('WAVE');
    expect(tag(view, 12)).toBe('fmt ');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(tag(view, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    // +0.5 -> ~16384, -1 -> -32768 clamped
    expect(view.getInt16(44, true)).toBeCloseTo(16384, -2);
    expect(view.getInt16(44 + 3 * 2, true)).toBe(-32768);
  });

  it('groups consecutive ranges under the upload size cap', () => {
    const ranges = [
      { startUs: 0, endUs: 300_000_000 },
      { startUs: 300_000_000, endUs: 500_000_000 }, // same group: 500s <= 600s
      { startUs: 700_000_000, endUs: 1_300_000_000 }, // new group (would exceed cap)
    ];

    const groups = groupRangesForUpload(ranges, UPLOAD_CHUNK_MAX_US);

    expect(groups).toEqual([
      { startUs: 0, endUs: 500_000_000 },
      { startUs: 700_000_000, endUs: 1_300_000_000 },
    ]);
  });

  it('maps provider segments into transcript segments with estimated word timing', () => {
    const doc = apiSegmentsToTranscriptDocument(
      [
        { start: 1.0, end: 3.0, text: 'Halo semua' },
        { start: undefined, end: undefined, text: 'tanpa waktu' }, // skipped
        { start: 5.0, end: 6.0, text: '  ' }, // skipped
      ],
      'proj-1',
      'id',
      'cloud:groq:whisper-large-v3'
    );

    expect(doc.modelId).toBe('cloud:groq:whisper-large-v3');
    expect(doc.segments.length).toBe(1);
    const seg = doc.segments[0];
    expect(seg.startUs).toBe(1_000_000);
    expect(seg.endUs).toBe(3_000_000);
    expect(seg.text).toBe('Halo semua');
    expect(seg.words.length).toBe(2);
    expect(seg.words[0].word).toBe('Halo');
    // Even distribution across the segment window.
    expect(seg.words[0].startUs).toBe(1_000_000);
    expect(seg.words[1].endUs).toBeLessThanOrEqual(3_000_000);
  });
});

function tag(view: DataView, offset: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}
