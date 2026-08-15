import type { Mode } from '../types';

export interface ModeTabsProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

interface Tab {
  mode: Mode;
  label: string;
  hint?: string;
}

const TABS: Tab[] = [
  { mode: 'origin', label: 'Depuis une gare', hint: 'Toutes les destinations disponibles depuis une gare' },
  { mode: 'destination', label: 'Vers une gare', hint: 'Toutes les origines permettant de rejoindre une gare' },
  { mode: 'itinerary', label: 'Itinéraire', hint: 'Trajets multi-étapes avec correspondances' },
  { mode: 'rayon', label: 'Rayon', hint: 'Destinations dans un rayon autour d’une gare' },
  { mode: 'challenges', label: 'Défis & records', hint: 'Défis et records à relever depuis une gare' },
  { mode: 'heatmap', label: 'Carte de chauffe', hint: 'Activité du réseau jour par jour' },
];

/** Tab selector for choosing the map's interaction mode. */
export default function ModeTabs({ mode, onChange }: ModeTabsProps): JSX.Element {
  return (
    <div className="tabs mode-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          className={tab.mode === mode ? 'active' : undefined}
          title={tab.hint}
          onClick={() => onChange(tab.mode)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
