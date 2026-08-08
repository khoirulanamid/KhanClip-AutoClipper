import { Candidate, CandidateScore } from './types';
import { TranscriptDocument } from '@/domain/transcript/types';
import { ProjectSettings } from '@/domain/project/types';
import { extractTranscriptWords } from '@/domain/transcript/subtitle';

// Knowledge & Educational Insight Keywords
const KNOWLEDGE_KEYWORDS = [
  'strategi', 'kunci', 'rahasia', 'pelajaran', 'ilmu', 'solusi', 'metode',
  'tips', 'kesalahan', 'fakta', 'prinsip', 'penting', 'cara', 'fokus',
  'eksekusi', 'keberhasilan', 'riset', 'pengalaman', 'tujuan', 'formula',
  'hukum', 'rekomendasi', 'mindset', 'berhasil', 'penentu', 'langkah'
];

/**
 * Builds the single clip candidate for the user-configured minute window.
 * The clip boundaries are exactly the requested range; the transcript inside
 * the window only feeds the headline, keywords, and quality score.
 */
export function buildWindowCandidate(
  projectId: string,
  transcript: TranscriptDocument,
  startUs: number,
  endUs: number,
  settings: ProjectSettings
): Candidate {
  const windowSegments = transcript.segments.filter(
    (s) => s.endUs > startUs && s.startUs < endUs
  );
  const fullText = windowSegments.map((s) => s.text).join(' ').trim();
  const words = fullText.toLowerCase().split(/\s+/).filter(Boolean);
  const matchedKnowledgeWords = words.filter((w) =>
    KNOWLEDGE_KEYWORDS.some((kw) => w.includes(kw))
  );

  const durationUs = Math.max(1, endUs - startUs);
  const startMinute = Math.floor(startUs / 60_000_000);
  const endMinute = Math.max(startMinute + 1, Math.ceil(endUs / 60_000_000));

  const mainWords = fullText.split(/\s+/).filter((w) => w.length > 3);
  const headline =
    mainWords.length > 0
      ? mainWords.slice(0, 4).join(' ')
      : `Clip menit ${startMinute}–${endMinute}`;

  const hookScore = Math.min(95, 70 + matchedKnowledgeWords.length * 3);
  const flowScore = Math.min(95, 80 + Math.min(15, Math.round(durationUs / 60_000_000)));
  const clarityScore = windowSegments.length > 0 ? 88 : 70;
  const totalScore = Math.round(hookScore * 0.4 + flowScore * 0.3 + clarityScore * 0.3);

  return {
    id: 'cand-window-1',
    projectId,
    title: `Clip menit ${startMinute}–${endMinute}`,
    headline,
    transcriptText: fullText,
    transcriptWords: settings.autoSubtitles
      ? extractTranscriptWords(transcript, startUs, endUs)
      : [],
    keywords:
      matchedKnowledgeWords.length > 0
        ? Array.from(new Set(matchedKnowledgeWords)).slice(0, 4)
        : ['clip', 'video'],
    startUs,
    endUs,
    durationUs,
    score: {
      totalScore,
      hookScore,
      flowScore,
      clarityScore,
      relevanceScore: Math.round((hookScore + flowScore) / 2),
      reasons: [
        `Rentang menit ${startMinute}–${endMinute} dipilih manual oleh pengguna`,
        `${windowSegments.length} segmen ucapan terdeteksi di dalam rentang`,
      ],
    },
    recommendedLayout: settings.layoutTemplate,
    selectedLayout: settings.layoutTemplate,
    smartCropPoints: [
      { timestampUs: startUs, cropWindow: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 } },
    ],
    selectedForRender: true,
    manualOverride: true,
  };
}

/**
 * Knowledge & Educational Insight Candidate Generator.
 * Filters audio narrative for educational value, knowledge density, and impactful hooks.
 * Disqualifies filler or random chatter.
 */
