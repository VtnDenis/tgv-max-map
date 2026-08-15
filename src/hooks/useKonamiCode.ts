import { useEffect, useRef } from 'react';

const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/**
 * Detect the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) on a global `keydown`
 * listener. Ignores keystrokes originating from text fields.
 */
export function useKonamiCode(callback: () => void): void {
  const indexRef = useRef(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === SEQUENCE[indexRef.current]) {
        indexRef.current += 1;
        if (indexRef.current === SEQUENCE.length) {
          indexRef.current = 0;
          callbackRef.current();
        }
      } else {
        indexRef.current = key === SEQUENCE[0] ? 1 : 0;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
