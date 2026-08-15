import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import type { MapPoint, RadiusCircle } from '../types';
import StationPopup from './StationPopup';

export interface MapLine {
  points: [number, number][];
  color?: string;
  opacity?: number;
}

interface StationMapProps {
  points: MapPoint[];
  fit?: boolean;
  onPointClick?: (code: string) => void;
  lines?: MapLine[];
  focus?: MapPoint | null;
  focusZoom?: number;
  focusDuration?: number;
  dark?: boolean;
  resizeToken?: number;
  radiusCircle?: RadiusCircle | null;
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
  focusZoom?: number;
  focusDuration?: number;
  markersRef: MutableRefObject<Map<string, L.CircleMarker>>;
}

function FocusController({
  focus,
  focusZoom,
  focusDuration,
  markersRef,
}: FocusControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const zoom = Math.max(map.getZoom(), focusZoom ?? 9);
    if (reduce) {
      map.setView([focus.lat, focus.lon], zoom);
    } else {
      map.flyTo([focus.lat, focus.lon], zoom, { duration: focusDuration ?? 0.8 });
    }
    markersRef.current.get(focus.code)?.openPopup();
  }, [focus, focusZoom, focusDuration, map, markersRef]);

  return null;
}

interface ResizeControllerProps {
  resizeToken?: number;
}

function ResizeController({ resizeToken }: ResizeControllerProps) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
  }, [resizeToken, map]);

  return null;
}

/** Radius (px) proportional to the number of departures, capped for legibility. */
function markerRadius(count?: number): number {
  if (count === undefined) return 7;
  return Math.min(6 + Math.sqrt(count) * 1.3, 20);
}

interface StationMarkerProps {
  point: MapPoint;
  markersRef: MutableRefObject<Map<string, L.CircleMarker>>;
  onPointClick?: (code: string) => void;
}

function StationMarker({ point, markersRef, onPointClick }: StationMarkerProps) {
  const [opened, setOpened] = useState(false);
  const color = point.color ?? '#e3000f';

  return (
    <CircleMarker
      key={point.code}
      ref={(el) => {
        if (el) markersRef.current.set(point.code, el);
        else markersRef.current.delete(point.code);
      }}
      center={[point.lat, point.lon] as [number, number]}
      radius={markerRadius(point.count)}
      pathOptions={{
        color,
        fillColor: color,
        fillOpacity: point.opacity ?? 0.6,
        weight: 2,
      }}
      eventHandlers={{
        click: () => onPointClick?.(point.code),
        popupopen: () => setOpened(true),
        popupclose: () => setOpened(false),
      }}
    >
      <Popup>
        <StationPopup point={point} opened={opened} />
      </Popup>
    </CircleMarker>
  );
}

/** Interactive Leaflet map of France showing TGV MAX stations, lines and focus. */
export default function StationMap({
  points,
  fit = true,
  onPointClick,
  lines = [],
  focus = null,
  focusZoom,
  focusDuration,
  dark = false,
  resizeToken,
  radiusCircle = null,
}: StationMapProps) {
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  const markers = useMemo(
    () =>
      points.map((point) => (
        <StationMarker
          key={point.code}
          point={point}
          markersRef={markersRef}
          onPointClick={onPointClick}
        />
      )),
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
      {radiusCircle && (
        <Circle
          center={[radiusCircle.lat, radiusCircle.lon] as [number, number]}
          radius={radiusCircle.radiusKm * 1000}
          pathOptions={{
            color: '#e3000f',
            fillColor: '#e3000f',
            fillOpacity: 0.12,
            weight: 2,
          }}
        />
      )}
      {lines.map((line, i) => (
        <Polyline
          key={i}
          positions={line.points}
          pathOptions={{
            color: line.color ?? '#b26a00',
            weight: 2,
            opacity: line.opacity ?? 0.8,
            dashArray: '4 4',
          }}
        />
      ))}
      {markers}
      <FocusController
        focus={focus}
        focusZoom={focusZoom}
        focusDuration={focusDuration}
        markersRef={markersRef}
      />
      <ResizeController resizeToken={resizeToken} />
    </MapContainer>
  );
}
