import { getRegularity } from '../lib/regularite';

const AXES = ['Nord', 'Atlantique', 'Sud-Est', 'Est', 'Europe'];

function barColor(regularite: number): string {
  if (regularite >= 80) return 'var(--ok)';
  if (regularite >= 70) return 'var(--warn)';
  return 'var(--accent)';
}

export default function PunctualityPanel(): JSX.Element {
  const regularity = getRegularity();
  return (
    <details className="field">
      <summary>Ponctualité TGV (par axe)</summary>
      {AXES.map((axe) => {
        const entry = regularity[axe];
        if (!entry) return null;
        return (
          <div className="punctuality-row" key={axe}>
            <div className="punctuality-label">
              <span>{axe}</span>
              <span>{entry.regularite}%</span>
            </div>
            <div className="punctuality-track">
              <div
                className="punctuality-bar"
                style={{
                  width: `${Math.min(100, entry.regularite)}%`,
                  background: barColor(entry.regularite),
                }}
              />
            </div>
            <div className="muted punctuality-ponctualite">
              ponctualité au départ : {entry.ponctualite}%
            </div>
          </div>
        );
      })}
    </details>
  );
}
