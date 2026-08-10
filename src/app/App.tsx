import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type PreviewState = 'idle' | 'loading' | 'playing';
type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

interface SttSettings {
  baseUrl: string;
  apiKey: string;
  apiFormat: 'openai' | 'gemini' | 'custom';
  provider: string;
  model: string;
  language: string;
  timestamps: 'segment' | 'word';
}

const DEFAULT_STT_SETTINGS: SttSettings = {
  baseUrl: '',
  apiKey: '',
  apiFormat: 'openai',
  provider: '',
  model: '',
  language: 'id',
  timestamps: 'segment',
};

const STT_PROVIDER_SUGGESTIONS = ['Gemini', 'OpenAI', 'Groq', 'OpenRouter', '9Router', 'Deepgram', 'AssemblyAI', 'Hugging Face', 'NVIDIA Parakeet'];

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OUTPUT_VIDEO_BITRATE = 16_000_000;
const OUTPUT_AUDIO_BITRATE = 192_000;

const createFaceLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numFaces: 4,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' as const },
    });
  }
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSharpPortraitSize = (sourceWidth: number, sourceHeight: number) => {
  const targetAspect = 9 / 16;
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > targetAspect) {
    const height = Math.max(2, Math.floor(Math.min(OUTPUT_HEIGHT, sourceHeight) / 2) * 2);
    const width = Math.max(2, Math.floor((height * targetAspect) / 2) * 2);
    return { width, height };
  }

  const width = Math.max(2, Math.floor(Math.min(OUTPUT_WIDTH, sourceWidth) / 2) * 2);
  const height = Math.max(2, Math.floor((width / targetAspect) / 2) * 2);
  return { width, height };
};

const FilmIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
);

const ScissorsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.7 8.3 11.3 8.2M8.7 15.7 20 7.5"/></svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.04H5.3v-3h.14A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
);

