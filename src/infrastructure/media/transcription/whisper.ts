import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { TranscriptDocument, TranscriptSegment, WordTimestamp } from '@/domain/transcript/types';
import { StartTranscriptionRequest, WorkerResponse } from '@/workers/protocols/messages';
import { env } from '@huggingface/transformers';

// ONNX runtime WASM binaries are self-hosted: Vite bundles them as assets and
// references them with URLs that already include the app base path, so they
// load on any device whenever the app itself loads (no third-party CDN to be
// blocked by restrictive networks). Only model weights are fetched from the
// Hugging Face hub, once, and cached in the browser afterwards; audio and
// transcripts never leave the device.

// Only fetch models from the Hugging Face hub (cached in browser after first download).
env.allowLocalModels = false;

/** Whisper expects mono audio at 16 kHz. */
export const WHISPER_TARGET_SAMPLE_RATE = 16_000;

/** Break subtitle/segment grouping when silence exceeds this threshold. */
const SEGMENT_GAP_BREAK_US = 700_000;

/** A word-level chunk emitted by the Whisper pipeline (timestamps in seconds). */
export interface WhisperWordChunk {
  text: string;
  timestamp: [number | null, number | null];
}

/**
 * Maps app language codes to Whisper language names.
 * 'auto' returns undefined so Whisper auto-detects the language.
 */
export function mapLanguageToWhisper(language: string): string | undefined {
  if (language === 'id') return 'indonesian';
  if (language === 'en') return 'english';
  return undefined;
}

/**
 * Picks the Whisper model for the device and performance profile.
 * 'tiny' is the universal default (works on low-end phones); 'base' is only
 * used for the 'max' profile on devices with enough memory.
 */
export function pickWhisperModel(
  modelProfile: 'eco' | 'balanced' | 'max',
  deviceMemoryGb?: number
): string {
  const lowMemory = typeof deviceMemoryGb === 'number' && deviceMemoryGb <= 2;
  if (modelProfile === 'max' && !lowMemory) {
    return 'Xenova/whisper-base'; // ~77 MB q8, better Indonesian quality
  }
  return 'Xenova/whisper-tiny'; // ~41 MB q8, multilingual, runs everywhere
}

/**
 * Mixes channels down to mono and resamples to 16 kHz via linear interpolation.
 * Pure function so it can run in tests and be reused by the worker path.
 */
export function resampleAudioTo16k(
  channels: Float32Array[],
  sourceSampleRate: number
): Float32Array {
  if (channels.length === 0 || sourceSampleRate <= 0) return new Float32Array(0);

  const sourceLength = channels[0].length;
  const targetLength = Math.floor((sourceLength * WHISPER_TARGET_SAMPLE_RATE) / sourceSampleRate);
  const out = new Float32Array(targetLength);
  const ratio = sourceSampleRate / WHISPER_TARGET_SAMPLE_RATE;

  for (let i = 0; i < targetLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    let sum = 0;
    for (const ch of channels) {
      const a = ch[idx] ?? 0;
      const b = ch[idx + 1] ?? a;
      sum += a + (b - a) * frac;
    }
    out[i] = sum / channels.length;
  }

  return out;
}

/**
 * Converts Whisper word-level chunks into a TranscriptDocument.
 * - timestamps converted to source-video microseconds;
 * - consecutive duplicated words on overlapping timestamps are dropped
 *   (chunk overlap deduplication per SUBTITLE_FIX_SPEC.md §5.7);
 * - words are grouped into segments broken at sentence punctuation or long pauses.
 */
export function chunksToTranscriptDocument(
  chunks: WhisperWordChunk[],
  projectId: string,
  language: string,
  modelId: string
): TranscriptDocument {
  // 1. Normalize & deduplicate chunks.
  interface NormWord {
    text: string;
    startUs: number;
    endUs: number;
  }
  const words: NormWord[] = [];

  for (const chunk of chunks) {
    const text = (chunk.text ?? '').trim();
    const [startSec, endSec] = chunk.timestamp ?? [null, null];
    if (!text || startSec == null) continue;

    const startUs = Math.round(startSec * 1_000_000);
    const endUs = Math.round((endSec ?? startSec) * 1_000_000);
    if (endUs < startUs) continue;

    const prev = words[words.length - 1];
    const isDuplicate =
      prev && prev.text.toLowerCase() === text.toLowerCase() && startUs < prev.endUs;
    if (isDuplicate) continue;

    words.push({ text, startUs, endUs });
  }

  // 2. Group into segments at punctuation or long pauses.
  const segments: TranscriptSegment[] = [];
  let currentWords: WordTimestamp[] = [];
  let currentStartUs = 0;
  let currentEndUs = 0;

  const flush = () => {
    if (currentWords.length === 0) return;
    segments.push({
      id: `seg-${segments.length + 1}`,
      startUs: currentStartUs,
      endUs: currentEndUs,
      text: currentWords.map((w) => w.word).join(' '),
      words: currentWords,
    });
    currentWords = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentWords.length === 0) currentStartUs = w.startUs;
    currentEndUs = Math.max(currentEndUs, w.endUs);
    currentWords.push({ word: w.text, startUs: w.startUs, endUs: w.endUs });

    const endsSentence = /[.!?…]$/.test(w.text);
    const next = words[i + 1];
    const longPause = next ? next.startUs - w.endUs > SEGMENT_GAP_BREAK_US : false;

    if (endsSentence || longPause) flush();
  }
  flush();

  return {
    id: `trans-${Date.now()}`,
    projectId,
    language: language || 'id',
    modelId,
    segments,
  };
}

