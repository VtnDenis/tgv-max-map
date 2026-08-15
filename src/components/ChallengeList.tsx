import type { ChallengeResult } from '../types';

export interface ChallengeListProps {
  results: ChallengeResult[];
  originSelected: boolean;
  loading: boolean;
  itineraryComputing: boolean;
  onSelect: (code: string) => void;
  onComputeItinerary: () => void;
}

/** List of predefined challenges with their solved/empty/pending state. */
export default function ChallengeList({
  results,
  originSelected,
  loading,
  itineraryComputing,
  onSelect,
  onComputeItinerary,
}: ChallengeListProps): JSX.Element {
  return (
    <div className="results">
      <div className="hint">{results.length} défis à relever depuis ta gare.</div>
      {results.map((result) => {
        const isSolved = result.status === 'solved' && result.winner != null;
        const isItinerary = result.kind === 'longest-itinerary';
        return (
          <div
            key={result.kind}
            className={`result-card challenge-card${isSolved ? ' solved' : ''}${
              isSolved ? ' clickable' : ''
            }`}
            role={isSolved ? 'button' : undefined}
            tabIndex={isSolved ? 0 : undefined}
            onClick={isSolved ? () => onSelect(result.winner!.code) : undefined}
            onKeyDown={
              isSolved
                ? (e) => {
                    if (e.key === 'Enter') onSelect(result.winner!.code);
                  }
                : undefined
            }
          >
            <div className="row">
              <div className="station">{result.title}</div>
              {isSolved && <span className="challenge-check">✓</span>}
            </div>
            <div className="muted challenge-desc">{result.description}</div>

            {isSolved && (
              <div className="challenge-answer">
                <span className="challenge-winner">{result.winner!.name}</span>
                {result.detail ? <span className="muted"> · {result.detail}</span> : null}
              </div>
            )}

            {result.status === 'empty' && (
              <div className="hint">Aucune disponibilité MAX sur la période.</div>
            )}

            {result.status === 'pending' && !isSolved && (
              <>
                {!originSelected ? (
                  <div className="hint">Choisis une gare de départ.</div>
                ) : isItinerary ? (
                  <button
                    type="button"
                    className="secondary challenge-compute"
                    disabled={itineraryComputing}
                    onClick={onComputeItinerary}
                  >
                    {itineraryComputing ? 'Calcul…' : 'Calculer l’itinéraire'}
                  </button>
                ) : (
                  <div className="hint">
                    {loading ? 'Calcul en cours…' : 'En attente…'}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
