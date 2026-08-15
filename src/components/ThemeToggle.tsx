export interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

/** Button to switch between light and dark theme. */
export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps): JSX.Element {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
      title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
      onClick={onToggle}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
