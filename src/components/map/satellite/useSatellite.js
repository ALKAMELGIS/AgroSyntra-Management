import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './satelliteApi';
import { aoiToWkt } from './aoi';

const KEY = 'agrocloud_gis_satellite';
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

function readSaved() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** Shared state of the satellite tools on GIS Map. */
export default function useSatellite() {
  const saved = useMemo(readSaved, []);
  const [status, setStatus] = useState({ loaded: false, configured: false });
  const [indices, setIndices] = useState([]);
  const [tileKey, setTileKey] = useState(null);
  const [index, setIndex] = useState(saved.index || 'NDVI');
  const [from, setFrom] = useState(saved.from || daysAgo(30));
  const [to, setTo] = useState(saved.to || iso(new Date()));
  const [maxcc, setMaxcc] = useState(saved.maxcc ?? 20);
  const [opacity, setOpacity] = useState(saved.opacity ?? 0.85);
  const [show, setShow] = useState(Boolean(saved.show));
  const [scene, setScene] = useState(null); // one acquisition date, or null = best of the period
  const [aoi, setAoi] = useState(saved.aoi || null);
  const [clip, setClip] = useState(Boolean(saved.clip));
  const [drawing, setDrawing] = useState(false);
  const [compare, setCompare] = useState({ on: false, date: null, swipe: 50 });

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify({ index, from, to, maxcc, opacity, show, aoi, clip })); } catch { /* ignore */ }
  }, [index, from, to, maxcc, opacity, show, aoi, clip]);

  useEffect(() => {
    let alive = true;
    api.getStatus().then((s) => { if (alive) setStatus({ loaded: true, configured: Boolean(s?.configured), service: s?.service, label: s?.label }); })
      .catch(() => { if (alive) setStatus({ loaded: true, configured: false }); });
    api.getIndices().then((list) => { if (alive && Array.isArray(list)) setIndices(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // A signed key for map tiles, renewed before it expires (12 h).
  useEffect(() => {
    if (!status.configured) return undefined;
    let timer;
    const load = () => api.getTileKey().then((k) => {
      setTileKey(k?.key || null);
      const ms = k?.expiresAt ? new Date(k.expiresAt).getTime() - Date.now() - 10 * 60000 : 3600000;
      timer = setTimeout(load, Math.max(ms, 60000));
    }).catch(() => setTileKey(null));
    load();
    return () => clearTimeout(timer);
  }, [status.configured]);

  const current = indices.find((i) => i.key === index) || null;
  const time = scene ? `${scene}/${scene}` : `${from}/${to}`;
  const wkt = useMemo(() => (aoi ? aoiToWkt(aoi) : null), [aoi]);
  const clearAoi = useCallback(() => { setAoi(null); setClip(false); }, []);

  return {
    status, indices, current, tileKey,
    index, setIndex, from, setFrom, to, setTo, maxcc, setMaxcc, opacity, setOpacity, show, setShow,
    scene, setScene, time, aoi, setAoi, clearAoi, wkt, clip, setClip, drawing, setDrawing, compare, setCompare,
    ready: status.configured && Boolean(tileKey),
  };
}
