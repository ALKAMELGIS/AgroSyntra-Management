import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { WMS_URL } from './satelliteApi';
import { ringToFeature } from './aoi';

function ensurePane(map, name, zIndex) {
  const pane = map.getPane(name) || map.createPane(name);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = 'none';
  return pane;
}

function wmsLayer(sat, time, pane) {
  const opts = {
    layers: 'S2', format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, maxZoom: 20,
    k: sat.tileKey, index: sat.index, time, maxcc: sat.maxcc, opacity: sat.opacity, pane,
  };
  if (sat.clip && sat.wkt) opts.geometry = sat.wkt;
  return L.tileLayer.wms(WMS_URL, opts);
}

/**
 * Inside the Leaflet map: the satellite image (index), the second date for the
 * compare swipe, the AOI outline and the AOI drawing tool.
 * Satellite panes sit under the GIS layers so fields stay clickable on top.
 */
export default function SatelliteMapLayers({ sat }) {
  const map = useMap();
  const swipeRef = useRef(sat.compare.swipe);
  swipeRef.current = sat.compare.swipe;

  // Main image.
  useEffect(() => {
    if (!sat.ready || !sat.show) return undefined;
    ensurePane(map, 'satellite', 350);
    const layer = wmsLayer(sat, sat.time, 'satellite').addTo(map);
    return () => { layer.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.ready, sat.show, sat.tileKey, sat.index, sat.time, sat.maxcc, sat.clip, sat.wkt]);

  // Opacity changes without reloading tiles.
  useEffect(() => {
    map.eachLayer((l) => { if (l.wmsParams && l.options.pane?.startsWith('satellite')) l.setOpacity(sat.opacity); });
  }, [map, sat.opacity]);

  // Compare: the second date on its own pane, clipped by the swipe position.
  useEffect(() => {
    if (!sat.ready || !sat.show || !sat.compare.on || !sat.compare.date) return undefined;
    const pane = ensurePane(map, 'satellite-compare', 351);
    const layer = wmsLayer(sat, `${sat.compare.date}/${sat.compare.date}`, 'satellite-compare').addTo(map);
    const rtl = document.documentElement.dir === 'rtl';
    const clipPane = () => {
      const size = map.getSize();
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint(size);
      const split = nw.x + (size.x * swipeRef.current) / 100;
      // Date B on the right side of the handle (left side in Arabic).
      pane.style.clip = rtl
        ? `rect(${nw.y}px, ${split}px, ${se.y}px, ${nw.x}px)`
        : `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${split}px)`;
    };
    clipPane();
    map.on('move zoom resize', clipPane);
    const onSwipe = () => clipPane();
    window.addEventListener('agrocloud:satellite-swipe', onSwipe);
    return () => {
      map.off('move zoom resize', clipPane);
      window.removeEventListener('agrocloud:satellite-swipe', onSwipe);
      layer.remove();
      pane.style.clip = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.ready, sat.show, sat.compare.on, sat.compare.date, sat.tileKey, sat.index, sat.maxcc, sat.clip, sat.wkt]);

  useEffect(() => { window.dispatchEvent(new Event('agrocloud:satellite-swipe')); }, [sat.compare.swipe]);

  // AOI outline.
  useEffect(() => {
    if (!sat.aoi) return undefined;
    const layer = L.geoJSON(sat.aoi, { style: { color: '#ffd400', weight: 2, dashArray: '6 4', fill: false }, interactive: false }).addTo(map);
    return () => { layer.remove(); };
  }, [map, sat.aoi]);

  // Draw the AOI on the map (leaflet-draw, loaded on demand).
  useEffect(() => {
    if (!sat.drawing) return undefined;
    let handler = null;
    let cancelled = false;
    let onCreated = null;
    (async () => {
      window.L = L;
      try { await import('leaflet-draw'); } catch { sat.setDrawing(false); return; }
      if (cancelled || !L.Draw?.Polygon) return;
      handler = new L.Draw.Polygon(map, { allowIntersection: false, showArea: true, shapeOptions: { color: '#ffd400', weight: 2 } });
      onCreated = (e) => {
        const ring = e.layer.getLatLngs()[0].map((ll) => [ll.lng, ll.lat]);
        sat.setAoi(ringToFeature(ring, 'Drawn AOI'));
        sat.setDrawing(false);
      };
      map.on(L.Draw.Event.CREATED, onCreated);
      handler.enable();
    })();
    return () => {
      cancelled = true;
      if (onCreated && L.Draw?.Event) map.off(L.Draw.Event.CREATED, onCreated);
      if (handler) handler.disable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.drawing]);

  return null;
}