/**
 * Plans the audio ranges to transcribe: pads VAD speech segments, merges
 * nearby ones, and splits anything longer than two minutes so each Whisper
 * call stays short (visible progress, bounded memory, cancellable).
 * Falls back to the full duration when no speech segments are provided.
 */
export interface UsRange {
  startUs: number;
  endUs: number;
}

const RANGE_PAD_US = 1_000_000;
const RANGE_MERGE_GAP_US = 1_500_000;
const RANGE_MAX_US = 120_000_000;

export function planTranscriptionRanges(
  speechSegments: UsRange[] | undefined,
  totalUs: number
): UsRange[] {
  const base: UsRange[] =
    speechSegments && speechSegments.length > 0
      ? speechSegments
      : [{ startUs: 0, endUs: totalUs }];

  const padded = base
    .map((r) => ({
      startUs: Math.max(0, r.startUs - RANGE_PAD_US),
      endUs: Math.min(totalUs, r.endUs + RANGE_PAD_US),
    }))
    .filter((r) => r.endUs > r.startUs)
    .sort((a, b) => a.startUs - b.startUs);

  const merged: UsRange[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startUs - last.endUs <= RANGE_MERGE_GAP_US) {
      last.endUs = Math.max(last.endUs, r.endUs);
    } else {
      merged.push({ ...r });
    }
  }

  const out: UsRange[] = [];
  for (const r of merged) {
    for (let s = r.startUs; s < r.endUs; s += RANGE_MAX_US) {
      out.push({ startUs: s, endUs: Math.min(r.endUs, s + RANGE_MAX_US) });
    }
  }
  return out;
}

/**
 * Runs Whisper transcription inside a pool of dedicated Web Workers so the
 * main thread stays responsive and multiple CPU cores / GPU sessions work in
 * parallel. Ranges are split into contiguous, duration-balanced shards; each
 * worker receives only its own audio slice (no full-audio duplication).
 * Model weights are downloaded once from the Hugging Face CDN and cached in
 * the browser (offline afterwards); audio and transcript never leave the device.
 */
export interface TranscriptionShard {
  ranges: UsRange[];
  sliceStartUs: number;
  sliceEndUs: number;
}

/** Payload returned by each transcription worker (chunks in global time). */
export interface TranscriptionWorkerPayload {
  chunks: WhisperWordChunk[];
  modelId: string;
  backend: string;
}

/**
 * Splits sorted, non-overlapping ranges into `count` contiguous shards,
 * balanced by total speech duration so parallel workers finish together.
 */
export function splitRangesIntoShards(ranges: UsRange[], count: number): TranscriptionShard[] {
  const shardCount = Math.max(1, Math.min(count, ranges.length));
  const totalUs = ranges.reduce((sum, r) => sum + (r.endUs - r.startUs), 0);
  const targetUs = totalUs / shardCount;

  const shards: TranscriptionShard[] = [];
  let current: UsRange[] = [];
  let currentUs = 0;

  const closeShard = (): void => {
    if (current.length === 0) return;
    shards.push({
      ranges: current,
      sliceStartUs: current[0].startUs,
      sliceEndUs: current[current.length - 1].endUs,
    });
    current = [];
    currentUs = 0;
  };

  for (const range of ranges) {
    const remainingSlots = shardCount - shards.length;
    if (current.length > 0 && currentUs >= targetUs && remainingSlots > 1) {
      closeShard();
    }
    current.push(range);
    currentUs += range.endUs - range.startUs;
  }
  closeShard();
  return shards;
}

/**
 * Chooses the parallel worker count: never more workers than ranges, capped
 * at half the cores (max 4), and forced to 1 on low-memory devices or when
 * there is nothing to parallelize.
 */
export function pickTranscriptionWorkerCount(
  rangeCount: number,
  hardwareConcurrency?: number,
  deviceMemoryGb?: number
): number {
  if (rangeCount <= 1) return 1;
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb <= 2) return 1;
  const cores = typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 ? hardwareConcurrency : 2;
  return Math.min(rangeCount, Math.max(1, Math.min(4, Math.floor(cores / 2))));
}

