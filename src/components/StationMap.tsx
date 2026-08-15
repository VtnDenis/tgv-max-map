import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import type { MapPoint } from '../types';

export interface MapLine {
  points: [number, number][];
  color?: string;
}

interface StationMapProps {
  points: MapPoint[];
  fit?: boolean;
  onPointClick?: (code: string) => void;
  lines?: MapLine[];
  focus?: MapPoint | null;
  dark?: boolean;
}

interface FitBoundsProps {
  points: MapPoint[];
  fit: boolean;
}

function FitBounds({ points, fit }: FitBoundsProps) {
  const map = useMap();
  const signature = points.map((p) => p.code).join(',');

  useEffect(() => {
    if (!fit || points.length === 0) {
      return;
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])),
      { padding: [40, 40] as [number, number], maxZoom: 12 },
    );
  }, [signature]);

  return null;
}

interface FocusControllerProps {
  focus: MapPoint | null;
  markersRef: MutableRefObject<Map<string, L.CircleMarker>>;
}

function FocusController({ focus, markersRef }: FocusControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 9), { duration: 0.8 });
    markersRef.current.get(focus.code)?.openPopup();
  }, [focus]);

  return null;
}

/** Interactive Leaflet map of France showing TGV MAX stations, lines and focus. */
export default function StationMap({
  points,
  fit = true,
  onPointClick,
  lines = [],
  focus = null,
  dark = false,
}: StationMapProps) {
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  const markers = useMemo(
    () =>
      points.map((point) => {
        const color = point.color ?? '#e3000f';
        return (
          <CircleMarker
            key={point.code}
            ref={(el) => {
              if (el) markersRef.current.set(point.code, el);
              else markersRef.current.delete(point.code);
            }}
            center={[point.lat, point.lon] as [number, number]}
            radius={7}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.6,
              weight: 2,
            }}
            eventHandlers={{ click: () => onPointClick?.(point.code) }}
          >
            <Popup>
              <div>
                <div>
                  <strong>{point.name}</strong>
                </div>
                {point.popup ? (
                  <div dangerouslySetInnerHTML={{ __html: point.popup }} />
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      }),
    [points, onPointClick],
  );

  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={5}
      style={{ height: '100%', width: '100%' }}
    >
      {dark ? (
        <TileLayer
          key="dark"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
      ) : (
        <TileLayer
          key="light"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
      )}
      <FitBounds points={points} fit={fit} />
      {lines.map((line, i) => (
        <Polyline
          key={i}
          positions={line.points}
          pathOptions={{
            color: line.color ?? '#b26a00',
            weight: 2,
            opacity: 0.8,
            dashArray: '4 4',
          }}
        />
      ))}
      {markers}
      <FocusController focus={focus} markersRef={markersRef} />
    </MapContainer>
  );
}
