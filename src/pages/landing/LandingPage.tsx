import React, { useEffect, useRef, useState } from 'react';
import { checkLocalEngineStatus, processVideoUrlWithLocalEngine, LocalEngineStatus } from '@/infrastructure/engine/localhost';

interface LandingPageProps {
  onSelectFile: (file: File) => void;
  onNavigateToCompat: () => void;
}

/* Minimal stroke icon set — replaces emoji for a clean, professional look */
const Icon: React.FC<{ paths: string[]; size?: number }> = ({ paths, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

const ICONS = {
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  file: [
    'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
  ],
  upload: ['M12 3v12', 'm7 8 5-5 5 5', 'M5 21h14'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
  alert: [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z',
    'M12 9v4',
    'M12 17h.01',
  ],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
};

const STEPS = [
  {
    number: '01',
    title: 'Import link atau file',
    description: 'Tempel link video atau pilih file lokal. Local Engine di laptop Anda menyiapkan video untuk clipping.',
  },
  {
    number: '02',
    title: 'Transkripsi & scoring',
    description: 'Model transkripsi mendeteksi poin-poin ilmu dan kata kunci penting secara bertimestamp.',
  },
  {
    number: '03',
    title: 'Preview & edit manual',
    description: 'Putar kandidat clip 9:16, ubah headline, koreksi teks subtitle ucapan, dan atur safe area.',
  },
  {
    number: '04',
    title: 'Render MP4 lokal',
    description: 'Render kandidat terpilih menjadi file MP4 final secara lokal di perangkat Anda.',
  },
];

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
      setUrlError('EditFlow Local Engine sedang offline. Gunakan tautan "Unduh 1-klik setup" di bawah untuk mengaktifkannya secara otomatis.');
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
        <div style={styles.badgeRow}>
          <span style={styles.pill}>
            <span style={{ ...styles.dot, background: 'var(--accent-success)' }} />
            Local processing · zero cloud upload
          </span>
          <span style={styles.pill}>
            <span
              style={{
                ...styles.dot,
                background: engineStatus.online ? 'var(--accent-success)' : 'var(--accent-warning)',
              }}
            />
            {engineStatus.online ? 'Local engine aktif' : 'Local engine offline'}
          </span>
        </div>

        <h1 style={styles.title}>
          Ubah video panjang menjadi <span style={styles.titleAccent}>clip vertikal</span> terbaik
        </h1>
        <p style={styles.subtitle}>
          EditFlow mentranskripsi audio, menemukan momen menarik, mendeteksi wajah, dan memotong aspek 9:16
          secara otomatis — semuanya langsung di laptop Anda.
        </p>

        <div style={styles.importCard}>
          <div style={styles.importHeader}>
            <div style={styles.segmented} role="tablist" aria-label="Metode import video">
              <button
                role="tab"
                aria-selected={activeTab === 'url'}
                onClick={() => setActiveTab('url')}
                className={`nav-segment${activeTab === 'url' ? ' nav-segment-active' : ''}`}
              >
                <Icon paths={ICONS.link} size={14} />
                Link video
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'file'}
                onClick={() => setActiveTab('file')}
                className={`nav-segment${activeTab === 'file' ? ' nav-segment-active' : ''}`}
              >
                <Icon paths={ICONS.file} size={14} />
                File lokal
              </button>
            </div>
            <span style={styles.importHint}>
              <Icon paths={ICONS.shield} size={13} />
              Semua proses di laptop Anda
            </span>
          </div>

          {activeTab === 'url' ? (
            <div style={styles.panel}>
              <form onSubmit={handleProcessUrl} style={styles.urlRow}>
                <input
                  type="url"
                  className="field-input"
                  placeholder="https://..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  style={styles.urlInput}
                  disabled={loadingUrl}
                  required
                  aria-label="Link video"
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loadingUrl || !videoUrl.trim()}
                  style={styles.submitButton}
                >
                  {loadingUrl ? 'Mengambil video…' : 'Proses video'}
                  {!loadingUrl && <Icon paths={ICONS.arrowRight} size={15} />}
                </button>
              </form>

              {urlError && (
                <div style={styles.errorNote} role="alert">
                  <Icon paths={ICONS.alert} size={15} />
                  <span>{urlError}</span>
                </div>
              )}

              <div style={styles.panelFooter}>
                {engineStatus.online ? (
                  <span style={styles.engineOk}>
                    <span style={{ ...styles.dot, background: 'var(--accent-success)' }} />
                    EditFlow Local Engine aktif di localhost:8000
                  </span>
                ) : (
                  <span style={styles.engineOff}>
                    <span style={{ ...styles.dot, background: 'var(--accent-warning)' }} />
                    Local engine belum aktif —
                    <button className="link-button" onClick={handleDownloadBootstrapper}>
                      <Icon paths={ICONS.zap} size={13} />
                      Unduh 1-klik setup (.bat)
                    </button>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.panel}>
              <div
                className="dropzone"
                style={styles.dropzone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
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
                <div style={styles.uploadIconWrap}>
                  <Icon paths={ICONS.upload} size={22} />
                </div>
                <h3 style={styles.dropzoneTitle}>Pilih file video dari laptop</h3>
                <p style={styles.dropzoneText}>
                  Tarik &amp; lepas file video di sini, atau klik untuk memilih file MP4 / WebM / MOV.
                </p>
                <span style={styles.privacyNote}>
                  <Icon paths={ICONS.shield} size={13} />
                  File tidak akan pernah diunggah ke server luar
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={styles.compatRow}>
          <button className="btn-secondary" style={styles.compatButton} onClick={onNavigateToCompat}>
            Cek kompatibilitas browser &amp; hardware
            <Icon paths={ICONS.arrowRight} size={14} />
          </button>
        </div>
      </section>

      <section style={styles.features}>
        <div style={styles.featuresHead}>
          <span style={styles.eyebrow}>Cara kerja</span>
          <h2 style={styles.featuresTitle}>Dari video panjang ke clip final dalam empat langkah</h2>
        </div>
        <div style={styles.grid}>
          {STEPS.map((step) => (
            <div key={step.number} className="card" style={styles.stepCard}>
              <span style={styles.stepNumber}>{step.number}</span>
              <h3 style={styles.stepTitle}>{step.title}</h3>
              <p style={styles.stepText}>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={styles.disclaimer}>
        <p style={styles.disclaimerText}>
          <Icon paths={ICONS.alert} size={14} />
          <span>
            Gunakan hanya video milik sendiri atau video yang memiliki izin sah. Seluruh pemrosesan dilakukan
            di laptop Anda.
          </span>
        </p>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4.5rem',
    padding: '3rem 0 2rem',
    width: '100%',
  },
  hero: {
    maxWidth: '820px',
    margin: '0 auto',
    width: '100%',
  },
  badgeRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginBottom: '1.75rem',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.35rem 0.85rem',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--surface-border)',
    background: 'var(--bg-dark-800)',
    color: 'var(--text-secondary)',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  title: {
    fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)',
    lineHeight: 1.12,
    letterSpacing: '-0.03em',
    fontWeight: 700,
    marginBottom: '1.25rem',
    maxWidth: '720px',
  },
  titleAccent: {
    color: 'var(--accent-primary)',
  },
  subtitle: {
    fontSize: '1.05rem',
    lineHeight: 1.7,
    color: 'var(--text-secondary)',
    maxWidth: '600px',
    marginBottom: '2.5rem',
  },
  importCard: {
    background: 'var(--surface-card)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  importHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    padding: '0.85rem 1.25rem',
    borderBottom: '1px solid var(--surface-border)',
    background: 'var(--bg-dark-800)',
  },
  segmented: {
    display: 'inline-flex',
    gap: '2px',
    background: 'var(--bg-dark-900)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-md)',
    padding: '3px',
  },
  importHint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  panel: {
    padding: '1.5rem',
  },
  urlRow: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  urlInput: {
    flex: 1,
    minWidth: '240px',
    padding: '0.8rem 1rem',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
  },
  submitButton: {
    justifyContent: 'center',
    padding: '0.8rem 1.5rem',
  },
  errorNote: {
    display: 'flex',
    gap: '0.55rem',
    alignItems: 'flex-start',
    color: 'var(--accent-danger)',
    fontSize: '0.85rem',
    lineHeight: 1.55,
    marginTop: '1rem',
  },
  panelFooter: {
    marginTop: '1.1rem',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    fontSize: '0.8rem',
  },
  engineOk: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--accent-success)',
  },
  engineOff: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
    color: 'var(--text-secondary)',
  },
  dropzone: {
    border: '1.5px dashed var(--surface-border-accent)',
    borderRadius: 'var(--radius-md)',
    padding: '3rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  },
  uploadIconWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'var(--bg-dark-700)',
    border: '1px solid var(--surface-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-secondary)',
    marginBottom: '1.1rem',
  },
  dropzoneTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: '0 0 0.4rem 0',
  },
  dropzoneText: {
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    maxWidth: '420px',
    margin: 0,
  },
  privacyNote: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    marginTop: '1.35rem',
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
  },
  compatRow: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'center',
  },
  compatButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  features: {
    maxWidth: '1100px',
    margin: '0 auto',
    width: '100%',
  },
  featuresHead: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  eyebrow: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--accent-secondary)',
    marginBottom: '0.6rem',
  },
  featuresTitle: {
    fontSize: '1.6rem',
    letterSpacing: '-0.02em',
    fontWeight: 600,
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: '1rem',
  },
  stepCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.5rem',
  },
  stepNumber: {
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
  },
  stepTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: '0.75rem 0 0.5rem 0',
  },
  stepText: {
    color: 'var(--text-secondary)',
    fontSize: '0.875rem',
    lineHeight: 1.65,
    margin: 0,
  },
  disclaimer: {
    paddingTop: '1.5rem',
    borderTop: '1px solid var(--surface-border)',
    display: 'flex',
    justifyContent: 'center',
  },
  disclaimerText: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.8rem',
    lineHeight: 1.6,
    color: 'var(--text-muted)',
    maxWidth: '620px',
    textAlign: 'left',
  },
};
