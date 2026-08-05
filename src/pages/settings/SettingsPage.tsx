import React, { useState } from 'react';
import { localStorageAdapter } from '@/infrastructure/storage/indexeddb';

export const SettingsPage: React.FC = () => {
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
            EditFlow Auto Clipper beroperasi 100% di dalam peramban Anda. Tidak ada video, audio, transkrip, atau thumbnail yang dikirim keluar.
          </p>
          <span className="badge badge-success">Local Sandbox Protection</span>
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
