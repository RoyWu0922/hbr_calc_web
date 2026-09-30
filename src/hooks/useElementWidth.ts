import { useEffect, useState, type RefObject } from 'react';

/**
 * Live pixel width of a ref'd element, via ResizeObserver.
 *
 * Used by the 双栏紧凑 版式 to decide 1 vs 2 columns. Deliberately measured in
 * JS rather than with CSS container queries: the export clone rewrites the
 * container's width (the [data-timeline-export] patch expands it to its full
 * scrollWidth), so a container query would re-evaluate against a box that only
 * exists inside the clone, while this reads the live DOM and therefore gives
 * the screen and the export the same answer.
 *
 * ResizeObserver fires an initial callback on observe(), so there is no need to
 * seed the width with a synchronous setState in the effect body.
 */
export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        // Sub-pixel churn from scrollbar/layout rounding would re-render for
        // nothing; only react to a real change.
        setWidth(prev => (Math.abs(prev - w) < 1 ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
