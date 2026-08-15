import { useCallback, useEffect, useRef } from 'react';
import { burstConfetti, type BurstOptions } from '../lib/confetti';

export type FireIntensity = 'normal' | 'high' | 'max';

export interface UseConfettiResult {
  fire: (intensity?: FireIntensity) => boolean;
}

const PRESETS: Record<FireIntensity, BurstOptions> = {
  normal: { count: 140, duration: 1400, spread: 1 },
  high: { count: 180, duration: 1600, spread: 1.3 },
  max: { count: 220, duration: 1800, spread: 1.6 },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Fire confetti bursts from a single full-screen canvas. Respects
 * `prefers-reduced-motion` and cancels any in-flight burst on unmount.
 */
export function useConfetti(): UseConfettiResult {
  const cleanupRef = useRef<(() => void) | null>(null);

  const fire = useCallback((intensity: FireIntensity = 'normal'): boolean => {
    if (prefersReducedMotion()) return false;
    cleanupRef.current?.();
    cleanupRef.current = burstConfetti(PRESETS[intensity]);
    return true;
  }, []);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return { fire };
}
