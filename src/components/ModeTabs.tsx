import type { Mode } from '../types';

export interface ModeTabsProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

interface Tab {
  mode: Mode;
  label: string;
}

const TABS: Tab[] = [
  { mode: 'origin', label: 'Depuis une gare' },
  { mode: 'destination', label: 'Vers une gare' },
  { mode: 'itinerary', label: 'Itinéraire' },
];

/** Tab selector for choosing the map's interaction mode. */
export default function ModeTabs({ mode, onChange }: ModeTabsProps): JSX.Element {
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          className={tab.mode === mode ? 'active' : undefined}
          onClick={() => onChange(tab.mode)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
