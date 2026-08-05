export interface SystemCapabilityReport {
  videoDecoder: { supported: boolean; statusText: string };
  videoEncoder: { supported: boolean; statusText: string };
  audioDecoder: { supported: boolean; statusText: string };
  audioEncoder: { supported: boolean; statusText: string };
  webGpu: { supported: boolean; statusText: string };
  opfs: { supported: boolean; statusText: string };
  storageQuota: { supported: boolean; quotaMb?: number; usageMb?: number; statusText: string };
  crossOriginIsolated: { supported: boolean; statusText: string };
  overallStatus: 'ready' | 'ready_fallback' | 'unsupported';
}

export async function checkSystemCapability(): Promise<SystemCapabilityReport> {
  const hasVideoDecoder = typeof window !== 'undefined' && 'VideoDecoder' in window;
  const hasVideoEncoder = typeof window !== 'undefined' && 'VideoEncoder' in window;
  const hasAudioDecoder = typeof window !== 'undefined' && 'AudioDecoder' in window;
  const hasAudioEncoder = typeof window !== 'undefined' && 'AudioEncoder' in window;

  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const hasOpfs = typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
  const isIsolated = typeof self !== 'undefined' && Boolean(self.crossOriginIsolated);

  let storageInfo = { supported: false, quotaMb: 0, usageMb: 0, statusText: 'Pemeriksaan storage tidak tersedia' };
  if (typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      const quotaMb = Math.round((estimate.quota || 0) / (1024 * 1024));
      const usageMb = Math.round((estimate.usage || 0) / (1024 * 1024));
      storageInfo = {
        supported: true,
        quotaMb,
        usageMb,
        statusText: `Tersedia: ${(quotaMb - usageMb).toLocaleString()} MB dari ${quotaMb.toLocaleString()} MB`,
      };
    } catch (e) {
      storageInfo.statusText = 'Gagal mengukur kuota penyimpan lokal';
    }
  }

  const report: SystemCapabilityReport = {
    videoDecoder: {
      supported: hasVideoDecoder,
      statusText: hasVideoDecoder ? 'WebCodecs VideoDecoder Siap' : 'VideoDecoder tidak didukung peramban ini',
    },
    videoEncoder: {
      supported: hasVideoEncoder,
      statusText: hasVideoEncoder ? 'WebCodecs VideoEncoder Siap' : 'VideoEncoder tidak didukung peramban ini',
    },
    audioDecoder: {
      supported: hasAudioDecoder,
      statusText: hasAudioDecoder ? 'WebCodecs AudioDecoder Siap' : 'AudioDecoder tidak didukung peramban ini',
    },
    audioEncoder: {
      supported: hasAudioEncoder,
      statusText: hasAudioEncoder ? 'WebCodecs AudioEncoder Siap' : 'AudioEncoder tidak didukung peramban ini',
    },
    webGpu: {
      supported: hasWebGpu,
      statusText: hasWebGpu ? 'WebGPU Siap (Akselerasi AI)' : 'WebGPU tidak aktif (Memakai WASM fallback)',
    },
    opfs: {
      supported: hasOpfs,
      statusText: hasOpfs ? 'Origin Private File System (OPFS) Siap' : 'OPFS tidak didukung',
    },
    storageQuota: storageInfo,
    crossOriginIsolated: {
      supported: isIsolated,
      statusText: isIsolated ? 'Cross-Origin Isolated (High Performance Timers & SAB)' : 'Standard Isolation',
    },
    overallStatus: 'unsupported',
  };

  if (hasVideoDecoder && hasAudioDecoder) {
    if (hasVideoEncoder && hasAudioEncoder && hasWebGpu && hasOpfs) {
      report.overallStatus = 'ready';
    } else {
      report.overallStatus = 'ready_fallback';
    }
  } else {
    report.overallStatus = 'unsupported';
  }

  return report;
}
