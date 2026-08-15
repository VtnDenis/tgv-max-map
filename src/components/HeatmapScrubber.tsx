export type HeatmapSpeed = 'slow' | 'normal' | 'fast';

export const HEATMAP_SPEED_MS: Record<HeatmapSpeed, number> = {
  slow: 1200,
  normal: 600,
  fast: 250,
};

const SPEED_LABELS: Array<{ value: HeatmapSpeed; label: string }> = [
  { value: 'slow', label: 'Lent' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rapide' },
];

export interface HeatmapScrubberProps {
  dates: string[];
  index: number;
  playing: boolean;
  speed: HeatmapSpeed;
  cumulative: boolean;
  disabled?: boolean;
  dateLabel: string;
  onPlayToggle: () => void;
  onIndexChange: (index: number) => void;
  onSpeedChange: (speed: HeatmapSpeed) => void;
  onCumulativeChange: (cumulative: boolean) => void;
}

/** Temporal scrubber: play/pause + day slider + speed + cumulative toggle. */
export default function HeatmapScrubber({
  dates,
  index,
  playing,
  speed,
  cumulative,
  disabled = false,
  dateLabel,
  onPlayToggle,
  onIndexChange,
  onSpeedChange,
  onCumulativeChange,
}: HeatmapScrubberProps): JSX.Element {
  const max = Math.max(0, dates.length - 1);

  return (
    <div className="heatmap-scrubber">
      <div className="heatmap-scrubber-head">
        <button
          type="button"
          className="heatmap-play"
          aria-label={playing ? 'Pause' : 'Lecture'}
          disabled={disabled}
          onClick={onPlayToggle}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="heatmap-date">{dateLabel}</span>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={index}
        disabled={disabled}
        onChange={(e) => onIndexChange(Number(e.target.value))}
        aria-label="Jour de la fenêtre"
      />

      <div className="heatmap-scrubber-controls">
        <div className="heatmap-speed">
          {SPEED_LABELS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={speed === opt.value ? 'active' : undefined}
              onClick={() => onSpeedChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="heatmap-toggle">
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(e) => onCumulativeChange(e.target.checked)}
          />
          Cumulatif
        </label>
      </div>
    </div>
  );
}
