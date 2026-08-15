import { useEffect, useState } from 'react';
import type { MapPoint } from '../types';
import { getCityImages, type CityImage } from '../api/cityImages';
import { getAttendance } from '../lib/frequentation';
import { formatAttendance } from '../lib/format';

interface StationPopupProps {
  point: MapPoint;
  opened: boolean;
}

/** Popup content: station name, departure count, leg list and city photos. */
export default function StationPopup({ point, opened }: StationPopupProps) {
  const [images, setImages] = useState<CityImage[]>([]);
  const attendance = getAttendance(point.code);

  useEffect(() => {
    if (!opened || images.length > 0) return;
    let cancelled = false;
    getCityImages(point).then((next) => {
      if (!cancelled) setImages(next);
    });
    return () => {
      cancelled = true;
    };
  }, [opened, point, images.length]);

  return (
    <div className="station-popup">
      <div className="station-popup-title">
        <strong>{point.name}</strong>
        {point.count !== undefined && point.count > 0 ? (
          <span> · {point.count} départs</span>
        ) : null}
      </div>
      {attendance !== null ? (
        <div className="station-popup-attendance">
          {formatAttendance(attendance)} voyageurs/an
        </div>
      ) : null}
      {point.popup ? (
        <div className="station-popup-legs" dangerouslySetInnerHTML={{ __html: point.popup }} />
      ) : null}
      {images.length > 0 ? (
        <div className="station-photos">
          {images.map((img) => (
            <a
              key={img.src}
              href={img.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={img.src} alt={point.name} loading="lazy" />
            </a>
          ))}
          <div className="popup-credit">
            Photos :{' '}
            <a
              href="https://commons.wikimedia.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Wikimedia Commons
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
