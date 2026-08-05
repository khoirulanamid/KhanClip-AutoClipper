import React, { useEffect, useState } from 'react';
import { checkSystemCapability, SystemCapabilityReport } from '@/infrastructure/media/webcodecs/capability';

interface CompatibilityPageProps {
  onContinue: () => void;
}

export const CompatibilityPage: React.FC<CompatibilityPageProps> = ({ onContinue }) => {
  const [report, setReport] = useState<SystemCapabilityReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSystemCapability().then((res) => {
      setReport(res);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h2>Memeriksa Kemampuan Peramban & Perangkat...</h2>
      </div>
    );
  }

  if (!report) return null;

  const getStatusBadge = (supported: boolean, labelSuccess = 'Siap', labelFail = 'Tidak Didukung') => {
    return supported ? (
      <span className="badge badge-success">✓ {labelSuccess}</span>
    ) : (
      <span className="badge badge-danger">✗ {labelFail}</span>
    );
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2>Hasil Pemeriksaan Kompatibilitas</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          System Check memastikan peramban (Chrome / Edge Desktop) mendukung API media lokal yang diperlukan.
        </p>
      </header>

      <div style={styles.overallBanner}>
        Status Perangkat:{' '}
        {report.overallStatus === 'ready' && <span className="badge badge-success">Siap Maksimal (WebCodecs + WebGPU + OPFS)</span>}
        {report.overallStatus === 'ready_fallback' && (
          <span className="badge badge-warning">Siap dengan Fallback (WebCodecs Siap, WebGPU/OPFS Fallback)</span>
        )}
        {report.overallStatus === 'unsupported' && (
          <span className="badge badge-danger">Peramban Tidak Didukung (Memerlukan Chrome/Edge Desktop Modern)</span>
        )}
      </div>

      <div style={styles.grid}>
        <div className="card">
          <div style={styles.cardHeader}>
            <h4>WebCodecs VideoDecoder</h4>
            {getStatusBadge(report.videoDecoder.supported)}
          </div>
          <p style={styles.cardDetail}>{report.videoDecoder.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>WebCodecs VideoEncoder</h4>
            {getStatusBadge(report.videoEncoder.supported)}
          </div>
          <p style={styles.cardDetail}>{report.videoEncoder.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>WebCodecs AudioDecoder</h4>
            {getStatusBadge(report.audioDecoder.supported)}
          </div>
          <p style={styles.cardDetail}>{report.audioDecoder.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>WebCodecs AudioEncoder</h4>
            {getStatusBadge(report.audioEncoder.supported)}
          </div>
          <p style={styles.cardDetail}>{report.audioEncoder.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>WebGPU (Akselerasi AI)</h4>
            {getStatusBadge(report.webGpu.supported, 'Aktif', 'Pakai WASM')}
          </div>
          <p style={styles.cardDetail}>{report.webGpu.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>Origin Private File System (OPFS)</h4>
            {getStatusBadge(report.opfs.supported)}
          </div>
          <p style={styles.cardDetail}>{report.opfs.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>Penyimpanan Lokal</h4>
            {getStatusBadge(report.storageQuota.supported)}
          </div>
          <p style={styles.cardDetail}>{report.storageQuota.statusText}</p>
        </div>

        <div className="card">
          <div style={styles.cardHeader}>
            <h4>Cross-Origin Isolation</h4>
            {getStatusBadge(report.crossOriginIsolated.supported, 'COOP/COEP Active', 'Standard')}
          </div>
          <p style={styles.cardDetail}>{report.crossOriginIsolated.statusText}</p>
        </div>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          className="btn-primary"
          onClick={onContinue}
          disabled={report.overallStatus === 'unsupported'}
        >
          Lanjutkan ke Import & Konfigurasi →
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '1000px',
    margin: '0 auto',
    width: '100%',
  },
  header: {
    textAlign: 'center',
  },
  overallBanner: {
    background: 'var(--surface-card)',
    border: '1px solid var(--surface-border)',
    padding: '1rem',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
    fontWeight: 600,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1rem',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  cardDetail: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    margin: 0,
  },
};
