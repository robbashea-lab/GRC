import './SurfaceThemeAction.css';

// Presentation only: the caller retains its existing shared workspace-theme handler.
export default function SurfaceThemeAction({theme, onTheme, className = ''}) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className={`surface-theme-action ${className}`.trim()}
    aria-label={`Switch to ${next} theme`} onClick={onTheme}>
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15"/>
    </svg><span>{next === 'dark' ? 'Dark' : 'Light'}</span>
  </button>;
}
