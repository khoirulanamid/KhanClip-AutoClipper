import React from 'react';

interface HeaderProps {
  currentStep: string;
  onNavigateStep: (step: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentStep, onNavigateStep }) => {
  const steps = [
    { id: 'landing', label: 'Landing' },
    { id: 'compatibility', label: 'Cek Browser' },
    { id: 'configure', label: 'Konfigurasi' },
    { id: 'analysis', label: 'Analisis' },
    { id: 'candidates', label: 'Kandidat' },
    { id: 'editor', label: 'Editor' },
    { id: 'render-queue', label: 'Antrean Render' },
    { id: 'settings', label: 'Pengaturan' },
  ];

  return (
    <header style={styles.header}>
      <div style={styles.logoContainer} onClick={() => onNavigateStep('landing')} tabIndex={0} role="button">
        <div style={styles.logoBadge}>EF</div>
        <div>
          <h1 style={styles.logoText}>
            EditFlow <span style={styles.subLogoText}>Auto Clipper</span>
          </h1>
          <p style={styles.tagline}>Local browser-only clipper</p>
        </div>
      </div>

      <nav style={styles.nav}>
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => onNavigateStep(step.id)}
              className={`nav-btn${isActive ? ' nav-btn-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {step.label}
            </button>
          );
        })}
      </nav>

      <div style={styles.statusBadge}>
        <span style={styles.statusDot} />
        100% Local
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    padding: '0 1.5rem',
    minHeight: '56px',
    backgroundColor: 'var(--bg-dark-900)',
    borderBottom: '1px solid var(--surface-border)',
    flexWrap: 'wrap',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    cursor: 'pointer',
  },
  logoBadge: {
    background: 'var(--accent-primary)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.75rem',
    letterSpacing: '0.02em',
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoText: {
    fontSize: '0.95rem',
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.2,
  },
  subLogoText: {
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  tagline: {
    fontSize: '0.68rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    margin: 0,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.125rem',
    overflowX: 'auto',
    maxWidth: '100%',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: 'var(--text-secondary)',
    border: '1px solid var(--surface-border)',
    background: 'var(--bg-dark-800)',
    padding: '0.3rem 0.75rem',
    borderRadius: 'var(--radius-full)',
    whiteSpace: 'nowrap',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--accent-success)',
    display: 'inline-block',
  },
};
