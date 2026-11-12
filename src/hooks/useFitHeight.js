import { useCallback, useEffect, useState } from 'react';

/**
 * Height that lets a scroll box (a table, a sheet) fill the screen from where it
 * starts down to the bottom, minus `bottom` px for anything fixed below it
 * (sheet tabs, the phone bottom bar). Recomputed on resize / rotation.
 *
 *   const [ref, maxHeight] = useFitHeight({ bottom: 56 });
 *   <TableContainer ref={ref} sx={{ maxHeight }}>
 *
 * Returns undefined until measured, so the theme default applies on first paint.
 */
export default function useFitHeight({ bottom = 16, min = 260 } = {}) {
  const [node, setNode] = useState(null);
  const [height, setHeight] = useState(undefined);
  const ref = useCallback((el) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof window === 'undefined') return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = node.getBoundingClientRect().top + (window.scrollY || 0);
        const vh = window.visualViewport?.height || window.innerHeight;
        setHeight(Math.max(min, Math.round(vh - Math.max(0, top - (window.scrollY || 0)) - bottom)));
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && node.parentElement) ro.observe(node.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [node, bottom, min]);

  return [ref, height];
}
