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
          <h1 style={styles.logoText}>EditFlow <span style={styles.subLogoText}>Auto Clipper</span></h1>
          <p style={styles.tagline}>Local Browser-Only Clipper</p>
        </div>
      </div>

      <nav style={styles.nav}>
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => onNavigateStep(step.id)}
              style={{
                ...styles.navButton,
                ...(isActive ? styles.navButtonActive : {}),
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              {step.label}
            </button>
          );
        })}
      </nav>

      <div style={styles.privacyBadge}>
        <span className="badge badge-success">🔒 100% Local</span>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--bg-dark-800)',
    borderBottom: '1px solid var(--surface-border)',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
  },
  logoBadge: {
    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '1.2rem',
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'content',
    paddingLeft: '6px',
  },
  logoText: {
    fontSize: '1.1rem',
    margin: 0,
    lineHeight: 1.1,
  },
  subLogoText: {
    color: 'var(--accent-secondary)',
    fontWeight: 'normal',
  },
  tagline: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    maxWidth: '100%',
  },
  navButton: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '0.85rem',
    padding: '0.5rem 0.75rem',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    whiteSpace: 'nowrap',
  },
  navButtonActive: {
    background: 'var(--bg-dark-600)',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  privacyBadge: {
    display: 'flex',
    alignItems: 'center',
  },
};
