import React, { useState } from 'react';
import { Candidate } from '@/domain/candidate/types';

interface CandidateGalleryPageProps {
  candidates: Candidate[];
  onSelectCandidateToEdit: (candidateId: string) => void;
  onProceedToRenderQueue: (selectedIds: string[]) => void;
}

export const CandidateGalleryPage: React.FC<CandidateGalleryPageProps> = ({
  candidates: initialCandidates,
  onSelectCandidateToEdit,
  onProceedToRenderQueue,
}) => {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);

  const toggleSelect = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selectedForRender: !c.selectedForRender } : c))
    );
  };

  const selectedCount = candidates.filter((c) => c.selectedForRender).length;

  const formatTime = (us: number) => {
    const totalSec = Math.floor(us / 1000000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2>Galeri Kandidat Video Vertikal ({candidates.length} Hasil)</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Pilih kandidat yang ingin dirender, atau buka Editor 9:16 untuk melakukan koreksi manual.
          </p>
        </div>

        <button
          className="btn-primary"
          disabled={selectedCount === 0}
          onClick={() => onProceedToRenderQueue(candidates.filter((c) => c.selectedForRender).map((c) => c.id))}
        >
          Render {selectedCount} Kandidat Terpilih →
        </button>
      </header>

      <div style={styles.grid}>
        {candidates.map((item) => (
          <div key={item.id} className="card" style={styles.candidateCard}>
            <div style={styles.thumbnailWrapper}>
              <div style={styles.aspectRatio916}>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={styles.thumbnailContent}>
                    <span style={{ fontSize: '2rem' }}>🎬</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0 0.5rem' }}>
                      {item.headline}
                    </p>
                  </div>
                )}
              </div>

              <div style={styles.scoreTag}>
                <span className="badge badge-success">Skor: {item.score.totalScore}/100</span>
              </div>
            </div>

            <div style={styles.cardBody}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>{item.title}</h4>
                <input
                  type="checkbox"
                  checked={item.selectedForRender}
                  onChange={() => toggleSelect(item.id)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0' }}>
                <strong>Waktu:</strong> {formatTime(item.startUs)} – {formatTime(item.endUs)} ({Math.round(item.durationUs / 1000000)} detik)
              </p>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>
                <strong>Layout:</strong> {item.recommendedLayout.replace('_', ' ')}
              </p>

              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
                {item.keywords.map((kw, i) => (
                  <span key={i} className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                    #{kw}
                  </span>
                ))}
              </div>

              <div style={styles.reasonsBox}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  💡 {item.score.reasons[0] || 'Kandidat memiliki hook awal dan kalimat utuh.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  onClick={() => onSelectCandidateToEdit(item.id)}
                >
                  ✏️ Edit Kandidat 9:16
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.5rem',
  },
  candidateCard: {
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    overflow: 'hidden',
  },
  thumbnailWrapper: {
    position: 'relative',
    background: 'var(--bg-dark-900)',
    borderBottom: '1px solid var(--surface-border)',
  },
  aspectRatio916: {
    aspectRatio: '9 / 16',
    maxHeight: '260px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreTag: {
    position: 'absolute',
    top: '10px',
    right: '10px',
  },
  cardBody: {
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  reasonsBox: {
    background: 'var(--bg-dark-900)',
    padding: '0.5rem',
    borderRadius: 'var(--radius-sm)',
    marginTop: '0.25rem',
  },
};
