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
 * Runs Whisper transcription inside a dedicated Web Worker so the main thread
 * stays responsive on every device. Model weights are downloaded once from the
 * Hugging Face CDN and cached in the browser (offline afterwards); audio and
 * transcript never leave the device.
 */
export function transcribeWithWorker(
  projectId: string,
  language: string,
  modelProfile: 'eco' | 'balanced' | 'max',
  pcm16kMono: Float32Array,
  onProgress?: (percent: number, stageMessage: string) => void,
  signal?: AbortSignal
): Promise<Result<TranscriptDocument>> {
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(
      new URL('../../../workers/transcription.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const finish = (result: Result<TranscriptDocument>) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate(); // release worker resources per AGENTS.md safety rule
      resolve(result);
    };

    const onAbort = () =>
      finish(Err(createAppError('TRANSCRIPTION_CANCELLED', 'Transkripsi dibatalkan oleh pengguna.')));

    if (signal) {
      if (signal.aborted) {
        worker.terminate();
        resolve(Err(createAppError('TRANSCRIPTION_CANCELLED', 'Transkripsi dibatalkan oleh pengguna.')));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const id = `trans-req-${Date.now()}`;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;

      if (msg.type === 'PROGRESS') {
        onProgress?.(msg.percent, msg.stageMessage);
      } else if (msg.type === 'SUCCESS') {
        finish(Ok(msg.payload as TranscriptDocument));
      } else if (msg.type === 'ERROR') {
        finish(Err(createAppError(msg.errorCode, msg.errorMessage, { suggestedFallback: msg.suggestedFallback, retryable: true })));
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

    const buffer = pcm16kMono.buffer as ArrayBuffer;
    const request: StartTranscriptionRequest = {
      id,
      timestampUs: Date.now() * 1000,
      type: 'START_TRANSCRIPTION',
      projectId,
      audioBuffer: buffer,
      sampleRate: WHISPER_TARGET_SAMPLE_RATE,
      language,
      modelProfile,
    };
    worker.postMessage(request, [buffer]);
  });
}
