import React, { useState } from 'react';
import { ProjectSettings } from '@/domain/project/types';

interface ConfigurePageProps {
  selectedFile: File | null;
  onStartAnalysis: (settings: ProjectSettings) => void;
}

export const ConfigurePage: React.FC<ConfigurePageProps> = ({ selectedFile, onStartAnalysis }) => {
  const [settings, setSettings] = useState<ProjectSettings>({
    language: 'id',
    candidateCount: 5,
    targetDurationSec: '30_60',
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

  return (
    <div style={styles.container}>
      <h2>Konfigurasi Proyek & Auto-Clipper</h2>

      {selectedFile && (
        <div className="card" style={styles.fileCard}>
          <div>
            <h4 style={{ margin: 0 }}>📁 File Sumber: {selectedFile.name}</h4>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Ukuran: {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Tipe: {selectedFile.type || 'video'}
            </p>
          </div>
          <span className="badge badge-info">Siap Diproses</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.grid}>
          <div className="card">
            <h3>⏳ Rentang Menit Auto-Clip</h3>
            <p style={styles.labelDesc}>
              Atur dari menit ke berapa sampai menit berapa video dipotong. Analisis &amp; kandidat hanya dibuat di dalam rentang ini (lebih cepat). 0 = dari awal / sampai akhir.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Menit mulai
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={settings.clipStartMinute}
                  onChange={(e) =>
                    setSettings({ ...settings, clipStartMinute: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  style={{ ...styles.select, marginTop: '0.35rem' }}
                />
              </label>
              <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Menit selesai
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={settings.clipEndMinute}
                  onChange={(e) =>
                    setSettings({ ...settings, clipEndMinute: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  style={{ ...styles.select, marginTop: '0.35rem' }}
                />
              </label>
            </div>
          </div>

          <div className="card">
            <h3>💬 Subtitle Otomatis</h3>
            <p style={styles.labelDesc}>
              Default MATI: clip murni potongan video tanpa teks subtitle. Nyalakan hanya jika ingin subtitle kata-per-kata dibakar ke video.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={settings.autoSubtitles}
                onChange={(e) => setSettings({ ...settings, autoSubtitles: e.target.checked })}
              />
              Buat subtitle otomatis pada clip
            </label>
          </div>

          <div className="card">
            <h3>🌐 Bahasa Audio</h3>
            <p style={styles.labelDesc}>Pilih bahasa untuk transkripsi model Whisper.</p>
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

          <div className="card">
            <h3>⏱️ Target Durasi Clip</h3>
            <p style={styles.labelDesc}>Rentang durasi setiap kandidat video pendek.</p>
            <select
              value={settings.targetDurationSec}
              onChange={(e) => setSettings({ ...settings, targetDurationSec: e.target.value as any })}
              style={styles.select}
            >
              <option value="15_30">15 – 30 detik (Shorts / Reels)</option>
              <option value="30_60">30 – 60 detik (Standar)</option>
              <option value="60_90">60 – 90 detik (Panjang)</option>
              <option value="auto">Otomatis berdasarkan narasi</option>
            </select>
          </div>

          <div className="card">
            <h3>🎯 Jumlah Kandidat Clip</h3>
            <p style={styles.labelDesc}>Jumlah kandidat terbaik yang dihasilkan.</p>
            <select
              value={settings.candidateCount}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  candidateCount: e.target.value === 'auto' || e.target.value === 'all_passing' ? (e.target.value as any) : Number(e.target.value),
                })
              }
              style={styles.select}
            >
              <option value={3}>3 kandidat terbaik</option>
              <option value={5}>5 kandidat terbaik</option>
              <option value={10}>10 kandidat terbaik</option>
              <option value="auto">Otomatis (berdasarkan skor)</option>
            </select>
          </div>

          <div className="card">
            <h3>🎨 Layout Template 9:16</h3>
            <p style={styles.labelDesc}>Pola penyusunan crop wajah & posisi subtitle.</p>
            <select
              value={settings.layoutTemplate}
              onChange={(e) => setSettings({ ...settings, layoutTemplate: e.target.value as any })}
              style={styles.select}
            >
              <option value="smart_editorial">Smart Editorial (Deteksi Wajah + Teks Dinamis)</option>
              <option value="center_focus">Fokus Tengah (Center Crop Static)</option>
              <option value="bg_blur">Background Blur (Fit Center + Blurred Backdrop)</option>
              <option value="simple_subtitle">Subtitle Sederhana</option>
            </select>
          </div>

          <div className="card">
            <h3>🚀 Profil Performa</h3>
            <p style={styles.labelDesc}>Alokasi pemrosesan CPU/GPU laptop Anda.</p>
            <select
              value={settings.performanceProfile}
              onChange={(e) => setSettings({ ...settings, performanceProfile: e.target.value as any })}
              style={styles.select}
            >
              <option value="eco">Hemat (Penggunaan GPU/CPU Rendah)</option>
              <option value="balanced">Seimbang (Rekomendasi)</option>
              <option value="max">Maksimal (Paling Cepat)</option>
            </select>
          </div>

          <div className="card">
            <h3>📐 Resolusi Render Output</h3>
            <p style={styles.labelDesc}>Ukuran dimensi video vertikal final.</p>
            <select
              value={settings.outputResolution}
              onChange={(e) => setSettings({ ...settings, outputResolution: e.target.value as any })}
              style={styles.select}
            >
              <option value="1080x1920">1080 × 1920 (Full HD Vertikal)</option>
              <option value="720x1280">720 × 1280 (HD Vertikal - Performa Lebih Ringan)</option>
            </select>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button type="submit" className="btn-primary" style={{ fontSize: '1.1rem', padding: '0.85rem 2rem' }}>
            ⚡ Mulai Analisis & Deteksi Kandidat →
          </button>
        </div>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  fileCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-dark-800)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1.25rem',
  },
  labelDesc: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginBottom: '0.75rem',
  },
  select: {
    width: '100%',
    padding: '0.65rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
    fontSize: '0.9rem',
  },
};