export function transcribeWithWorker(
  projectId: string,
  language: string,
  modelProfile: 'eco' | 'balanced' | 'max',
  pcm16kMono: Float32Array,
  speechSegments: UsRange[] | undefined,
  onProgress?: (percent: number, stageMessage: string) => void,
  signal?: AbortSignal
): Promise<Result<TranscriptDocument>> {
  return new Promise((resolve) => {
    const totalUs = Math.round((pcm16kMono.length / WHISPER_TARGET_SAMPLE_RATE) * 1_000_000);
    const ranges = planTranscriptionRanges(speechSegments, totalUs);
    const deviceMemoryGb = (navigator as any).deviceMemory as number | undefined;
    const shards = splitRangesIntoShards(
      ranges,
      pickTranscriptionWorkerCount(ranges.length, navigator.hardwareConcurrency, deviceMemoryGb)
    );

    const workers: Worker[] = [];
    let settled = false;
    let completedWorkers = 0;
    let backend = '';
    let lastDownloadMessage = '';
    const shardPercent = shards.map(() => 0);
    const shardDoneRanges = shards.map(() => 0);
    const shardTotalRanges = shards.map((s) => s.ranges.length);
    const shardWeights = shards.map(
      (s) => s.ranges.reduce((sum, r) => sum + (r.endUs - r.startUs), 0) || 1
    );
    const payloads: (TranscriptionWorkerPayload | null)[] = shards.map(() => null);

    const finish = (result: Result<TranscriptDocument>): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      for (const w of workers) w.terminate(); // release worker resources per AGENTS.md safety rule
      resolve(result);
    };

    const onAbort = (): void =>
      finish(Err(createAppError('TRANSCRIPTION_CANCELLED', 'Transkripsi dibatalkan oleh pengguna.')));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const emitProgress = (): void => {
      const totalWeight = shardWeights.reduce((a, b) => a + b, 0);
      const percent = Math.round(
        shardPercent.reduce((sum, p, i) => sum + p * shardWeights[i], 0) / totalWeight
      );
      const done = shardDoneRanges.reduce((a, b) => a + b, 0);
      const total = shardTotalRanges.reduce((a, b) => a + b, 0);
      const message =
        percent < 50 && lastDownloadMessage
          ? lastDownloadMessage
          : `Mentranskripsi ${done}/${total} bagian dengan ${workers.length} worker paralel${backend ? ` via ${backend}` : ''} (sepenuhnya lokal)...`;
      onProgress?.(percent, message);
    };

    shards.forEach((shard, index) => {
      const worker = new Worker(new URL('../../../workers/transcription.worker.ts', import.meta.url), {
        type: 'module',
      });
      workers.push(worker);
      const id = `trans-req-${Date.now()}-${index}`;

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return;

        if (msg.type === 'PROGRESS') {
          shardPercent[index] = msg.percent;
          if (typeof msg.completedRanges === 'number') shardDoneRanges[index] = msg.completedRanges;
          if (msg.backend) backend = msg.backend;
          if (/Mengunduh model/.test(msg.stageMessage)) lastDownloadMessage = msg.stageMessage;
          emitProgress();
        } else if (msg.type === 'SUCCESS') {
          payloads[index] = msg.payload as TranscriptionWorkerPayload;
          shardPercent[index] = 100;
          shardDoneRanges[index] = shardTotalRanges[index];
          completedWorkers++;
          emitProgress();
          if (completedWorkers === shards.length) {
            const chunks = payloads.flatMap((p) => p?.chunks ?? []);
            chunks.sort((a, b) => (a.timestamp[0] ?? 0) - (b.timestamp[0] ?? 0));
            const modelId = payloads.find((p) => p)?.modelId ?? 'Xenova/whisper-tiny';
            finish(Ok(chunksToTranscriptDocument(chunks, projectId, language, modelId)));
          }
        } else if (msg.type === 'ERROR') {
          finish(
            Err(
              createAppError(msg.errorCode, msg.errorMessage, {
                suggestedFallback: msg.suggestedFallback,
                retryable: true,
              })
            )
          );
        }
      };

      worker.onerror = (e) => {
        finish(
          Err(
            createAppError(
              'TRANSCRIPTION_WORKER_FAILED',
              e.message || 'Worker transkripsi gagal dijalankan di perangkat ini.'
            )
          )
        );
      };

      const startSample = Math.max(
        0,
        Math.floor((shard.sliceStartUs / 1_000_000) * WHISPER_TARGET_SAMPLE_RATE)
      );
      const endSample = Math.min(
        pcm16kMono.length,
        Math.ceil((shard.sliceEndUs / 1_000_000) * WHISPER_TARGET_SAMPLE_RATE)
      );
      const slice = pcm16kMono.slice(startSample, endSample);
      const buffer = slice.buffer as ArrayBuffer;
      const request: StartTranscriptionRequest = {
        id,
        timestampUs: Date.now() * 1000,
        type: 'START_TRANSCRIPTION',
        projectId,
        audioBuffer: buffer,
        sampleRate: WHISPER_TARGET_SAMPLE_RATE,
        language,
        modelProfile,
        audioOffsetUs: Math.round((startSample / WHISPER_TARGET_SAMPLE_RATE) * 1_000_000),
        ranges: shard.ranges,
      };
      worker.postMessage(request, [buffer]);
    });
  });
}
