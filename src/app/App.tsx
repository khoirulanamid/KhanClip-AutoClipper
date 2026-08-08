import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { LandingPage } from '@/pages/landing/LandingPage';
import { CompatibilityPage } from '@/pages/compatibility/CompatibilityPage';
import { ConfigurePage } from '@/pages/configure/ConfigurePage';
import { AnalysisPage } from '@/pages/analysis/AnalysisPage';
import { CandidateGalleryPage } from '@/pages/candidates/CandidateGalleryPage';
import { EditorPage } from '@/pages/editor/EditorPage';
import { RenderQueuePage } from '@/pages/render-queue/RenderQueuePage';
import { SettingsPage } from '@/pages/settings/SettingsPage';

import { ProjectSettings } from '@/domain/project/types';
import { Candidate } from '@/domain/candidate/types';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<string>('landing');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
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
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string>('');
  const [selectedForRenderIds, setSelectedForRenderIds] = useState<string[]>([]);

  const handleSelectFile = (file: File) => {
    setSelectedFile(file);
    setCurrentStep('configure');
  };

  const handleStartAnalysis = (settings: ProjectSettings) => {
    setProjectSettings(settings);
    setCurrentStep('analysis');
  };

  const handleRealAnalysisComplete = (generatedCandidates: Candidate[]) => {
    setCandidates(generatedCandidates);
    if (generatedCandidates.length > 0) {
      setActiveCandidateId(generatedCandidates[0].id);
      setSelectedForRenderIds(generatedCandidates.filter((c) => c.selectedForRender).map((c) => c.id));
    }
    setCurrentStep('candidates');
  };

  const handleEditCandidate = (candidateId: string) => {
    setActiveCandidateId(candidateId);
    setCurrentStep('editor');
  };

  const handleSaveCandidate = (updated: Candidate) => {
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleProceedToRenderQueue = (ids: string[]) => {
    setSelectedForRenderIds(ids);
    setCurrentStep('render-queue');
  };

  return (
    <div className="app-container">
      <Header currentStep={currentStep} onNavigateStep={(step) => setCurrentStep(step)} />

      <main className="main-content">
        {currentStep === 'landing' && (
          <LandingPage
            onSelectFile={handleSelectFile}
            onNavigateToCompat={() => setCurrentStep('compatibility')}
          />
        )}

        {currentStep === 'compatibility' && (
          <CompatibilityPage onContinue={() => setCurrentStep('configure')} />
        )}

        {currentStep === 'configure' && (
          <ConfigurePage
            selectedFile={selectedFile}
            onStartAnalysis={handleStartAnalysis}
          />
        )}

        {currentStep === 'analysis' && (
          <AnalysisPage
            selectedFile={selectedFile}
            settings={projectSettings}
            onAnalysisComplete={handleRealAnalysisComplete}
            onCancel={() => setCurrentStep('configure')}
          />
        )}

        {currentStep === 'candidates' && (
          <CandidateGalleryPage
            candidates={candidates}
            onSelectCandidateToEdit={handleEditCandidate}
            onProceedToRenderQueue={handleProceedToRenderQueue}
          />
        )}

        {currentStep === 'editor' && (
          <EditorPage
            selectedFile={selectedFile}
            candidates={candidates}
            activeCandidateId={activeCandidateId}
            onSaveCandidate={handleSaveCandidate}
            onBackToGallery={() => setCurrentStep('candidates')}
          />
        )}

        {currentStep === 'render-queue' && (
          <RenderQueuePage
            selectedFile={selectedFile}
            candidates={candidates}
            selectedCandidateIds={selectedForRenderIds}
            onBackToGallery={() => setCurrentStep('candidates')}
          />
        )}

        {currentStep === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
};
