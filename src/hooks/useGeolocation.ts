import { useCallback, useState } from 'react';
import type { Station } from '../types';
import { nearestStation } from '../lib/geo';

export interface GeolocationState {
  loading: boolean;
  error: string | null;
  station: Station | null;
}

export interface UseGeolocationResult {
  state: GeolocationState;
  locate: () => void;
  reset: () => void;
}

function errorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Localisation refusée par le navigateur.';
    case error.POSITION_UNAVAILABLE:
      return 'Position indisponible.';
    case error.TIMEOUT:
      return 'Délai de localisation dépassé.';
    default:
      return 'Impossible de récupérer la position.';
  }
}

/**
 * Browser-native geolocation wrapper (Chrome / Safari / Firefox on iOS, iPadOS,
 * Android, Windows, macOS). No polyfill needed; returns the nearest station.
 */
export function useGeolocation(): UseGeolocationResult {
  const [state, setState] = useState<GeolocationState>({
    loading: false,
    error: null,
    station: null,
  });

  const reset = useCallback(() => {
    setState({ loading: false, error: null, station: null });
  }, []);

  const locate = useCallback(() => {
    if (!window.isSecureContext) {
      setState({
        loading: false,
        error: 'La géolocalisation requiert HTTPS.',
        station: null,
      });
      return;
    }
    if (!('geolocation' in navigator)) {
      setState({
        loading: false,
        error: 'Géolocalisation non supportée par ce navigateur.',
        station: null,
      });
      return;
    }
    setState({ loading: true, error: null, station: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const station = nearestStation(
          position.coords.latitude,
          position.coords.longitude,
        );
        setState({ loading: false, error: null, station: station ?? null });
      },
      (error: GeolocationPositionError) => {
        setState({ loading: false, error: errorMessage(error), station: null });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  return { state, locate, reset };
}