export const App: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const previewAnimationRef = useRef<number | null>(null);
  const previewFocusRef = useRef({ x: 0.5, y: 0.44, frame: 0 });
  const cancelExportRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [clipDuration, setClipDuration] = useState(30);
  const [dragging, setDragging] = useState(false);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [exportLabel, setExportLabel] = useState('Menyiapkan video…');
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [sttSettings, setSttSettings] = useState<SttSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('khanclip-stt-settings') || '{}');
      return { ...DEFAULT_STT_SETTINGS, ...saved, apiKey: sessionStorage.getItem('khanclip-stt-api-key') || '' };
    } catch {
      return DEFAULT_STT_SETTINGS;
    }
  });

  const end = useMemo(() => Math.min(duration, start + clipDuration), [duration, start, clipDuration]);
  const actualDuration = Math.max(0, end - start);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (previewAnimationRef.current !== null) cancelAnimationFrame(previewAnimationRef.current);
    previewLandmarkerRef.current?.close();
  }, [sourceUrl]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  const saveSttSettings = (event: React.FormEvent) => {
    event.preventDefault();
    const { apiKey, ...safeSettings } = sttSettings;
    localStorage.setItem('khanclip-stt-settings', JSON.stringify(safeSettings));
    if (apiKey) sessionStorage.setItem('khanclip-stt-api-key', apiKey);
    else sessionStorage.removeItem('khanclip-stt-api-key');
    setSettingsOpen(false);
  };

  const testSttConnection = async () => {
    setConnectionState('testing');
    setConnectionMessage('Menghubungkan ke API…');
    try {
      const baseUrl = sttSettings.baseUrl.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Endpoint harus dimulai dengan http:// atau https://.');
      const isGemini = sttSettings.apiFormat === 'gemini';
      const testUrl = isGemini
        ? `${baseUrl}/models${sttSettings.apiKey ? `?key=${encodeURIComponent(sttSettings.apiKey)}` : ''}`
        : sttSettings.apiFormat === 'openai' ? `${baseUrl}/models` : baseUrl;
      const response = await fetch(testUrl, {
        headers: !isGemini && sttSettings.apiKey ? { Authorization: `Bearer ${sttSettings.apiKey}` } : {},
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('API key ditolak oleh provider.');
        throw new Error(`API merespons dengan status ${response.status}.`);
      }
      setConnectionState('success');
      setConnectionMessage(sttSettings.apiFormat === 'custom'
        ? 'Endpoint dapat dijangkau. Validasi API key untuk format custom dilakukan saat transkripsi.'
        : 'Terhubung. Endpoint dan API key dapat digunakan.');
    } catch (caught) {
      setConnectionState('error');
      const detail = caught instanceof Error ? caught.message : 'Koneksi gagal.';
      setConnectionMessage(`${detail} Pastikan endpoint benar dan provider mengizinkan akses browser (CORS).`);
    }
  };

  const loadFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('video/')) {
      setError('File tidak dikenali sebagai video. Pilih MP4, WebM, MOV, atau format video lain yang didukung browser.');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const nextUrl = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setSourceUrl(nextUrl);
    setDuration(0);
    setStart(0);
    setClipDuration(30);
    setProgress(0);
    setExportState('idle');
    setPreviewState('idle');
    setError('');
  };

  const updateStart = (value: number) => {
    const maxStart = Math.max(0, duration - 0.1);
    setStart(clamp(Number.isFinite(value) ? value : 0, 0, maxStart));
    setExportState('idle');
  };

  const updateClipDuration = (value: number) => {
    const available = Math.max(0.1, duration - start);
    setClipDuration(clamp(Number.isFinite(value) ? value : 0.1, 0.1, available));
    setExportState('idle');
  };

  const stopPreview = () => {
    const video = videoRef.current;
    video?.pause();
    if (previewAnimationRef.current !== null) {
      cancelAnimationFrame(previewAnimationRef.current);
      previewAnimationRef.current = null;
    }
    setPreviewState('idle');
  };

  const previewFromStart = async () => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    setError('');
    setPreviewState('loading');

    try {
      if (!previewLandmarkerRef.current) previewLandmarkerRef.current = await createFaceLandmarker();
      video.currentTime = start;
      previewFocusRef.current = { x: 0.5, y: 0.44, frame: 0 };
      await video.play();
      setPreviewState('playing');

      const drawPreview = () => {
        if (video.paused || video.ended || video.currentTime >= end) {
          video.pause();
          video.currentTime = start;
          setPreviewState('idle');
          previewAnimationRef.current = null;
          return;
        }

        const focus = previewFocusRef.current;
        if (focus.frame % 5 === 0 && previewLandmarkerRef.current) {
          const result = previewLandmarkerRef.current.detectForVideo(video, performance.now());
          let bestScore = -1;
          result.faceLandmarks.forEach((landmarks, faceIndex) => {
            if (!landmarks.length) return;
            const xs = landmarks.map((point) => point.x);
            const ys = landmarks.map((point) => point.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const faceArea = Math.max(0, (maxX - minX) * (maxY - minY));
            const jawOpen = result.faceBlendshapes[faceIndex]?.categories.find(
              (category) => category.categoryName === 'jawOpen'
            )?.score ?? 0;
            const score = jawOpen * 2.4 + faceArea;
            if (score > bestScore) {
              bestScore = score;
              focus.x += (((minX + maxX) / 2) - focus.x) * 0.22;
              focus.y += ((Math.max(0.2, (minY + maxY) / 2 - (maxY - minY) * 0.12)) - focus.y) * 0.16;
            }
          });
        }

        const targetAspect = 9 / 16;
        const sourceAspect = video.videoWidth / video.videoHeight;
        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;
        if (sourceAspect > targetAspect) sourceWidth = sourceHeight * targetAspect;
        else sourceHeight = sourceWidth / targetAspect;
        const sourceX = clamp(focus.x * video.videoWidth - sourceWidth / 2, 0, video.videoWidth - sourceWidth);
        const sourceY = clamp(focus.y * video.videoHeight - sourceHeight / 2, 0, video.videoHeight - sourceHeight);
        context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        focus.frame += 1;
        previewAnimationRef.current = requestAnimationFrame(drawPreview);
      };
      drawPreview();
    } catch (caught) {
      setPreviewState('idle');
      setError(caught instanceof Error ? `Preview gagal: ${caught.message}` : 'Preview gagal dimuat. Periksa koneksi lalu coba lagi.');
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime >= end) {
      video.pause();
      video.currentTime = start;
    }
  };

  const exportClip = async () => {
    const preview = videoRef.current;
    if (!preview || !file || actualDuration <= 0) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('Browser ini belum mendukung ekspor video. Gunakan Chrome atau Edge versi terbaru.');
      setExportState('error');
      return;
    }

    setError('');
    setProgress(0);
    setExportState('exporting');
    setExportLabel('Memuat pelacak wajah…');
    cancelExportRef.current = false;

    const renderVideo = document.createElement('video');
    renderVideo.src = sourceUrl;
    renderVideo.preload = 'auto';
    renderVideo.playsInline = true;
    renderVideo.crossOrigin = 'anonymous';

    let faceLandmarker: FaceLandmarker | null = null;
    try {
      faceLandmarker = await createFaceLandmarker();
      setExportLabel('Mendeteksi wajah pembicara…');
      await new Promise<void>((resolve, reject) => {
        renderVideo.onloadedmetadata = () => resolve();
        renderVideo.onerror = () => reject(new Error('Video gagal dibaca oleh browser.'));
        renderVideo.load();
      });

      const canvas = document.createElement('canvas');
      const sharpOutputSize = getSharpPortraitSize(renderVideo.videoWidth, renderVideo.videoHeight);
      canvas.width = sharpOutputSize.width;
      canvas.height = sharpOutputSize.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas video tidak tersedia.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const canvasStream = canvas.captureStream(30);
      const sourceStream = (renderVideo as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

      const candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: OUTPUT_VIDEO_BITRATE,
        audioBitsPerSecond: OUTPUT_AUDIO_BITRATE,
        ...(mimeType ? { mimeType } : {}),
      };
      const recorder = new MediaRecorder(canvasStream, recorderOptions);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

      await new Promise<void>((resolve) => {
        renderVideo.onseeked = () => resolve();
        renderVideo.currentTime = start;
      });

      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('Proses perekaman klip gagal.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      });

      recorder.start(500);
      await renderVideo.play();
      const startedAt = performance.now();
      let frameIndex = 0;
      let focusX = 0.5;
      let focusY = 0.44;

      await new Promise<void>((resolve) => {
        const draw = () => {
          if (cancelExportRef.current || renderVideo.currentTime >= end || renderVideo.ended) {
            renderVideo.pause();
            resolve();
            return;
          }
          if (frameIndex % 5 === 0 && faceLandmarker) {
            const result = faceLandmarker.detectForVideo(renderVideo, frameIndex * (1000 / 30));
            let bestScore = -1;
            result.faceLandmarks.forEach((landmarks, faceIndex) => {
              if (!landmarks.length) return;
              const xs = landmarks.map((point) => point.x);
              const ys = landmarks.map((point) => point.y);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const minY = Math.min(...ys);
              const maxY = Math.max(...ys);
              const faceArea = Math.max(0, (maxX - minX) * (maxY - minY));
              const jawOpen = result.faceBlendshapes[faceIndex]?.categories.find(
                (category) => category.categoryName === 'jawOpen'
              )?.score ?? 0;
              const score = jawOpen * 2.4 + faceArea;
              if (score > bestScore) {
                bestScore = score;
                const targetX = (minX + maxX) / 2;
                const targetY = Math.max(0.2, (minY + maxY) / 2 - (maxY - minY) * 0.12);
                focusX += (targetX - focusX) * 0.22;
                focusY += (targetY - focusY) * 0.16;
              }
            });
          }

          const targetAspect = 9 / 16;
          const sourceAspect = renderVideo.videoWidth / renderVideo.videoHeight;
          let sourceWidth = renderVideo.videoWidth;
          let sourceHeight = renderVideo.videoHeight;
          if (sourceAspect > targetAspect) sourceWidth = sourceHeight * targetAspect;
          else sourceHeight = sourceWidth / targetAspect;
          const sourceX = clamp(focusX * renderVideo.videoWidth - sourceWidth / 2, 0, renderVideo.videoWidth - sourceWidth);
          const sourceY = clamp(focusY * renderVideo.videoHeight - sourceHeight / 2, 0, renderVideo.videoHeight - sourceHeight);
          context.drawImage(renderVideo, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          frameIndex += 1;
          setProgress(clamp(((performance.now() - startedAt) / 1000 / actualDuration) * 100, 0, 99));
          requestAnimationFrame(draw);
        };
        draw();
      });

      recorder.stop();
      const blob = await finished;
      canvasStream.getTracks().forEach((track) => track.stop());
      if (cancelExportRef.current) {
        setExportState('idle');
        setProgress(0);
        return;
      }

      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const outputUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
      link.href = outputUrl;
      link.download = `${baseName}_clip_${Math.floor(start)}-${Math.floor(end)}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(outputUrl), 1000);
      setProgress(100);
      setExportState('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Klip gagal diekspor. Coba gunakan video MP4 di Chrome atau Edge terbaru.');
      setExportState('error');
    } finally {
      faceLandmarker?.close();
      renderVideo.remove();
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => window.location.reload()} aria-label="Muat ulang KHAN CLIP">
          <span className="brand-mark"><FilmIcon /></span>
          <span>KHAN CLIP</span>
        </button>
        <div className="header-actions">
          <span className="local-note"><span className="status-dot" />Diproses lokal</span>
          <button className="icon-button" type="button" onClick={() => { setSettingsOpen(true); setConnectionState('idle'); }} aria-label="Buka pengaturan"><SettingsIcon /></button>
        </div>
      </header>

      <main className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">Buat klip TikTok otomatis</h1>
          <p>Pilih durasi. KHAN CLIP membuat video 9:16 dan mengikuti wajah pembicara.</p>
        </section>

        {!file ? (
          <section
            className={`upload-zone${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}
            aria-labelledby="upload-title"
          >
            <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
            <span className="upload-icon"><UploadIcon /></span>
            <h2 id="upload-title">Pilih video untuk dipotong</h2>
            <p>Tarik video ke sini, atau pilih file dari perangkat Anda.</p>
            <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>Pilih video</button>
            <span className="file-support">Video diproses di perangkat Anda</span>
          </section>
        ) : (
          <section className="editor-card">
            <div className="section-head">
              <span className="step-number">1</span>
              <div><h2>Video Anda</h2><p>Putar video untuk mencari bagian yang ingin dipotong.</p></div>
            </div>
            <div className="preview-panel">
              <div className="preview-grid">
                <div><span className="preview-label">VIDEO ASLI</span><div className="video-frame">
                <video ref={videoRef} src={sourceUrl} controls playsInline onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration;
                  setDuration(nextDuration);
                  setClipDuration(Math.min(30, nextDuration));
                }} /></div></div>
                <div><span className="preview-label">HASIL TIKTOK · 9:16</span><div className="tiktok-frame">
                  <canvas ref={previewCanvasRef} width={1080} height={1920} aria-label="Preview vertikal hasil tracking wajah" />
                  {previewState === 'idle' && <span className="preview-placeholder">Klik “Lihat preview” untuk menampilkan hasil</span>}
                  {previewState === 'loading' && <span className="preview-placeholder">Memuat pelacak wajah…</span>}
                </div></div>
              </div>
              <div className="file-row">
                <div className="file-copy"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · Durasi {formatTime(duration)}</span></div>
                <button className="button button-quiet" type="button" onClick={() => inputRef.current?.click()}>Ganti video</button>
                <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
              </div>
            </div>

            <div className="control-panel" aria-labelledby="clip-settings-title">
              <div className="section-head">
                <span className="step-number">2</span>
                <div><h2 id="clip-settings-title">Atur potongan</h2><p>Hasil otomatis 9:16 dengan resolusi tajam hingga 1080 × 1920.</p></div>
              </div>

              <div className="control-grid">
                <div className="field-group">
                  <label htmlFor="start-time">Mulai pada detik</label>
                  <div className="number-field"><input id="start-time" type="number" min="0" max={Math.max(0, duration - 0.1)} step="0.1" value={Number(start.toFixed(1))} onChange={(e) => updateStart(Number(e.target.value))} /><span>detik</span></div>
                  <input className="timeline" aria-label="Waktu mulai klip" type="range" min="0" max={Math.max(0.1, duration - 0.1)} step="0.1" value={start} onChange={(e) => updateStart(Number(e.target.value))} />
                </div>

                <div className="field-group">
                  <label htmlFor="clip-duration">Panjang video</label>
                  <div className="number-field"><input id="clip-duration" type="number" min="0.1" max={Math.max(0.1, duration - start)} step="0.1" value={Number(clipDuration.toFixed(1))} onChange={(e) => updateClipDuration(Number(e.target.value))} /><span>detik</span></div>
                  <div className="presets" aria-label="Pilihan cepat durasi">
                    {[15, 30, 60].map((value) => <button key={value} type="button" disabled={value > duration - start} className={Math.abs(clipDuration - value) < 0.05 ? 'is-active' : ''} onClick={() => updateClipDuration(value)}>{value} detik</button>)}
                  </div>
                </div>
              </div>

              <div className="clip-summary">
                <span><small>Potongan</small><strong>{formatTime(start)} — {formatTime(end)}</strong></span>
                <span className="duration-badge">{actualDuration.toFixed(1)} detik</span>
              </div>

              {error && <p className="error-message" role="alert">{error}</p>}
              {exportState === 'exporting' && <div className="progress-wrap" aria-live="polite"><div className="progress-meta"><span>{exportLabel}</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ transform: `scaleX(${progress / 100})` }} /></div></div>}
              {exportState === 'done' && <p className="success-message" role="status">Klip selesai dan sudah diunduh.</p>}

              <div className="actions">
                {previewState === 'playing' ? (
                  <button className="button button-secondary" type="button" onClick={stopPreview}>Hentikan preview</button>
                ) : (
                  <button className="button button-secondary" type="button" onClick={previewFromStart} disabled={!duration || exportState === 'exporting' || previewState === 'loading'}>{previewState === 'loading' ? 'Memuat preview…' : 'Lihat preview'}</button>
                )}
                {exportState === 'exporting' ? (
                  <button className="button button-danger" type="button" onClick={() => { cancelExportRef.current = true; }}>Batalkan</button>
                ) : (
                  <button className="button button-primary" type="button" onClick={exportClip} disabled={!duration}><ScissorsIcon />Potong dan unduh</button>
                )}
              </div>
              <p className="export-note">Resolusi mengikuti detail asli crop agar video tidak diperbesar dan menjadi buram. Maksimal 1080 × 1920.</p>
            </div>
          </section>
        )}
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-header">
              <div><p className="settings-kicker">PENGATURAN</p><h2 id="settings-title">Speech-to-Text</h2><p>Hubungkan penyedia AI yang ingin Anda gunakan.</p></div>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Tutup pengaturan"><CloseIcon /></button>
            </header>

            <form className="settings-form" onSubmit={saveSttSettings}>
              <div className="settings-field settings-field-wide">
                <label htmlFor="stt-endpoint">API endpoint</label>
                <input id="stt-endpoint" type="url" value={sttSettings.baseUrl} onChange={(event) => setSttSettings({ ...sttSettings, baseUrl: event.target.value })} placeholder="https://… atau http://localhost:…" required />
                <small>Isi endpoint dari Gemini, OpenAI, Groq, OpenRouter, 9Router, atau provider lain.</small>
              </div>

              <div className="settings-field settings-field-wide">
                <label htmlFor="stt-key">API key</label>
                <div className="secret-field"><input id="stt-key" type={showApiKey ? 'text' : 'password'} value={sttSettings.apiKey} onChange={(event) => setSttSettings({ ...sttSettings, apiKey: event.target.value })} autoComplete="off" placeholder="sk-…" /><button type="button" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? 'Sembunyikan' : 'Tampilkan'}</button></div>
                <small>Disimpan hanya selama sesi browser dan tidak dimasukkan ke GitHub.</small>
              </div>

              <div className="settings-field settings-field-wide">
                <label htmlFor="stt-format">Format API</label>
                <select id="stt-format" value={sttSettings.apiFormat} onChange={(event) => setSttSettings({ ...sttSettings, apiFormat: event.target.value as SttSettings['apiFormat'] })}>
                  <option value="openai">OpenAI-compatible (OpenAI, Groq, OpenRouter, 9Router)</option>
                  <option value="gemini">Gemini native</option>
                  <option value="custom">Custom / provider lainnya</option>
                </select>
              </div>

              <div className="settings-field">
                <label htmlFor="stt-provider">Nama provider</label>
                <input id="stt-provider" type="text" list="stt-provider-options" value={sttSettings.provider} onChange={(event) => setSttSettings({ ...sttSettings, provider: event.target.value })} placeholder="Contoh: Gemini" required />
                <datalist id="stt-provider-options">{STT_PROVIDER_SUGGESTIONS.map((provider) => <option key={provider} value={provider} />)}</datalist>
              </div>

              <div className="settings-field">
                <label htmlFor="stt-model">Model ID</label>
                <input id="stt-model" type="text" value={sttSettings.model} onChange={(event) => setSttSettings({ ...sttSettings, model: event.target.value })} placeholder="ID model dari provider" required />
              </div>

              <div className="settings-field">
                <label htmlFor="stt-language">Bahasa audio</label>
                <select id="stt-language" value={sttSettings.language} onChange={(event) => setSttSettings({ ...sttSettings, language: event.target.value })}>
                  <option value="auto">Deteksi otomatis</option><option value="id">Bahasa Indonesia</option><option value="en">English</option>
                </select>
              </div>

              <div className="settings-field">
                <label htmlFor="stt-timestamps">Timestamp subtitle</label>
                <select id="stt-timestamps" value={sttSettings.timestamps} onChange={(event) => setSttSettings({ ...sttSettings, timestamps: event.target.value as SttSettings['timestamps'] })}>
                  <option value="segment">Per kalimat (lebih ringan)</option><option value="word">Per kata (lebih detail)</option>
                </select>
              </div>

              {connectionState !== 'idle' && <p className={`connection-message is-${connectionState}`} role="status">{connectionMessage}</p>}

              <footer className="settings-actions">
                <button className="button button-secondary" type="button" onClick={testSttConnection} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Menguji…' : 'Tes koneksi'}</button>
                <button className="button button-primary" type="submit">Simpan pengaturan</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
