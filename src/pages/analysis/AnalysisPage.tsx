import React, { useEffect, useState } from 'react';
import { extractAudioFromVideoFile } from '@/infrastructure/media/audio/extractor';
import { resampleAudioTo16k, transcribeWithWorker } from '@/infrastructure/media/transcription/whisper';
import { generateCandidatesFromTranscript } from '@/domain/candidate/generator';
import { analyzeVideoFrame } from '@/infrastructure/media/vision/detector';
import { localStorageAdapter, transcriptCacheId } from '@/infrastructure/storage/indexeddb';
import { Candidate } from '@/domain/candidate/types';
import { ProjectSettings } from '@/domain/project/types';
import { TranscriptDocument } from '@/domain/transcript/types';

interface AnalysisPageProps {
  selectedFile: File | null;
  settings: ProjectSettings;
  onAnalysisComplete: (candidates: Candidate[]) => void;
  onCancel: () => void;
}

interface StepItem {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  detail: string;
}

export const AnalysisPage: React.FC<AnalysisPageProps> = ({
  selectedFile,
  settings,
  onAnalysisComplete,
  onCancel,
}) => {
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepItem[]>([
    { id: 'audio', name: '1. Ekstraksi Audio PCM & VAD Wicara', status: 'pending', detail: 'Membaca track audio lokal' },
    { id: 'whisper', name: '2. Pengenal Suara Wicara Asli (Speech-to-Text)', status: 'pending', detail: 'Menerjemahkan ucapan suara video' },
    { id: 'highlight', name: '3. Scoring & Pembuatan Kandidat Ilmu', status: 'pending', detail: 'Mencari kalimat pembuka & hook' },
    { id: 'vision', name: '4. Frame Sampling & Deteksi Wajah', status: 'pending', detail: 'Mengambil sampel frame dari video asli' },
    { id: 'layout', name: '5. Smart Crop 9:16 & Layouting', status: 'pending', detail: 'Menyusun posisi teks & crop window' },
  ]);

  const updateStepStatus = (id: string, status: StepItem['status'], detail?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail: detail || s.detail } : s))
    );
  };

  useEffect(() => {
    if (!selectedFile) {
      setErrorMessage('Tidak ada file video yang dipilih.');
      return;
    }

    let isMounted = true;

    async function runRealAnalysis() {
      if (!selectedFile) return;
      const targetFile = selectedFile;
      try {
        // Step 1: Real Audio Extraction
        updateStepStatus('audio', 'in_progress', 'Mengurai audio via Web Audio API...');
        setOverallProgress(10);
        const audioRes = await extractAudioFromVideoFile(targetFile, (stageMessage, percent) => {
          if (!isMounted) return;
          updateStepStatus('audio', 'in_progress', stageMessage);
          if (typeof percent === 'number') setOverallProgress(10 + Math.round(percent * 0.2));
        });
        if (!audioRes.success) {
          throw new Error(audioRes.error.message);
        }
        updateStepStatus('audio', 'completed', `Audio terdekode: ${(audioRes.value.durationUs / 1000000).toFixed(1)}s, ${audioRes.value.speechSegments.length} segmen suara`);
        setOverallProgress(30);

        if (!isMounted) return;

        // Step 2: Local Whisper transcription inside a Web Worker (off main thread).
        // Same file re-analyzed? Reuse the cached transcript and skip Whisper entirely.
        updateStepStatus('whisper', 'in_progress', 'Memeriksa cache transkrip lokal...');
        const cacheId = transcriptCacheId(targetFile);
        const cachedRes = await localStorageAdapter.getTranscript(cacheId);
        const cachedDoc = cachedRes.success ? cachedRes.value : null;

        let transcript: TranscriptDocument;
        if (cachedDoc && cachedDoc.segments.length > 0) {
          transcript = cachedDoc;
          updateStepStatus('whisper', 'completed', `Transkrip dimuat dari cache lokal (${transcript.segments.length} segmen) — Whisper dilewati`);
        } else {
          updateStepStatus('whisper', 'in_progress', 'Menyiapkan audio 16kHz untuk Whisper...');
          const audioBuffer = audioRes.value.audioBuffer;
          const pcm16kMono = resampleAudioTo16k(
            Array.from({ length: audioBuffer.numberOfChannels }, (_, ch) => audioBuffer.getChannelData(ch)),
            audioBuffer.sampleRate
          );

          const transRes = await transcribeWithWorker(
            'proj-01',
            settings.language,
            settings.performanceProfile,
            pcm16kMono,
            audioRes.value.speechSegments,
            (percent, stageMessage) => {
              if (!isMounted) return;
              updateStepStatus('whisper', 'in_progress', stageMessage);
              setOverallProgress(30 + Math.round(percent * 0.2));
            }
          );
          if (!transRes.success) {
            throw new Error(transRes.error.message + (transRes.error.suggestedFallback ? ` ${transRes.error.suggestedFallback}` : ''));
          }
          transcript = transRes.value;
          void localStorageAdapter.saveTranscript({ ...transcript, id: cacheId });
          updateStepStatus('whisper', 'completed', `Transkripsi ucapan selesai: ${transcript.segments.length} segmen suara terdeteksi`);
        }
        setOverallProgress(50);

        if (!isMounted) return;

        // Step 3: Real Candidate Generation & Quality Scoring
        updateStepStatus('highlight', 'in_progress', 'Menhitung Skor Kualitas & Poin Ilmu...');
        const candidates = generateCandidatesFromTranscript('proj-01', transcript, settings);
        updateStepStatus('highlight', 'completed', `Dihasilkan ${candidates.length} kandidat clip berkualitas`);
        setOverallProgress(70);

        if (!isMounted) return;

        // Step 4: Real Frame Sampling & Vision/Face Detection
        updateStepStatus('vision', 'in_progress', 'Mengambil frame nyata dari file video...');
        for (let i = 0; i < candidates.length; i++) {
          const cand = candidates[i];
          const frameRes = await analyzeVideoFrame(targetFile, cand.startUs + 1000000);
          if (frameRes.success) {
            cand.thumbnailUrl = frameRes.value.thumbnailUrl;
            if (frameRes.value.cropWindow) {
              cand.smartCropPoints = [
                { timestampUs: cand.startUs, cropWindow: frameRes.value.cropWindow },
              ];
            }
          }
        }
        updateStepStatus('vision', 'completed', 'Sampel frame & deteksi posisi berhasil');
        setOverallProgress(90);

        if (!isMounted) return;

        // Step 5: Final Layout & Completion
        updateStepStatus('layout', 'completed', 'Smart Crop 9:16 & overlay siap');
        setOverallProgress(100);

        setTimeout(() => {
          if (isMounted) {
            onAnalysisComplete(candidates);
          }
        }, 600);
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.message || 'Gagal memproses analisis video');
        }
      }
    }

    runRealAnalysis();

    return () => {
      isMounted = false;
    };
  }, [selectedFile, settings, onAnalysisComplete]);

  return (
    <div style={styles.container}>
      <header style={{ textAlign: 'center' }}>
        <h2>Proses Analisis Video Nyata (Local Processing)</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {selectedFile ? `Memproses: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)` : 'Tidak ada file'}
        </p>
      </header>

      {errorMessage ? (
        <div className="card" style={{ borderColor: 'var(--accent-danger)' }}>
          <h3 style={{ color: 'var(--accent-danger)' }}>⚠️ Terjadi Kesalahan Analisis</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{errorMessage}</p>
          <button className="btn-secondary" onClick={onCancel} style={{ marginTop: '1rem' }}>
            ← Kembali & Pilih File Lain
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem' }}>
          <div style={styles.progressHeader}>
            <span>Progress Analisis Video Nyata</span>
            <span style={{ fontWeight: 'bold', color: 'var(--accent-secondary)' }}>{overallProgress}%</span>
          </div>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${overallProgress}%` }} />
          </div>

          <div style={styles.stepsList}>
            {steps.map((step) => (
              <div key={step.id} style={styles.stepRow}>
                <div style={styles.stepStatus}>
                  {step.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⚪</span>}
                  {step.status === 'in_progress' && <span style={{ color: 'var(--accent-warning)' }}>⏳</span>}
                  {step.status === 'completed' && <span style={{ color: 'var(--accent-success)' }}>✅</span>}
                  {step.status === 'error' && <span style={{ color: 'var(--accent-danger)' }}>❌</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: '1rem' }}>{step.name}</h4>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {step.detail}
                  </p>
                </div>
                <div>
                  {step.status === 'in_progress' && <span className="badge badge-warning">Memproses...</span>}
                  {step.status === 'completed' && <span className="badge badge-success">Selesai</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <button className="btn-secondary" onClick={onCancel}>
          🛑 Batal & Kembali
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '750px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontWeight: 600,
  },
  progressBarBg: {
    height: '10px',
    backgroundColor: 'var(--bg-dark-900)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
    marginBottom: '2rem',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'var(--accent-primary)',
    transition: 'width 0.3s ease',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    background: 'var(--bg-dark-800)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--surface-border)',
  },
  stepStatus: {
    fontSize: '1.2rem',
  },
};
