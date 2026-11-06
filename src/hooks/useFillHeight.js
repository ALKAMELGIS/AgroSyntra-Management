import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Height that lets an element (usually a map) fill the screen from where it
 * starts down to the bottom of the window — above the phone navigation bar —
 * so the map stays the main workspace on every screen size instead of using
 * a fixed 500 px / 75vh box.
 *
 *   const [mapRef, mapHeight] = useFillHeight({ min: 360 });
 *   <Box ref={mapRef} sx={{ height: mapHeight }}>…map…</Box>
 *
 * min: never smaller than this (short landscape phones scroll instead).
 * bleed: the element extends to the bottom edge (pages that cancel the main padding).
 * deps: re-measure when something above the element changes height.
 */
export default function useFillHeight({ min = 360, bottomGap = 16, bleed = false, deps = [] } = {}) {
  const ref = useRef(null);
  const [height, setHeight] = useState(min);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const nav = document.documentElement.classList.contains('has-bottom-nav') ? 64 : 0;
    // Leave the main area's own bottom padding (which on phones may already include the nav bar).
    const main = document.querySelector('main');
    const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    // bleed: the element runs to the very bottom of the work area (only the phone nav bar stays clear).
    const reserve = bleed ? nav : Math.max(pad, nav + bottomGap, bottomGap);
    const next = Math.max(min, Math.floor(window.innerHeight - top - reserve));
    setHeight((h) => (Math.abs(h - next) > 1 ? next : h));
  }, [min, bottomGap]);

  useLayoutEffect(() => {
    measure();
    // Fonts, banners and data above the element settle a moment after mount.
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    // Banners / alerts above the map appear after data loads: watch the page.
    // (Stable: the height only depends on where the element starts.)
    let ro = null;
    const page = document.querySelector('main');
    if (page && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => requestAnimationFrame(measure));
      ro.observe(page);
      Array.from(page.children).forEach((c) => ro.observe(c));
    }
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  return [ref, height];
}
