import { useEffect, useMemo, useRef, useState } from 'react';
import type { Itinerary } from '../types';
import {
  postcardBlob,
  postcardFileName,
  renderPostcardDataUrl,
  type PostcardTheme,
} from '../lib/postcard';

export interface PostcardModalProps {
  itinerary: Itinerary | null;
  theme: PostcardTheme;
  onClose: () => void;
}

export default function PostcardModal({
  itinerary,
  theme,
  onClose,
}: PostcardModalProps): JSX.Element | null {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const dataUrl = useMemo(() => {
    if (!itinerary) return null;
    return renderPostcardDataUrl({ itinerary, theme });
  }, [itinerary, theme]);

  useEffect(() => {
    if (!itinerary) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [itinerary, onClose]);

  if (!itinerary || !dataUrl) return null;

  const fileName = postcardFileName(itinerary);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleShare = async () => {
    if (!itinerary) return;
    if (typeof navigator.share !== 'function') {
      handleDownload();
      return;
    }

    setSharing(true);
    setError(null);
    try {
      const blob = await postcardBlob({ itinerary, theme });
      if (!blob) {
        handleDownload();
        return;
      }
      const file = new File([blob], fileName, { type: 'image/png' });
      const data: ShareData = {
        files: [file],
        title: 'TGV MAX — Carte postale',
        text: 'Mon trajet TGV MAX',
      };
      if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
        handleDownload();
        return;
      }
      await navigator.share(data);
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError("Le partage a échoué. Téléchargement du fichier à la place.");
        handleDownload();
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="postcard-overlay" onClick={onClose}>
      <div
        className="postcard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu de la carte postale"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        <div className="postcard-head">
          <h2>Carte postale</h2>
          <button
            type="button"
            className="postcard-close"
            aria-label="Fermer"
            onClick={onClose}
            ref={closeRef}
          >
            ✕
          </button>
        </div>
        <img
          className="postcard-preview"
          src={dataUrl}
          alt="Aperçu de la carte postale"
        />
        <div className="postcard-actions">
          <button type="button" className="primary" onClick={handleDownload}>
            Télécharger PNG
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void handleShare()}
            disabled={sharing}
          >
            {sharing ? 'Partage…' : 'Partager'}
          </button>
        </div>
        {error && <div className="hint" style={{ color: 'var(--accent)' }}>{error}</div>}
      </div>
    </div>
  );
}