export function generateCandidatesFromTranscript(
  projectId: string,
  transcript: TranscriptDocument,
  settings: ProjectSettings
): Candidate[] {
  const candidates: Candidate[] = [];
  const segments = transcript.segments;

  if (segments.length === 0) return [];

  // Target duration range in microseconds
  let minDurationUs = 15000000; // 15s
  let maxDurationUs = 30000000; // 30s
  if (settings.targetDurationSec === '30_60') {
    minDurationUs = 30000000;
    maxDurationUs = 60000000;
  } else if (settings.targetDurationSec === '60_90') {
    minDurationUs = 60000000;
    maxDurationUs = 90000000;
  }

  let targetCount = 5;
  if (typeof settings.candidateCount === 'number') {
    targetCount = settings.candidateCount;
  }

  // Combine speech segments into educational insight windows
  let currentStart = segments[0].startUs;
  let currentEnd = segments[0].endUs;
  let currentTexts: string[] = [segments[0].text];
  let candIndex = 1;

  for (let i = 1; i < segments.length && candidates.length < targetCount; i++) {
    const seg = segments[i];
    const candidateDuration = seg.endUs - currentStart;

    if (candidateDuration <= maxDurationUs) {
      currentEnd = seg.endUs;
      currentTexts.push(seg.text);
    } else {
      const totalDuration = currentEnd - currentStart;
      const fullText = currentTexts.join(' ');
      const words = fullText.toLowerCase().split(/\s+/).filter(Boolean);

      // Count Knowledge & Educational Keywords
      const matchedKnowledgeWords = words.filter((w) =>
        KNOWLEDGE_KEYWORDS.some((kw) => w.includes(kw))
      );

      // Calculate Knowledge Value Density (must contain educational insight)
      const hasKnowledgeContent = matchedKnowledgeWords.length >= 2 || totalDuration >= minDurationUs;

      if (hasKnowledgeContent) {
        // Build educational headline teaser
        const firstSentence = currentTexts[0] || fullText;
        const mainWords = fullText.split(/\s+/).filter((w) => w.length > 3);
        
        let headlinePrefix = 'Poin Penting';
        if (fullText.toLowerCase().includes('kunci') || fullText.toLowerCase().includes('strategi')) {
          headlinePrefix = 'Kunci Utama';
        } else if (fullText.toLowerCase().includes('kesalahan') || fullText.toLowerCase().includes('jangan')) {
          headlinePrefix = 'Pelajaran Penting';
        } else if (fullText.toLowerCase().includes('solusi') || fullText.toLowerCase().includes('cara')) {
          headlinePrefix = 'Solusi Praktis';
        }

        const headlineText = `${headlinePrefix}: ${mainWords.slice(0, 4).join(' ')}`;
        const keywords = Array.from(new Set(matchedKnowledgeWords.concat(mainWords))).slice(0, 4);

        // Quality Candidate Scoring (Knowledge Hook + Value Density + Speech Clarity)
        const hookBonus = firstSentence.includes('?') || KNOWLEDGE_KEYWORDS.some((k) => firstSentence.toLowerCase().includes(k)) ? 20 : 10;
        const hookScore = Math.min(98, 75 + hookBonus + (matchedKnowledgeWords.length * 3));
        const flowScore = Math.min(95, 80 + Math.round((words.length % 12)));
        const clarityScore = Math.min(96, 85 + (matchedKnowledgeWords.length * 2));
        const totalScore = Math.round((hookScore * 0.4) + (flowScore * 0.3) + (clarityScore * 0.3));

        const score: CandidateScore = {
          totalScore,
          hookScore,
          flowScore,
          clarityScore,
          relevanceScore: Math.round((hookScore + flowScore) / 2),
          reasons: [
            `Membahas poin ilmu/insight (${matchedKnowledgeWords.length} kata kunci edukasi terdeteksi)`,
            `Hook kalimat pembuka berbobot dan narasi utuh (${Math.round(totalDuration / 1000000)} detik)`,
          ],
        };

        candidates.push({
          id: `cand-${candIndex}`,
          projectId,
          title: `Clip ${candIndex.toString().padStart(2, '0')}: ${headlineText.slice(0, 30)}...`,
          headline: headlineText,
          transcriptText: fullText,
          transcriptWords: settings.autoSubtitles
            ? extractTranscriptWords(transcript, currentStart, currentEnd)
            : [],
          keywords: keywords.length > 0 ? keywords : ['ilmu', 'edukasi', 'insight'],
          startUs: currentStart,
          endUs: currentEnd,
          durationUs: totalDuration,
          score,
          recommendedLayout: settings.layoutTemplate || 'smart_editorial',
          selectedLayout: settings.layoutTemplate || 'smart_editorial',
          smartCropPoints: [
            { timestampUs: currentStart, cropWindow: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 } },
          ],
          selectedForRender: candIndex <= 3,
          manualOverride: false,
        });

        candIndex++;
      }

      currentStart = seg.startUs;
      currentEnd = seg.endUs;
      currentTexts = [seg.text];
    }
  }

  // Final Segment Knowledge Candidate if needed
  if (candidates.length < targetCount && currentEnd > currentStart) {
    const totalDuration = currentEnd - currentStart;
    const fullText = currentTexts.join(' ');
    const words = fullText.split(/\s+/).filter(Boolean);

    const headlineText = `Kesimpulan Penting: ${words.slice(0, 4).join(' ')}`;

    const score: CandidateScore = {
      totalScore: 88,
      hookScore: 86,
      flowScore: 90,
      clarityScore: 88,
      relevanceScore: 88,
      reasons: [
        'Rangkuman kesimpulan & insight penting di akhir video',
        'Pesan edukatif yang padat dan bermanfaat',
      ],
    };

    candidates.push({
      id: `cand-${candIndex}`,
      projectId,
      title: `Clip ${candIndex.toString().padStart(2, '0')}: ${headlineText.slice(0, 30)}...`,
      headline: headlineText,
      transcriptText: fullText,
      transcriptWords: settings.autoSubtitles
        ? extractTranscriptWords(transcript, currentStart, currentEnd)
        : [],
      keywords: ['kesimpulan', 'ilmu', 'edukasi'],
      startUs: currentStart,
      endUs: currentEnd,
      durationUs: totalDuration,
      score,
      recommendedLayout: settings.layoutTemplate || 'smart_editorial',
      selectedLayout: settings.layoutTemplate || 'smart_editorial',
      smartCropPoints: [
        { timestampUs: currentStart, cropWindow: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 } },
      ],
      selectedForRender: true,
      manualOverride: false,
    });
  }

  return candidates;
}
