import React, { useEffect, useRef, useState } from 'react';
import { Candidate } from '@/domain/candidate/types';
import {
  buildCandidateSubtitleTrack,
  getActiveSubtitleCue,
  getActiveWord,
  usToSeconds,
  secondsToUs,
} from '@/domain/transcript/subtitle';
import { TranscriptWord, SubtitleTrack } from '@/domain/transcript/types';
import { renderCanvasOverlays, SubtitlePresetStyle } from '@/domain/render/canvas_overlay';

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
  const [subtitleText, setSubtitleText] = useState(currentCandidate?.transcriptText || '');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitlePresetStyle>('kinetic');
  const [layout, setLayout] = useState(currentCandidate?.selectedLayout || 'smart_editorial');
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [startUs, setStartUs] = useState(currentCandidate?.startUs || 0);
  const [endUs, setEndUs] = useState(currentCandidate?.endUs || 30000000);
  const [globalOffsetMs, setGlobalOffsetMs] = useState(0); // -500ms to +500ms
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribingLive, setIsTranscribingLive] = useState(false);
  const [transcriptionDone, setTranscriptionDone] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    setVideoUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  // Build strict transcript words and track rebased to localStartUs = sourceStartUs - candidateStartUs
  const transcriptWords: TranscriptWord[] = (subtitleText || headline || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, idx, arr) => {
      const durUs = Math.max(200_000, Math.round((endUs - startUs) / Math.max(1, arr.length)));
      const srcStart = startUs + idx * durUs;
      return {
        id: `w-${idx}`,
        text: word,
        sourceStartUs: srcStart,
        sourceEndUs: Math.min(endUs, srcStart + durUs),
        timingPrecision: 'word-native',
      };
    });

  const subtitleTrack: SubtitleTrack = buildCandidateSubtitleTrack(
    transcriptWords,
    startUs,
    endUs,
    globalOffsetMs * 1000 // Convert ms to us
  );

  const handleSelectCandidate = (cand: Candidate) => {
    setActiveId(cand.id);
    setHeadline(cand.headline);
    setSubtitleText(cand.transcriptText || '');
    setLayout(cand.selectedLayout);
    setStartUs(cand.startUs);
    setEndUs(cand.endUs);

    const video = videoRef.current;
    if (video) {
      video.currentTime = usToSeconds(cand.startUs);
    }
  };

  const handleStartLiveSpeechRecognition = () => {
    const SpeechRecognition = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    const video = videoRef.current;

    if (!SpeechRecognition) {
      alert('Fitur Speech Recognition memerlukan peramban Chrome atau Edge Desktop.');
      return;
    }
    if (!video) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.continuous = true;
      recognition.interimResults = true;

      setIsTranscribingLive(true);
      setTranscriptionDone(false);
      video.currentTime = usToSeconds(startUs);
      video.muted = false;
      video.volume = 1.0;
      video.play();
      setIsPlaying(true);

      recognition.onresult = (event: any) => {
        let liveText = '';
        for (let i = 0; i < event.results.length; i++) {
          liveText += event.results[i][0].transcript + ' ';
        }
        if (liveText.trim()) {
          setSubtitleText(liveText.trim());
        }
      };

      recognition.onerror = () => {
        setIsTranscribingLive(false);
        setTranscriptionDone(true);
      };

      recognition.onend = () => {
        setIsTranscribingLive(false);
        setTranscriptionDone(true);
      };

      recognition.start();

      const checkEnd = setInterval(() => {
        if (video.currentTime >= usToSeconds(endUs) || video.paused) {
          clearInterval(checkEnd);
          try { recognition.stop(); } catch (e) {}
          setIsTranscribingLive(false);
          setTranscriptionDone(true);
        }
      }, 500);
    } catch (e) {
      setIsTranscribingLive(false);
      setTranscriptionDone(true);
    }
  };

  // Synchronize 9:16 Canvas rendering using professional renderCanvasOverlays Helper
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

        // Microsecond local time rebased from video.currentTime
        const sourceTimeUs = secondsToUs(video.currentTime);
        const localTimeUs = Math.max(0, sourceTimeUs - startUs);

        // Resolve active subtitle cue via shared getActiveSubtitleCue
        const activeCue = getActiveSubtitleCue(localTimeUs, subtitleTrack.cues);
        const activeWord = activeCue ? getActiveWord(localTimeUs, activeCue) : null;

        // Professional Typography Canvas Overlay Renderer
        renderCanvasOverlays({
          canvas,
          ctx,
          headlineText: headline,
          activeCue,
          activeWord,
          presetStyle: subtitleStyle,
          showSafeArea,
        });
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [videoUrl, startUs, endUs, subtitleTrack, subtitleStyle, headline, showSafeArea]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      const startSec = usToSeconds(startUs);
      if (video.currentTime < startSec || video.currentTime > usToSeconds(endUs)) {
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
    alert('Perubahan subtitle dan timing berhasil disimpan!');
  };

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

      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ display: 'none' }}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div style={styles.editorLayout}>
        {/* Panel Kiri - List Kandidat */}
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
                  {usToSeconds(c.startUs).toFixed(1)}s - {usToSeconds(c.endUs).toFixed(1)}s ({c.score.totalScore}/100)
                </p>
              </div>
            );
          })}
        </aside>

        {/* Panel Tengah - Preview 9:16 Canvas */}
        <main style={styles.centerPreview}>
          <div style={styles.playerFrame}>
            <div style={styles.aspect916}>
              <canvas ref={canvasRef} width={360} height={640} style={{ width: '100%', height: '100%' }} />
              {showSafeArea && <div className="safe-area-overlay" />}
            </div>
          </div>

          <div style={styles.controlsBar}>
            <button className="btn-primary" onClick={togglePlay}>
              {isPlaying ? '⏸️ Pause Video' : '▶️ Play Preview 9:16'}
            </button>
            <button
              className="btn-secondary"
              onClick={handleStartLiveSpeechRecognition}
              disabled={isTranscribingLive}
              style={{
                background: isTranscribingLive
                  ? 'var(--accent-warning)'
                  : transcriptionDone
                  ? 'var(--accent-success)'
                  : undefined,
                color: transcriptionDone && !isTranscribingLive ? '#fff' : undefined,
              }}
            >
              {isTranscribingLive
                ? '🎙️ Mendengarkan Suara Video...'
                : transcriptionDone
                ? '✅ Transkripsi Selesai'
                : '🎙️ Transkripsikan Suara Otomatis'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={showSafeArea}
                onChange={(e) => setShowSafeArea(e.target.checked)}
              />
              Safe Area
            </label>
          </div>
        </main>

        {/* Panel Kanan - Controls & Subtitle Editor */}
        <aside style={styles.sidebarRight}>
          <h4>Pengaturan Headline & Subtitle</h4>

          <div style={styles.controlGroup}>
            <label style={styles.label}>Headline Teaser Text (Hook Atas)</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>📝 Edit Teks Subtitle (Suara Video)</label>
            <textarea
              rows={5}
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              style={{ ...styles.input, resize: 'vertical', fontSize: '0.85rem' }}
              placeholder="Ucapan suara pembicara di video..."
            />
          </div>

          <div style={styles.controlGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label style={styles.label}>⏱️ Subtitle Global Offset</label>
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-secondary)' }}>
                {globalOffsetMs > 0 ? `+${globalOffsetMs}` : globalOffsetMs} ms
              </span>
            </div>
            <input
              type="range"
              min={-500}
              max={500}
              step={25}
              value={globalOffsetMs}
              onChange={(e) => setGlobalOffsetMs(Number(e.target.value))}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Geser untuk memajukan/menderaskan waktu subtitle (-500ms s/d +500ms).
            </span>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>✨ Preset Subtitle (Typography Style)</label>
            <select
              value={subtitleStyle}
              onChange={(e) => setSubtitleStyle(e.target.value as any)}
              style={styles.select}
            >
              <option value="kinetic">Kinetic Modern (Gold Accent)</option>
              <option value="clean_bold">Clean Bold (No Box)</option>
              <option value="podcast_premium">Podcast Premium (Dark Glass Box)</option>
              <option value="alex_style">Alex Style (Yellow Highlight)</option>
              <option value="editorial_elegant">Editorial Elegant</option>
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
            <button
              className="btn-secondary"
              style={{ width: '100%', fontSize: '0.85rem' }}
              onClick={() => {
                setHeadline(currentCandidate.headline);
                setSubtitleText(currentCandidate.transcriptText || '');
                setLayout(currentCandidate.recommendedLayout);
                setGlobalOffsetMs(0);
              }}
            >
              🔄 Reset Rekomendasi
            </button>
          </div>
        </aside>
      </div>

      {/* Panel Bawah - Timeline Trimmer */}
      <footer style={styles.timelineFooter}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Timeline Trim & Seeking Video Nyata</h4>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Start: {usToSeconds(startUs).toFixed(1)}s | End: {usToSeconds(endUs).toFixed(1)}s | Durasi: {usToSeconds(endUs - startUs).toFixed(1)}s
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
              if (videoRef.current) videoRef.current.currentTime = usToSeconds(val);
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
              if (videoRef.current) videoRef.current.currentTime = usToSeconds(val);
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
  controlsBar: {
    marginTop: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
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
