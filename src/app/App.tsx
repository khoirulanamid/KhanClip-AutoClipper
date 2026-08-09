import React, { useEffect, useMemo, useRef, useState } from 'react';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const FilmIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
);

const ScissorsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.7 8.3 11.3 8.2M8.7 15.7 20 7.5"/></svg>
);

export const App: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const end = useMemo(() => Math.min(duration, start + clipDuration), [duration, start, clipDuration]);
  const actualDuration = Math.max(0, end - start);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

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

  const previewFromStart = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = start;
    try { await video.play(); } catch { /* Browser may still require another user gesture. */ }
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
    cancelExportRef.current = false;

    const renderVideo = document.createElement('video');
    renderVideo.src = sourceUrl;
    renderVideo.preload = 'auto';
    renderVideo.playsInline = true;
    renderVideo.crossOrigin = 'anonymous';

    try {
      await new Promise<void>((resolve, reject) => {
        renderVideo.onloadedmetadata = () => resolve();
        renderVideo.onerror = () => reject(new Error('Video gagal dibaca oleh browser.'));
        renderVideo.load();
      });

      const scale = Math.min(1, 1920 / renderVideo.videoWidth, 1080 / renderVideo.videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.floor(renderVideo.videoWidth * scale / 2) * 2);
      canvas.height = Math.max(2, Math.floor(renderVideo.videoHeight * scale / 2) * 2);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas video tidak tersedia.');

      const canvasStream = canvas.captureStream(30);
      const sourceStream = (renderVideo as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

      const candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
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

      await new Promise<void>((resolve) => {
        const draw = () => {
          if (cancelExportRef.current || renderVideo.currentTime >= end || renderVideo.ended) {
            renderVideo.pause();
            resolve();
            return;
          }
          context.drawImage(renderVideo, 0, 0, canvas.width, canvas.height);
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
        <span className="local-note"><span className="status-dot" />Diproses lokal</span>
      </header>

      <main className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">VIDEO CLIPPER</p>
          <h1 id="page-title">Potong video. Tepat sesuai durasi.</h1>
          <p>Pilih bagian yang dibutuhkan, periksa hasilnya, lalu ekspor. Tanpa subtitle, analisis, atau pengaturan yang mengganggu.</p>
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
            <h2 id="upload-title">Masukkan video</h2>
            <p>Tarik file ke sini atau pilih dari perangkat. File tidak diunggah ke server.</p>
            <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>Pilih video</button>
            <span className="file-support">MP4, WebM, MOV · sesuai dukungan browser</span>
          </section>
        ) : (
          <section className="editor-grid">
            <div className="preview-panel">
              <div className="video-frame">
                <video ref={videoRef} src={sourceUrl} controls playsInline onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration;
                  setDuration(nextDuration);
                  setClipDuration(Math.min(30, nextDuration));
                }} />
              </div>
              <div className="file-row">
                <div className="file-copy"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · {formatTime(duration)}</span></div>
                <button className="button button-quiet" type="button" onClick={() => inputRef.current?.click()}>Ganti video</button>
                <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
              </div>
            </div>

            <aside className="control-panel" aria-labelledby="clip-settings-title">
              <div className="panel-heading">
                <span className="step-label">PENGATURAN KLIP</span>
                <h2 id="clip-settings-title">Tentukan bagian video</h2>
              </div>

              <div className="field-group">
                <label htmlFor="start-time">Mulai dari</label>
                <div className="number-field"><input id="start-time" type="number" min="0" max={Math.max(0, duration - 0.1)} step="0.1" value={Number(start.toFixed(1))} onChange={(e) => updateStart(Number(e.target.value))} /><span>detik</span></div>
                <input className="timeline" aria-label="Waktu mulai klip" type="range" min="0" max={Math.max(0.1, duration - 0.1)} step="0.1" value={start} onChange={(e) => updateStart(Number(e.target.value))} />
              </div>

              <div className="field-group">
                <label htmlFor="clip-duration">Durasi klip</label>
                <div className="number-field"><input id="clip-duration" type="number" min="0.1" max={Math.max(0.1, duration - start)} step="0.1" value={Number(clipDuration.toFixed(1))} onChange={(e) => updateClipDuration(Number(e.target.value))} /><span>detik</span></div>
                <div className="presets" aria-label="Pilihan cepat durasi">
                  {[15, 30, 60].map((value) => <button key={value} type="button" disabled={value > duration - start} className={Math.abs(clipDuration - value) < 0.05 ? 'is-active' : ''} onClick={() => updateClipDuration(value)}>{value} dtk</button>)}
                </div>
              </div>

              <div className="clip-summary">
                <span><small>Mulai</small><strong>{formatTime(start)}</strong></span>
                <span className="summary-line" />
                <span><small>Selesai</small><strong>{formatTime(end)}</strong></span>
                <span className="duration-badge">{actualDuration.toFixed(1)} dtk</span>
              </div>

              {error && <p className="error-message" role="alert">{error}</p>}
              {exportState === 'exporting' && <div className="progress-wrap" aria-live="polite"><div className="progress-meta"><span>Mengekspor klip…</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ transform: `scaleX(${progress / 100})` }} /></div></div>}
              {exportState === 'done' && <p className="success-message" role="status">Klip selesai dan sudah diunduh.</p>}

              <div className="actions">
                <button className="button button-secondary" type="button" onClick={previewFromStart} disabled={!duration || exportState === 'exporting'}>Pratinjau</button>
                {exportState === 'exporting' ? (
                  <button className="button button-danger" type="button" onClick={() => { cancelExportRef.current = true; }}>Batalkan</button>
                ) : (
                  <button className="button button-primary" type="button" onClick={exportClip} disabled={!duration}><ScissorsIcon />Ekspor klip</button>
                )}
              </div>
              <p className="export-note">Ekspor berjalan secara real-time untuk menjaga kompatibilitas audio dan video.</p>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
};
