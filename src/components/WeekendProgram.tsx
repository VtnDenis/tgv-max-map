import type { WeekendProgram } from '../types';
import { formatDayLabel } from '../lib/format';

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatStay(minutes: number): string {
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days === 0) return `${hours} h`;
  return `${days} j ${hours} h`;
}

interface WeekendProgramProps {
  program: WeekendProgram;
  onReroll: () => void;
  onPostcard: () => void;
  onSelect: (code: string) => void;
}

export default function WeekendProgram({
  program,
  onReroll,
  onPostcard,
  onSelect,
}: WeekendProgramProps): JSX.Element {
  const stayMin = program.inbound.dep - program.outbound.arr;

  return (
    <div className="weekend-program">
      <div
        className="weekend-title"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(program.destination.code)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(program.destination.code);
          }
        }}
      >
        Week-end à <strong>{program.destination.name}</strong>
      </div>
      <div className="hint muted">
        {formatDate(program.friday)} → {formatDate(program.sunday)}
      </div>

      <div className="weekend-leg">
        <div className="weekend-leg-label">
          Aller{program.outbound.date ? ` · ${formatDayLabel(program.outbound.date)}` : ''}
        </div>
        <div className="row">
          <span className="station">
            {program.outbound.fromName} → {program.outbound.toName}
          </span>
        </div>
        <div className="row">
          <span className="time">
            {formatTime(program.outbound.dep)} → {formatTime(program.outbound.arr)}
          </span>
          <span className="badge leg">train {program.outbound.trainNo}</span>
        </div>
      </div>

      <div className="weekend-leg">
        <div className="weekend-leg-label">
          Retour{program.inbound.date ? ` · ${formatDayLabel(program.inbound.date)}` : ''}
        </div>
        <div className="row">
          <span className="station">
            {program.inbound.fromName} → {program.inbound.toName}
          </span>
        </div>
        <div className="row">
          <span className="time">
            {formatTime(program.inbound.dep)} → {formatTime(program.inbound.arr)}
          </span>
          <span className="badge leg">train {program.inbound.trainNo}</span>
        </div>
      </div>

      <div className="hint muted">Séjour : {formatStay(stayMin)}</div>

      <div className="weekend-actions">
        <button type="button" className="primary" onClick={onPostcard}>
          Carte postale
        </button>
        <button type="button" className="secondary" onClick={onReroll}>
          Autre destination
        </button>
      </div>
    </div>
  );
}
