import React, { useState } from 'react';
import { RenderJob } from '@/domain/render/types';
import { Candidate } from '@/domain/candidate/types';
import { renderCandidateToMp4 } from '@/infrastructure/media/render/mp4_renderer';

interface RenderQueuePageProps {
  selectedFile: File | null;
  candidates: Candidate[];
  selectedCandidateIds: string[];
  onBackToGallery: () => void;
}

interface RealRenderItem {
  job: RenderJob;
  candidate: Candidate;
  blob?: Blob;
}

export const RenderQueuePage: React.FC<RenderQueuePageProps> = ({
  selectedFile,
  candidates,
  selectedCandidateIds,
  onBackToGallery,
}) => {
  const [items, setItems] = useState<RealRenderItem[]>(() => {
    const selectedCands = candidates.filter((c) => selectedCandidateIds.includes(c.id));
    return selectedCands.map((c) => ({
      candidate: c,
      job: {
        id: `job-${c.id}`,
        projectId: 'proj-01',
        candidateId: c.id,
        outputName: `EditFlow_${c.title.replace(/[^a-zA-Z0-9]/g, '_')}_9x16.mp4`,
        resolution: '1080x1920',
        targetBitrateBps: 8000000,
        status: 'waiting',
        progress: {
          stage: 'waiting',
          percent: 0,
          processedFrames: 0,
          totalFrames: Math.round(((c.endUs - c.startUs) / 1000000) * 30),
        },
        createdAt: new Date().toISOString(),
      },
    }));
  });

  const [isRenderingAll, setIsRenderingAll] = useState(false);

  const startRealRender = async (index: number) => {
    if (!selectedFile || index >= items.length) return;

    const currentItem = items[index];
    const cand = currentItem.candidate;

    // Update job stage to preparing
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              job: {
                ...item.job,
                status: 'preparing',
                progress: { ...item.job.progress, stage: 'preparing', percent: 5 },
              },
            }
          : item
      )
    );

    const renderRes = await renderCandidateToMp4(
      selectedFile,
      cand,
      currentItem.job.resolution,
      (percent, stage) => {
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === index
              ? {
                  ...item,
                  job: {
                    ...item.job,
                    status: stage as any,
                    progress: {
                      ...item.job.progress,
                      percent,
                      stage: stage as any,
                      processedFrames: Math.round((percent / 100) * item.job.progress.totalFrames),
                    },
                  },
                }
              : item
          )
        );
      }
    );

    if (renderRes.success) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                blob: renderRes.value.blob,
                job: {
                  ...item.job,
                  status: 'completed',
                  outputName: renderRes.value.outputName,
                  completedAt: new Date().toISOString(),
                  progress: { ...item.job.progress, percent: 100, stage: 'completed' },
                },
              }
            : item
        )
      );

      // Render next item in queue serially
      if (index + 1 < items.length) {
        startRealRender(index + 1);
      } else {
        setIsRenderingAll(false);
      }
    } else {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                job: {
                  ...item.job,
                  status: 'failed',
                  error: renderRes.error.message,
                },
              }
            : item
        )
      );
      setIsRenderingAll(false);
    }
  };

  const handleDownloadBlob = (item: RealRenderItem) => {
    if (!item.blob) return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.job.outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2>Antrean Render MP4 Nyata ({items.length} Pekerjaan)</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Render video serial 9:16 menggunakan WebCodecs & Canvas. Tidak ada data yang dikirim ke server.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={onBackToGallery}>
            ← Kembali ke Galeri
          </button>
          <button
            className="btn-primary"
            disabled={isRenderingAll || items.length === 0}
            onClick={() => {
              setIsRenderingAll(true);
              startRealRender(0);
            }}
          >
            ⚡ Mulai Render MP4 Nyata
          </button>
        </div>
      </header>

      <div style={styles.list}>
        {items.map((item) => (
          <div key={item.job.id} className="card" style={styles.jobCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0 }}>🎬 {item.candidate.title}</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Output: {item.job.outputName} • Resolusi: {item.job.resolution}
                </p>
              </div>

              <div>
                {item.job.status === 'completed' && <span className="badge badge-success">✓ MP4 Siap Diunduh</span>}
                {item.job.status === 'waiting' && <span className="badge badge-info">Menunggu Antrean</span>}
                {item.job.status === 'failed' && <span className="badge badge-danger">Gagal</span>}
                {item.job.status !== 'completed' && item.job.status !== 'waiting' && item.job.status !== 'failed' && (
                  <span className="badge badge-warning">Proses: {item.job.status} ({item.job.progress.percent}%)</span>
                )}
              </div>
            </div>

            <div style={{ margin: '1rem 0 0.5rem 0' }}>
              <div style={styles.progressBarBg}>
                <div style={{ ...styles.progressBarFill, width: `${item.job.progress.percent}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                <span>Progress: {item.job.progress.processedFrames} / {item.job.progress.totalFrames} frames</span>
                <span>{item.job.progress.percent}%</span>
              </div>
            </div>

            {item.job.status === 'completed' && item.blob && (
              <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.85rem' }}
                  onClick={() => handleDownloadBlob(item)}
                >
                  ⬇️ Unduh File MP4 Asli ({(item.blob.size / (1024 * 1024)).toFixed(2)} MB)
                </button>
              </div>
            )}
          </div>
        ))}
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  jobCard: {
    display: 'flex',
    flexDirection: 'column',
  },
  progressBarBg: {
    height: '8px',
    backgroundColor: 'var(--bg-dark-900)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'var(--accent-success)',
    transition: 'width 0.3s ease',
  },
};
