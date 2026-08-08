import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { TranscriptDocument, TranscriptSegment } from '@/domain/transcript/types';
import { estimateWordsFromText } from '@/domain/transcript/subtitle';
import { planTranscriptionRanges, UsRange, WHISPER_TARGET_SAMPLE_RATE } from './whisper';

// Optional cloud transcription provider (OPT-IN only). The app default stays
// 100% local per the privacy rules; this path exists for users who explicitly
// paste their own API key and accept that audio chunks are uploaded to the
// chosen provider for transcription. The key never leaves this browser's
// localStorage and is sent only to the provider endpoint below.

export type CloudProvider = 'groq' | 'openai';

export interface CloudTranscriptionConfig {
  enabled: boolean;
  provider: CloudProvider;
  apiKey: string;
}

const STORAGE_KEY = 'editflow-cloud-transcription';

export function loadCloudTranscriptionConfig(): CloudTranscriptionConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, provider: 'groq', apiKey: '' };
    const parsed = JSON.parse(raw) as Partial<CloudTranscriptionConfig>;
    return {
      enabled: parsed.enabled === true,
      provider: parsed.provider === 'openai' ? 'openai' : 'groq',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return { enabled: false, provider: 'groq', apiKey: '' };
  }
}

export function saveCloudTranscriptionConfig(config: CloudTranscriptionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export const CLOUD_PROVIDER_LABELS: Record<CloudProvider, string> = {
  groq: 'Groq (gratis, tercepat)',
  openai: 'OpenAI (berbayar)',
};

export const CLOUD_PROVIDER_ENDPOINTS: Record<CloudProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
};

export const CLOUD_PROVIDER_MODELS: Record<CloudProvider, string> = {
  groq: 'whisper-large-v3',
  openai: 'whisper-1',
};

/**
 * Upload cap per request: providers reject files above 25 MB. 16 kHz mono
 * 16-bit PCM is 32 KB/s, so 10 minutes ≈ 19.2 MB — safely under the limit.
 */
export const UPLOAD_CHUNK_MAX_US = 600_000_000;
const MAX_PARALLEL_UPLOADS = 3;

/**
 * Builds the 16-bit mono WAV byte layout (RIFF header + raw data) for the
 * given PCM samples. Pure and synchronous so it is unit-testable.
 */
export function pcmToWavBytes(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Wraps the WAV bytes into an uploadable Blob. */
export function pcmToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  return new Blob([pcmToWavBytes(pcm, sampleRate)], { type: 'audio/wav' });
}

/**
 * Merges consecutive planned ranges into upload groups that stay under the
 * per-request size cap (ranges themselves are ≤2 min, so groups stay ≤ cap).
 */
export function groupRangesForUpload(ranges: UsRange[], maxUs: number): UsRange[] {
  const out: UsRange[] = [];
  for (const range of ranges) {
    const last = out[out.length - 1];
    if (last && range.endUs - last.startUs <= maxUs) {
      last.endUs = range.endUs;
    } else {
      out.push({ ...range });
    }
  }
  return out;
}

interface ApiSegment {
  start?: number;
  end?: number;
  text?: string;
}

/**
 * Maps provider verbose_json segments into our TranscriptDocument. The API
 * only returns segment-level timing, so per-word timings are derived evenly
 * inside each segment (labeled 'estimated' downstream by design).
 */
export function apiSegmentsToTranscriptDocument(
  segments: ApiSegment[],
  projectId: string,
  language: string,
  modelId: string
): TranscriptDocument {
  const out: TranscriptSegment[] = [];

  for (const seg of segments) {
    const text = (seg.text ?? '').trim();
    if (!text || typeof seg.start !== 'number') continue;
    const startUs = Math.round(seg.start * 1_000_000);
    const endUs = Math.max(startUs + 1, Math.round((seg.end ?? seg.start) * 1_000_000));
    const estimated = estimateWordsFromText(text, startUs, endUs, `w-${out.length}`);
    out.push({
      id: `seg-${out.length + 1}`,
      startUs,
      endUs,
      text,
      words: estimated.map((w) => ({
        word: w.text,
        startUs: w.sourceStartUs,
        endUs: w.sourceEndUs,
      })),
    });
  }

  return {
    id: `trans-${Date.now()}`,
    projectId,
    language: language || 'id',
    modelId,
    segments: out,
  };
}

/**
 * Transcribes via the user's own cloud API key: audio is split into ≤10 min
 * WAV chunks (skipping silence via VAD ranges), uploaded in parallel (max 3),
 * and segment timestamps are rebased to global video time.
 */
