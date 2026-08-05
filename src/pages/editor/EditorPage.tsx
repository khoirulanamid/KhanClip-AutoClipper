import React, { useEffect, useRef, useState } from 'react';
import { Candidate } from '@/domain/candidate/types';

interface EditorPageProps {
  selectedFile: File | null;
  candidates: Candidate[];
  activeCandidateId: string;
  onSaveCandidate: (updated: Candidate) => void;
  onBackToGallery: () => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  selectedFile,
  candidates,
  activeCandidateId: initialActiveId,
  onSaveCandidate,
  onBackToGallery,
}) => {
  const [activeId, setActiveId] = useState<string>(initialActiveId || (candidates[0]?.id ?? ''));
  const currentCandidate = candidates.find((c) => c.id === activeId) || candidates[0];

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [headline, setHeadline] = useState(currentCandidate?.headline || '');
  const [subtitleText, setSubtitleText] = useState(
    currentCandidate?.transcriptText || currentCandidate?.headline || ''
  );
  const [subtitleStyle, setSubtitleStyle] = useState<'kinetic' | 'minimal' | 'bold_banner'>('kinetic');
  const [layout, setLayout] = useState(currentCandidate?.selectedLayout || 'smart_editorial');
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [startUs, setStartUs] = useState(currentCandidate?.startUs || 0);
  const [endUs, setEndUs] = useState(currentCandidate?.endUs || 30000000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    setVideoUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  // When active candidate changes, sync candidate transcript & video seek position
  const handleSelectCandidate = (cand: Candidate) => {
    setActiveId(cand.id);
    setHeadline(cand.headline);
    setSubtitleText(cand.transcriptText || cand.headline || '');
    setLayout(cand.selectedLayout);
    setStartUs(cand.startUs);
    setEndUs(cand.endUs);

    const video = videoRef.current;
    if (video) {
      const startSec = cand.startUs / 1000000;
      video.currentTime = startSec;
    }
  };

  // Synchronize 9:16 Canvas rendering with HTML5 Video element playback & Kinetic Subtitle Highlighting
  useEffect(() => {
    let animId: number;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (video.readyState >= 2) {
        const srcAspect = video.videoWidth / video.videoHeight;
        const dstAspect = 9 / 16;

        let cropW = video.videoWidth;
        let cropH = video.videoHeight;
        let cropX = 0;
        let cropY = 0;

        if (srcAspect > dstAspect) {
          cropW = video.videoHeight * dstAspect;
          cropX = (video.videoWidth - cropW) / 2;
        } else {
          cropH = video.videoWidth / dstAspect;
          cropY = (video.videoHeight - cropH) / 2;
        }

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

        // Kinetic Subtitle Word-by-Word Calculation synced to video.currentTime
        const curTimeSec = video.currentTime;
        const candStartSec = startUs / 1000000;
        const elapsedSec = Math.max(0, curTimeSec - candStartSec);

        const words = subtitleText.split(' ').filter(Boolean);
        const totalWords = Math.max(1, words.length);
        const candDurationSec = Math.max(1, (endUs - startUs) / 1000000);

        // Calculate speech pacing per word
        const wordsPerSec = totalWords / candDurationSec;
        const activeWordIndex = Math.min(words.length - 1, Math.floor(elapsedSec * wordsPerSec));

        // Render Subtitle Overlay Box on Canvas
        const boxWidth = canvas.width * 0.9;
        const boxX = (canvas.width - boxWidth) / 2;
        const boxY = canvas.height * 0.75;

        if (subtitleStyle === 'bold_banner') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxWidth, 80, 12);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = "bold 16px 'Inter', sans-serif";
          ctx.textAlign = 'center';
          ctx.fillText(words.slice(Math.max(0, activeWordIndex - 3), activeWordIndex + 4).join(' '), canvas.width / 2, boxY + 46);
        } else if (subtitleStyle === 'minimal') {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 8;
          ctx.font = "bold 17px 'Inter', sans-serif";
          ctx.textAlign = 'center';
          ctx.fillText(words.slice(Math.max(0, activeWordIndex - 3), activeWordIndex + 4).join(' '), canvas.width / 2, boxY + 40);
          ctx.shadowBlur = 0;
        } else {
          // Kinetic Word-by-Word Highlight (Default)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxWidth, 88, 14);
          ctx.fill();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Render spoken words with active word highlighted in gold/yellow #fbbf24
          const displayWords = words.slice(Math.max(0, activeWordIndex - 3), activeWordIndex + 4);
          const currentWord = words[activeWordIndex] || '';

          ctx.font = "bold 15px 'Inter', sans-serif";
          ctx.textAlign = 'center';
          ctx.fillStyle = '#cbd5e1';

          const fullLine = displayWords.join(' ');
          ctx.fillText(fullLine, canvas.width / 2, boxY + 34);

          // Highlight Active Spoken Word Badge
          if (currentWord) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = "bold 18px 'Outfit', sans-serif";
            ctx.fillText(`👉  ${currentWord.toUpperCase()}  👈`, canvas.width / 2, boxY + 66);
          }
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [videoUrl, startUs, endUs, subtitleText, subtitleStyle]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      const startSec = startUs / 1000000;
      if (video.currentTime < startSec || video.currentTime > endUs / 1000000) {
        video.currentTime = startSec;
      }
      video.play();
      setIsPlaying(true);
    }
  };

  const handleSave = () => {
    onSaveCandidate({
      ...currentCandidate,
      headline,
      transcriptText: subtitleText,
      selectedLayout: layout,
      startUs,
      endUs,
      durationUs: endUs - startUs,
      manualOverride: true,
    });
    alert('Perubahan subtitle dan kandidat berhasil disimpan!');
  };

  const formatSec = (us: number) => (us / 1000000).toFixed(1);

  if (!currentCandidate) {
    return <div style={{ padding: '2rem' }}>Tidak ada kandidat terpilih.</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button className="btn-secondary" onClick={onBackToGallery}>
          ← Kembali ke Galeri
        </button>
        <h3>Editor 9:16 — {currentCandidate.title}</h3>
        <button className="btn-primary" onClick={handleSave}>
          💾 Simpan Manual Override
        </button>
      </header>

      {/* Hidden real HTML5 Video element */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ display: 'none' }}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div style={styles.editorLayout}>
        {/* Panel Kiri - List Kandidat Interaktif */}
        <aside style={styles.sidebarLeft}>
          <h4 style={{ marginBottom: '0.75rem' }}>Daftar Kandidat Nyata</h4>
          {candidates.map((c) => {
            const isSelected = c.id === currentCandidate.id;
            return (
              <div
                key={c.id}
                onClick={() => handleSelectCandidate(c)}
                style={{
                  ...styles.candidateItem,
                  ...(isSelected ? styles.candidateItemActive : {}),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{c.title}</strong>
                  {isSelected && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Aktif</span>}
                </div>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {formatSec(c.startUs)}s - {formatSec(c.endUs)}s ({c.score.totalScore}/100)
                </p>
              </div>
            );
          })}
        </aside>

        {/* Panel Tengah - Preview 9:16 Canvas Realtime */}
        <main style={styles.centerPreview}>
          <div style={styles.playerFrame}>
            <div style={styles.aspect916}>
              {/* Real 9:16 Canvas rendering frames from video */}
              <canvas ref={canvasRef} width={360} height={640} style={{ width: '100%', height: '100%' }} />

              {/* Headline Teaser Overlay */}
              <div style={styles.headlineOverlay}>{headline || 'Headline Teaser Video'}</div>

              {/* Safe Area Overlay */}
              {showSafeArea && <div className="safe-area-overlay" />}
            </div>
          </div>

          <div style={styles.controlsBar}>
            <button className="btn-primary" onClick={togglePlay}>
              {isPlaying ? '⏸️ Pause Video' : '▶️ Play Preview 9:16'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={showSafeArea}
                onChange={(e) => setShowSafeArea(e.target.checked)}
              />
              Tampilkan Safe Area (TikTok / Shorts UI)
            </label>
          </div>
        </main>

        {/* Panel Kanan - Controls & Subtitle Editor */}
        <aside style={styles.sidebarRight}>
          <h4>Pengaturan Headline & Subtitle</h4>

          <div style={styles.controlGroup}>
            <label style={styles.label}>Headline Teaser Text</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>📝 Edit Teks Subtitle Suara Video</label>
            <textarea
              rows={4}
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              style={{ ...styles.input, resize: 'vertical', fontSize: '0.85rem' }}
              placeholder="Tulis atau pasing teks ucapan suara di sini agar pas 100%..."
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Ketik atau koreksi ucapan asli video untuk penyesuaian teks 100% pas.
            </span>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>✨ Gaya Subtitle (Kinetic Presets)</label>
            <select
              value={subtitleStyle}
              onChange={(e) => setSubtitleStyle(e.target.value as any)}
              style={styles.select}
            >
              <option value="kinetic">Kinetic Word Highlight (Warna Kuning Emas)</option>
              <option value="bold_banner">Bold Contrast Banner</option>
              <option value="minimal">Minimal White Text (Clean)</option>
            </select>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>Pola Layout 9:16</label>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as any)}
              style={styles.select}
            >
              <option value="smart_editorial">Smart Editorial (Deteksi Wajah)</option>
              <option value="center_focus">Fokus Tengah (Center Crop)</option>
              <option value="bg_blur">Background Blur</option>
              <option value="simple_subtitle">Subtitle Sederhana</option>
            </select>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>Informasi Video Sumber</label>
            <span className="badge badge-info">{selectedFile ? selectedFile.name : 'Video Asli'}</span>
          </div>

          <div style={styles.controlGroup}>
            <button
              className="btn-secondary"
              style={{ width: '100%', fontSize: '0.85rem' }}
              onClick={() => {
                setHeadline(currentCandidate.headline);
                setSubtitleText(currentCandidate.transcriptText || currentCandidate.headline);
                setLayout(currentCandidate.recommendedLayout);
              }}
            >
              🔄 Reset Rekomendasi
            </button>
          </div>
        </aside>
      </div>

      {/* Panel Bawah - Real Timeline Trimmer */}
      <footer style={styles.timelineFooter}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Timeline Trim & Seeking Video Nyata</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Start: {formatSec(startUs)}s | End: {formatSec(endUs)}s | Durasi: {formatSec(endUs - startUs)}s
          </span>
        </div>

        <div style={styles.timelineBar}>
          <input
            type="range"
            min={0}
            max={endUs - 1000000}
            step={100000}
            value={startUs}
            onChange={(e) => {
              const val = Number(e.target.value);
              setStartUs(val);
              if (videoRef.current) videoRef.current.currentTime = val / 1000000;
            }}
            style={{ width: '48%' }}
          />
          <input
            type="range"
            min={startUs + 1000000}
            max={300000000}
            step={100000}
            value={endUs}
            onChange={(e) => {
              const val = Number(e.target.value);
              setEndUs(val);
              if (videoRef.current) videoRef.current.currentTime = val / 1000000;
            }}
            style={{ width: '48%' }}
          />
        </div>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    height: 'calc(100vh - 120px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editorLayout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr 300px',
    gap: '1rem',
    flex: 1,
    minHeight: 0,
  },
  sidebarLeft: {
    background: 'var(--surface-card)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-md)',
    padding: '1rem',
    overflowY: 'auto',
  },
  candidateItem: {
    padding: '0.75rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-800)',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.2s ease',
  },
  candidateItemActive: {
    borderColor: 'var(--accent-primary)',
    background: 'var(--bg-dark-600)',
  },
  centerPreview: {
    background: 'var(--bg-dark-900)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    position: 'relative',
  },
  playerFrame: {
    height: '100%',
    maxHeight: '440px',
    aspectRatio: '9 / 16',
    background: '#000',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    position: 'relative',
  },
  aspect916: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  headlineOverlay: {
    position: 'absolute',
    top: '12%',
    width: '86%',
    left: '7%',
    background: 'rgba(99, 102, 241, 0.92)',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '0.5rem',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-md)',
    lineHeight: 1.3,
  },
  controlsBar: {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  sidebarRight: {
    background: 'var(--surface-card)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-md)',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    overflowY: 'auto',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  input: {
    padding: '0.6rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
  },
  select: {
    padding: '0.6rem',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-dark-900)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
  },
  timelineFooter: {
    background: 'var(--surface-card)',
    border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-md)',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  timelineBar: {
    display: 'flex',
    justifyContent: 'space-between',
  },
};
