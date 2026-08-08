import React, { useState } from 'react';
import { localStorageAdapter } from '@/infrastructure/storage/indexeddb';
import {
  CloudProvider,
  CLOUD_PROVIDER_LABELS,
  loadCloudTranscriptionConfig,
  saveCloudTranscriptionConfig,
} from '@/infrastructure/media/transcription/cloud';

export const SettingsPage: React.FC = () => {
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const initialCloud = loadCloudTranscriptionConfig();
  const [cloudEnabled, setCloudEnabled] = useState(initialCloud.enabled);
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>(initialCloud.provider);
  const [cloudApiKey, setCloudApiKey] = useState(initialCloud.apiKey);

  const handleSaveCloud = () => {
    saveCloudTranscriptionConfig({ enabled: cloudEnabled, provider: cloudProvider, apiKey: cloudApiKey.trim() });
    setMessage(
      cloudEnabled && cloudApiKey.trim()
        ? 'Mode cloud AKTIF: transkripsi berikutnya memakai API key Anda (audio diunggah ke provider).'
        : 'Pengaturan transkripsi tersimpan. Mode lokal tetap aktif.'
    );
  };

  const handleClearCache = async () => {
    if (confirm('Apakah Anda yakin ingin menghapus seluruh data proyek dan cache lokal?')) {
      setClearing(true);
      const res = await localStorageAdapter.clearAllData();
      setClearing(false);
      if (res.success) {
        setMessage('Seluruh data lokal dan cache berhasil dibersihkan.');
      } else {
        setMessage(`Gagal menghapus data: ${res.error.message}`);
      }
    }
  };

  return (
    <div style={styles.container}>
      <h2>Pengaturan & Penyimpanan Lokal</h2>

      {message && <div className="badge badge-info" style={{ padding: '0.75rem' }}>{message}</div>}

      <div style={styles.grid}>
        <div className="card">
          <h3>🔒 Keamanan & Privasi Data</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            Secara default EditFlow beroperasi 100% di dalam peramban: tidak ada video, audio, transkrip, atau thumbnail yang dikirim keluar. Mode cloud di bawah hanya aktif jika Anda menyalakannya sendiri.
          </p>
          <span className="badge badge-success">Local Sandbox Protection</span>
        </div>

        <div className="card">
          <h3>⚡ Transkripsi Cloud (Opsional, Butuh API Key)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            Untuk video panjang, transkripsi lokal bisa lambat di perangkat menengah. Aktifkan mode ini untuk memakai API key Anda sendiri (Groq gratis &amp; tercepat, atau OpenAI). <strong>Perhatian:</strong> potongan audio akan diunggah ke provider pilihan Anda hanya untuk transkripsi. Jangan aktifkan untuk video rahasia.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={cloudEnabled}
              onChange={(e) => setCloudEnabled(e.target.checked)}
            />
            Aktifkan transkripsi cloud
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={cloudProvider}
              onChange={(e) => setCloudProvider(e.target.value as CloudProvider)}
              style={{ padding: '0.5rem', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              <option value="groq">{CLOUD_PROVIDER_LABELS.groq}</option>
              <option value="openai">{CLOUD_PROVIDER_LABELS.openai}</option>
            </select>
            <input
              type="password"
              placeholder="Tempel API key (groq/openai)"
              value={cloudApiKey}
              onChange={(e) => setCloudApiKey(e.target.value)}
              style={{ flex: 1, minWidth: 220, padding: '0.5rem', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            />
            <button className="btn-primary" onClick={handleSaveCloud}>💾 Simpan</button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
            Key disimpan hanya di localStorage peramban ini dan dikirim hanya ke endpoint provider. Groq: console.groq.com/keys · OpenAI: platform.openai.com/api-keys
          </p>
        </div>

        <div className="card">
          <h3>📦 Manajemen Cache & Model AI</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            Hapus data proyek yang tersimpan di IndexedDB dan berkas sementara di OPFS untuk membebaskan ruang disk.
          </p>
          <button
            className="btn-danger"
            onClick={handleClearCache}
            disabled={clearing}
            style={{ marginTop: '0.5rem' }}
          >
            {clearing ? 'Clearing...' : '🗑️ Bersihkan Semua Cache Lokal'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '1.5rem',
  },
};
