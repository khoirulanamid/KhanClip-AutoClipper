import React, { useState } from 'react';
import { ProjectSettings } from '@/domain/project/types';

interface ConfigurePageProps {
  selectedFile: File | null;
  onStartAnalysis: (settings: ProjectSettings) => void;
}

const PRESETS: { label: string; start: number; end: number }[] = [
  { label: 'Seluruh video', start: 0, end: 0 },
  { label: '5 menit pertama', start: 0, end: 5 },
  { label: '10 menit pertama', start: 0, end: 10 },
  { label: '30 menit pertama', start: 0, end: 30 },
];

export const ConfigurePage: React.FC<ConfigurePageProps> = ({ selectedFile, onStartAnalysis }) => {
  const [settings, setSettings] = useState<ProjectSettings>({
    language: 'id',
    candidateCount: 'auto',
    targetDurationSec: 'auto',
    layoutTemplate: 'smart_editorial',
    performanceProfile: 'balanced',
    outputResolution: '1080x1920',
    autoSubtitles: false,
    clipStartMinute: 0,
    clipEndMinute: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.clipEndMinute > 0 && settings.clipEndMinute <= settings.clipStartMinute) {
      alert('Menit selesai harus lebih besar dari menit mulai (atau isi 0 untuk sampai akhir video).');
      return;
    }
    onStartAnalysis(settings);
  };

  const durationLabel =
    settings.clipEndMinute > 0
      ? settings.clipEndMinute > settings.clipStartMinute
        ? `${settings.clipEndMinute - settings.clipStartMinute} menit`
        : '—'
      : 'sampai akhir video';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>✂️ Potong Video per Rentang Menit</h2>
        <p style={styles.subtitle}>
          Tentukan dari menit ke berapa sampai menit ke berapa video dipotong.
          Crop 9:16, deteksi wajah, dan render berjalan otomatis di dalam rentang itu — satu clip langsung jadi.
        </p>
      </header>

      {selectedFile && (
        <div className="card" style={styles.fileCard}>
          <div>
            <h4 style={{ margin: 0 }}>📁 {selectedFile.name}</h4>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • {selectedFile.type || 'video'} • diproses 100% lokal
            </p>
          </div>
          <span className="badge badge-info">Siap Dipotong</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* ===== HERO: minute range ===== */}
        <section className="card" style={styles.heroCard}>
          <div style={styles.heroHead}>
            <h3 style={styles.heroTitle}>⏳ Rentang Clip</h3>
            <span style={styles.heroSummary}>🎬 menit {settings.clipStartMinute} → {settings.clipEndMinute > 0 ? settings.clipEndMinute : 'akhir'} ({durationLabel})</span>
          </div>

          <div style={styles.rangeRow}>
            <label style={styles.rangeLabel}>
              <span style={styles.rangeLabelText}>MENIT MULAI</span>
              <div style={styles.rangeInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label="Menit mulai"
                  value={settings.clipStartMinute}
                  onChange={(e) =>
                    setSettings({ ...settings, clipStartMinute: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  style={styles.rangeInput}
                />
                <span style={styles.rangeUnit}>menit</span>
              </div>
            </label>

            <span style={styles.rangeArrow} aria-hidden="true">→</span>

            <label style={styles.rangeLabel}>
              <span style={styles.rangeLabelText}>MENIT SELESAI</span>
              <div style={styles.rangeInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label="Menit selesai"
                  value={settings.clipEndMinute}
                  onChange={(e) =>
                    setSettings({ ...settings, clipEndMinute: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  style={styles.rangeInput}
                />
                <span style={styles.rangeUnit}>{settings.clipEndMinute > 0 ? 'menit' : '= akhir'}</span>
              </div>
            </label>
          </div>

          <div style={styles.presetRow}>
            {PRESETS.map((p) => {
              const active = settings.clipStartMinute === p.start && settings.clipEndMinute === p.end;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSettings({ ...settings, clipStartMinute: p.start, clipEndMinute: p.end })}
                  style={{ ...styles.presetChip, ...(active ? styles.presetChipActive : {}) }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ===== Analysis options ===== */}
        <h4 style={styles.sectionTitle}>Opsi Analisis</h4>
        <div style={styles.grid2}>
          <div className="card" style={styles.card}>
            <h3 style={styles.cardTitle}>🌐 Bahasa Audio</h3>
            <p style={styles.cardDesc}>Bahasa ucapan untuk transkripsi Whisper (judul & skor clip).</p>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value as any })}
              style={styles.select}
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
              <option value="auto">Deteksi Otomatis</option>
            </select>
          </div>

          <div className="card" style={styles.card}>
            <h3 style={styles.cardTitle}>💬 Subtitle Otomatis</h3>
            <p style={styles.cardDesc}>
              Default MATI: clip murni potongan video. Nyalakan hanya jika ingin subtitle kata-per-kata dibakar ke video.
            </p>
            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={settings.autoSubtitles}
                onChange={(e) => setSettings({ ...settings, autoSubtitles: e.target.checked })}
              />
              Bakar subtitle ke clip
            </label>
          </div>
        </div>

        {/* ===== Output options ===== */}
        <h4 style={styles.sectionTitle}>Opsi Output</h4>
        <div style={styles.grid3}>
          <div className="card" style={styles.card}>
            <h3 style={styles.cardTitle}>📐 Resolusi</h3>
            <p style={styles.cardDesc}>Dimensi video vertikal final.</p>
            <select
              value={settings.outputResolution}
              onChange={(e) => setSettings({ ...settings, outputResolution: e.target.value as any })}
              style={styles.select}
            >
              <option value="1080x1920">1080 × 1920 (Full HD)</option>
              <option value="720x1280">720 × 1280 (HD, lebih ringan)</option>
            </select>
          </div>

          <div className="card" style={styles.card}>
            <h3 style={styles.cardTitle}>🎨 Layout 9:16</h3>
            <p style={styles.cardDesc}>Pola crop wajah & posisi teks.</p>
            <select
              value={settings.layoutTemplate}
              onChange={(e) => setSettings({ ...settings, layoutTemplate: e.target.value as any })}
              style={styles.select}
            >
              <option value="smart_editorial">Smart Editorial (Deteksi Wajah)</option>
              <option value="center_focus">Fokus Tengah (Center Crop)</option>
              <option value="bg_blur">Background Blur</option>
              <option value="simple_subtitle">Sederhana</option>
            </select>
          </div>

          <div className="card" style={styles.card}>
            <h3 style={styles.cardTitle}>🚀 Performa</h3>
            <p style={styles.cardDesc}>Alokasi CPU/GPU laptop Anda.</p>
            <select
              value={settings.performanceProfile}
              onChange={(e) => setSettings({ ...settings, performanceProfile: e.target.value as any })}
              style={styles.select}
            >
              <option value="eco">Hemat (GPU/CPU rendah)</option>
              <option value="balanced">Seimbang (rekomendasi)</option>
              <option value="max">Maksimal (tercepat)</option>
            </select>
          </div>
        </div>

        <button type="submit" className="btn-primary" style={styles.cta}>
          ⚡ Proses Clip Sekarang →
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '860px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  header: { textAlign: 'center', marginBottom: '0.25rem' },
  title: { margin: 0, fontSize: '1.6rem', letterSpacing: '-0.01em' },
  subtitle: {
    margin: '0.5rem auto 0',
    maxWidth: '620px',
    color: 'var(--text-secondary)',
    fontSize: '0.92rem',
    lineHeight: 1.6,
  },
  fileCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-dark-800)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '1.1rem' },
  heroCard: {
    background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(6,182,212,0.08)), var(--bg-dark-800)',
    border: '1px solid var(--surface-border-accent)',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
  },
  heroHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  heroTitle: { margin: 0, fontSize: '1.15rem' },
  heroSummary: {
    fontSize: '0.82rem',
    color: 'var(--accent-secondary)',
    background: 'rgba(6,182,212,0.12)',
    border: '1px solid rgba(6,182,212,0.35)',
    borderRadius: 'var(--radius-full)',
    padding: '0.3rem 0.8rem',
    fontWeight: 600,
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  rangeLabel: { flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  rangeLabelText: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
  },
  rangeInputWrap: { position: 'relative' },
  rangeInput: {
    width: '100%',
    padding: '0.8rem 4.2rem 0.8rem 1rem',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
    fontSize: '1.35rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  rangeUnit: {
    position: 'absolute',
    right: '0.9rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
  },
  rangeArrow: {
    fontSize: '1.5rem',
    color: 'var(--accent-primary)',
    paddingBottom: '0.9rem',
    fontWeight: 700,
  },
  presetRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  presetChip: {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--surface-border)',
    background: 'var(--bg-dark-700)',
    color: 'var(--text-secondary)',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  presetChipActive: {
    border: '1px solid var(--accent-primary)',
    color: 'var(--text-primary)',
    background: 'rgba(99,102,241,0.18)',
  },
  sectionTitle: {
    margin: '0.4rem 0 -0.3rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' },
  card: { background: 'var(--bg-dark-800)', padding: '1.1rem' },
  cardTitle: { margin: '0 0 0.35rem', fontSize: '0.98rem' },
  cardDesc: { margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
  },
  select: {
    width: '100%',
    padding: '0.6rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
    fontSize: '0.88rem',
  },
  cta: {
    marginTop: '0.6rem',
    fontSize: '1.05rem',
    padding: '0.95rem 2rem',
    width: '100%',
  },
};
