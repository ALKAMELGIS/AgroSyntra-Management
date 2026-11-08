/**
 * Leaflet safety helpers — prevents `_leaflet_pos` crashes when the map is
 * unmounted during zoom animations (common in SPA route changes).
 */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { toLatLngRing } from './polygonRing';
import 'leaflet/dist/leaflet.css';

let patchApplied = false;

/** Guard Leaflet's zoom transition callback when the map pane is already gone. */
export function initLeafletSafeMode() {
  if (patchApplied || typeof window === 'undefined') return;
  patchApplied = true;

  const proto = L.Map?.prototype;
  const original = proto?._onZoomTransitionEnd;
  if (typeof original !== 'function') return;

  proto._onZoomTransitionEnd = function guardedOnZoomTransitionEnd(...args) {
    if (!this._animatingZoom) return;
    const container = this.getContainer?.();
    if (!this._mapPane || !container?.isConnected) {
      this._animatingZoom = false;
      return;
    }
    try {
      original.apply(this, args);
    } catch {
      this._animatingZoom = false;
    }
  };
}

export function isMapAlive(map) {
  try {
    return Boolean(map?.getContainer?.()?.isConnected && map._mapPane);
  } catch {
    return false;
  }
}

export function safeMapOp(map, fn) {
  if (!isMapAlive(map)) return;
  try {
    fn();
  } catch {
    // Map removed mid-animation.
  }
}

export function safeFitBounds(map, bounds, options = {}) {
  safeMapOp(map, () => {
    map.stop();
    map.fitBounds(bounds, { animate: false, ...options });
  });
}

export function safeFlyTo(map, latlng, zoom, options = {}) {
  safeMapOp(map, () => {
    map.stop();
    map.setView(latlng, zoom, { animate: false, ...options });
  });
}

export function MapLifecycle() {
  const map = useMap();
  useEffect(() => {
    return () => {
      try {
        if (map) {
          map._animatingZoom = false;
          map.stop();
        }
      } catch {
        // ignore
      }
    };
  }, [map]);
  return null;
}

export function MapResizeInvalidator({ revision }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      safeMapOp(map, () => map.invalidateSize({ animate: false }));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [map, revision]);
  return null;
}

/** Fit map to field coordinates without animated zoom. */
export function SafeFitBounds({ fields, options = {} }) {
  const map = useMap();
  useEffect(() => {
    if (fields.length === 0) return;
    const bounds = fields
      .map((field) => {
        const ring = toLatLngRing(field.polygon);
        if (ring) return ring;
        if (field.latitude != null && field.longitude != null) {
          return [[field.latitude, field.longitude]];
        }
        return null;
      })
      .filter(Boolean)
      .flat();
    if (bounds.length === 0) return;
    safeFitBounds(map, bounds, options);
    // options intentionally omitted — callers pass inline objects
  }, [fields, map]);
  return null;
}

/** Fit map to Leaflet LatLngBounds without animated zoom. */
export function SafeFitLatLngBounds({ bounds, options = {} }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds?.isValid?.()) return;
    safeFitBounds(map, bounds, options);
  }, [bounds, map]);
  return null;
}

// Map pages are lazy-loaded and all import this module, so patch Leaflet as soon as it is first needed
// (keeps Leaflet out of the initial bundle).
initLeafletSafeMode();
