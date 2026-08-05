import React, { useEffect, useRef, useState } from 'react';
import { checkLocalEngineStatus, processVideoUrlWithLocalEngine, LocalEngineStatus } from '@/infrastructure/engine/localhost';

interface LandingPageProps {
  onSelectFile: (file: File) => void;
  onNavigateToCompat: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectFile, onNavigateToCompat }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [engineStatus, setEngineStatus] = useState<LocalEngineStatus>({
    online: false,
    message: 'Memeriksa status Local Engine...',
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const pollStatus = async () => {
      const status = await checkLocalEngineStatus();
      setEngineStatus(status);
      if (!status.online) {
        timer = setTimeout(pollStatus, 3000);
      }
    };
    pollStatus();
    return () => clearTimeout(timer);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSelectFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleProcessUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    if (!engineStatus.online) {
      setUrlError('EditFlow Local Engine sedang offline. Klik tombol "⚡ Auto-Aktifkan Engine" di bawah untuk mengaktifkannya secara otomatis.');
      return;
    }

    setLoadingUrl(true);
    setUrlError(null);

    const res = await processVideoUrlWithLocalEngine(videoUrl.trim());
    setLoadingUrl(false);

    if (res.success) {
      onSelectFile(res.value.file);
    } else {
      setUrlError(res.error.message);
    }
  };

  const handleDownloadBootstrapper = () => {
    const text = `@echo off
title EditFlow 1-Click Auto Engine Bootstrapper
echo ===================================================
echo   EditFlow 1-Click Auto Engine Bootstrapper
echo ===================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0engine\\auto_installer.ps1"
echo.
echo [1/2] Memasang dependensi Python (FastAPI, Uvicorn, yt-dlp)...
cd /d "%~dp0engine"
python -m pip install -r requirements.txt
echo.
echo [2/2] Mengaktifkan EditFlow Python Local Engine (127.0.0.1:8000)...
python main.py
pause`;

    const blob = new Blob([text], { type: 'application/x-bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'setup_and_run_engine.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      <section style={styles.hero}>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span className="badge badge-info">
            ⚡ Local Processing • Zero Cloud Upload
          </span>
          {engineStatus.online ? (
            <span className="badge badge-success">
              🟢 EditFlow Local Engine Aktif (localhost:8000)
            </span>
          ) : (
            <span className="badge badge-warning">
              ⚪ Local Engine Offline (Klik 1-Klik Setup Di Bawah)
            </span>
          )}
        </div>

        <h1 style={styles.title}>Ubah Video Panjang Menjadi Clip Vertikal Terbaik</h1>
        <p style={styles.subtitle}>
          EditFlow Auto Clipper mentranskripsi audio, menemukan momen menarik, mendeteksi wajah, dan memotong aspek 9:16 secara otomatis langsung di laptop Anda.
        </p>

        {/* Input Selector Tabs */}
        <div style={styles.tabContainer}>
          <button
            onClick={() => setActiveTab('url')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'url' ? styles.tabButtonActive : {}),
            }}
          >
            🔗 Tempel Link Video
          </button>
          <button
            onClick={() => setActiveTab('file')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'file' ? styles.tabButtonActive : {}),
            }}
          >
            📁 Pilih File Video Lokal
          </button>
        </div>

        {activeTab === 'url' ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Tempel Link Video</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                  EditFlow Local Engine di laptop Anda (`localhost:8000`) mengambil video dan memprosesnya secara otomatis.
                </p>
              </div>

              {!engineStatus.online && (
                <button className="btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleDownloadBootstrapper}>
                  ⚡ Auto-Aktifkan Engine (1-Klik Setup)
                </button>
              )}
            </div>

            <form onSubmit={handleProcessUrl} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="url"
                placeholder="https://..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                style={styles.urlInput}
                disabled={loadingUrl}
                required
              />

              {urlError && (
                <div className="badge badge-danger" style={{ padding: '0.6rem', lineHeight: 1.4 }}>
                  ⚠️ {urlError}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loadingUrl || !videoUrl.trim()}
                style={{ justifyContent: 'center', fontSize: '1rem', padding: '0.8rem' }}
              >
                {loadingUrl ? '⏳ Local Engine Sedang Mengambil Video...' : '🚀 Kirim Link ke Local Engine & Mulai →'}
              </button>
            </form>
          </div>
        ) : (
          <div
            style={styles.dropzone}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            tabIndex={0}
            role="button"
            aria-label="Pilih atau drop file video lokal"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
              style={{ display: 'none' }}
            />
            <div style={styles.uploadIcon}>🎬</div>
            <h3 style={{ margin: '0.5rem 0', fontSize: '1.2rem' }}>Pilih File Video Dari Laptop</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Tarik & lepas file video di sini, atau klik untuk memilih file MP4 / WebM / MOV.
            </p>
            <span className="badge badge-success" style={{ marginTop: '1rem' }}>
              🔒 File tidak akan pernah diunggah ke server luar
            </span>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn-secondary" onClick={onNavigateToCompat}>
            🔍 Cek Kompatibilitas Browser & Hardware
          </button>
        </div>
      </section>

      <section style={styles.features}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Alur Kerja 4 Langkah</h2>
        <div style={styles.grid}>
          <div className="card">
            <h3 style={styles.cardStep}>01. Link / File Import</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Tempel link video atau pilih file lokal. Local Engine di laptop Anda menyiapkan video untuk clipping.
            </p>
          </div>
          <div className="card">
            <h3 style={styles.cardStep}>02. Transkripsi & Scoring</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Model transkripsi mendeteksi poin-poin ilmu dan kata kunci penting secara bertimestamp.
            </p>
          </div>
          <div className="card">
            <h3 style={styles.cardStep}>03. Preview & Manual Edit</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Putar kandidat clip 9:16, ubah headline, koreksi teks subtitle ucapan, dan atur safe area.
            </p>
          </div>
          <div className="card">
            <h3 style={styles.cardStep}>04. Render MP4 Lokal</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Render kandidat terpilih menjadi file MP4 final secara lokal di perangkat Anda.
            </p>
          </div>
        </div>
      </section>

      <footer style={styles.disclaimer}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          ⚠️ Perhatian: Gunakan hanya video milik sendiri atau video yang memiliki izin sah. Seluruh pemrosesan dilakukan di laptop Anda.
        </p>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3rem',
    padding: '2rem 0',
  },
  hero: {
    textAlign: 'center',
    maxWidth: '800px',
    margin: '0 auto',
    width: '100%',
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '1rem',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: '1.1rem',
    color: 'var(--text-secondary)',
    marginBottom: '2rem',
  },
  tabContainer: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  tabButton: {
    background: 'var(--bg-dark-800)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--surface-border)',
    padding: '0.75rem 1.5rem',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.95rem',
    fontWeight: 600,
  },
  tabButtonActive: {
    background: 'var(--accent-primary)',
    color: '#fff',
    borderColor: 'var(--accent-primary)',
  },
  urlInput: {
    width: '100%',
    padding: '0.85rem 1rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
    fontSize: '1rem',
  },
  dropzone: {
    border: '2px dashed var(--accent-primary)',
    borderRadius: 'var(--radius-lg)',
    padding: '3rem 2rem',
    background: 'var(--surface-card)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: '3rem',
    marginBottom: '0.5rem',
  },
  features: {
    marginTop: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
  },
  cardStep: {
    fontSize: '1.1rem',
    color: 'var(--accent-secondary)',
    marginBottom: '0.5rem',
  },
  disclaimer: {
    textAlign: 'center',
    paddingTop: '1rem',
    borderTop: '1px solid var(--surface-border)',
  },
};
