import { Result, Ok, Err, createAppError } from '@/domain/common/Result';

export interface LocalEngineStatus {
  online: boolean;
  service?: string;
  port?: number;
  message: string;
}

export interface ProcessUrlResult {
  file: File;
  streamUrl: string;
}

const LOCAL_ENGINE_URL = 'http://127.0.0.1:8000';

/**
 * Checks if EditFlow Python Local Engine is running on localhost:8000
 */
export async function checkLocalEngineStatus(): Promise<LocalEngineStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${LOCAL_ENGINE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        service: data.service || 'EditFlow Python Local Engine',
        port: data.port || 8000,
        message: 'EditFlow Local Engine Aktif (localhost:8000)',
      };
    }
  } catch (e) {
    // Engine offline or not running
  }

  return {
    online: false,
    message: 'EditFlow Local Engine Tidak Aktif (Gunakan File Lokal)',
  };
}

/**
 * Sends video URL to Local Python Engine for local downloading and processing.
 */
export async function processVideoUrlWithLocalEngine(
  url: string
): Promise<Result<ProcessUrlResult>> {
  try {
    const res = await fetch(`${LOCAL_ENGINE_URL}/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Gagal memproses URL' }));
      return Err(createAppError('ENGINE_URL_FAILED', errData.detail || 'Gagal memproses URL video'));
    }

    const data = await res.json();
    const streamUrl = data.stream_url;

    // Fetch local stream file and convert to browser File object
    const mediaRes = await fetch(streamUrl);
    const blob = await mediaRes.blob();
    const file = new File([blob], data.filename || 'local_video.mp4', { type: 'video/mp4' });

    return Ok({
      file,
      streamUrl,
    });
  } catch (err: any) {
    return Err(
      createAppError(
        'ENGINE_CONNECTION_ERROR',
        `Gagal terhubung ke Local Engine di localhost:8000: ${err?.message || 'Pastikan Python engine aktif'}`
      )
    );
  }
}