export async function transcribeWithCloudApi(
  config: CloudTranscriptionConfig,
  projectId: string,
  language: string,
  pcm16kMono: Float32Array,
  speechSegments: UsRange[] | undefined,
  onProgress?: (percent: number, stageMessage: string) => void
): Promise<Result<TranscriptDocument>> {
  const totalUs = Math.round((pcm16kMono.length / WHISPER_TARGET_SAMPLE_RATE) * 1_000_000);
  const chunks = groupRangesForUpload(planTranscriptionRanges(speechSegments, totalUs), UPLOAD_CHUNK_MAX_US);
  if (chunks.length === 0) {
    return Ok(apiSegmentsToTranscriptDocument([], projectId, language, `cloud:${config.provider}`));
  }

  const providerLabel = CLOUD_PROVIDER_LABELS[config.provider];
  const perChunkSegments: ApiSegment[][] = chunks.map(() => []);
  const controller = new AbortController();
  let completed = 0;
  let nextIndex = 0;

  onProgress?.(2, `Mode cloud aktif (${providerLabel}): menyiapkan ${chunks.length} unggahan audio...`);

  const uploadWorker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex++;
      if (index >= chunks.length) return;
      const chunk = chunks[index];

      const startSample = Math.max(0, Math.floor((chunk.startUs / 1_000_000) * WHISPER_TARGET_SAMPLE_RATE));
      const endSample = Math.min(
        pcm16kMono.length,
        Math.ceil((chunk.endUs / 1_000_000) * WHISPER_TARGET_SAMPLE_RATE)
      );
      if (endSample <= startSample) {
        completed++;
        continue;
      }

      const form = new FormData();
      form.append('file', pcmToWavBlob(pcm16kMono.subarray(startSample, endSample), WHISPER_TARGET_SAMPLE_RATE), 'audio.wav');
      form.append('model', CLOUD_PROVIDER_MODELS[config.provider]);
      form.append('response_format', 'verbose_json');
      if (language === 'id' || language === 'en') form.append('language', language);

      const res = await fetch(CLOUD_PROVIDER_ENDPOINTS[config.provider], {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) {
          throw new Error('API key ditolak oleh provider (401/403). Periksa kembali key di Pengaturan.');
        }
        if (res.status === 413 || res.status === 400) {
          throw new Error(`Unggahan audio ditolak (${res.status}). Coba lagi atau pakai mode lokal.`);
        }
        if (res.status === 429) {
          throw new Error('Batas rate provider tercapai (429). Tunggu sebentar atau kurangi paralelisme.');
        }
        throw new Error(`Provider menolak permintaan (${res.status}): ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as { segments?: ApiSegment[] };
      perChunkSegments[index] = json.segments ?? [];

      completed++;
      onProgress?.(
        5 + Math.round((completed / chunks.length) * 90),
        `Transkripsi cloud ${completed}/${chunks.length} bagian via ${providerLabel}...`
      );
    }
  };

  try {
    const lanes = Array.from(
      { length: Math.min(MAX_PARALLEL_UPLOADS, chunks.length) },
      () => uploadWorker()
    );
    await Promise.all(lanes);
  } catch (err: any) {
    controller.abort();
    if (err?.name === 'AbortError') {
      return Err(createAppError('TRANSCRIPTION_CANCELLED', 'Transkripsi dibatalkan oleh pengguna.'));
    }
    return Err(
      createAppError('CLOUD_TRANSCRIPTION_FAILED', `Transkripsi cloud gagal: ${err?.message || err}`, {
        suggestedFallback:
          'Periksa API key dan koneksi internet di Pengaturan, atau matikan mode cloud untuk kembali ke transkripsi lokal.',
        retryable: true,
      })
    );
  }

  // Rebase chunk-local segment timestamps to global video time, then sort.
  const globalSegments: ApiSegment[] = [];
  perChunkSegments.forEach((segs, i) => {
    const offsetSec = chunks[i].startUs / 1_000_000;
    for (const seg of segs) {
      globalSegments.push({
        ...seg,
        start: typeof seg.start === 'number' ? seg.start + offsetSec : seg.start,
        end: typeof seg.end === 'number' ? seg.end + offsetSec : seg.end,
      });
    }
  });
  globalSegments.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  onProgress?.(100, 'Transkripsi cloud selesai.');
  return Ok(
    apiSegmentsToTranscriptDocument(
      globalSegments,
      projectId,
      language,
      `cloud:${config.provider}:${CLOUD_PROVIDER_MODELS[config.provider]}`
    )
  );
}
