import { useEffect, useRef } from 'react';
import { useAppSettings } from '../utils/appSettings';
import { CURSOR_PACKS, cursorImageLoaders } from '../assets/cursors';

/** Last known mouse position, persisted across effect re-runs so switching
 *  cursor styles does not jump the cursor to the screen center. */
let lastMouseX = -1000;
let lastMouseY = -1000;

/**
 * Custom cursor — two modes:
 *  - '' (default): accent dot + trailing ring
 *  - pack slug: animated character sprite (from cursor/ packs) following the mouse
 * Touch devices and prefers-reduced-motion skip both.
 */
export default function CursorFollower() {
  const { settings } = useAppSettings();
  const slug = settings.cursorStyle;
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLDivElement>(null);
  const pack = CURSOR_PACKS.find(p => p.slug === slug) ?? null;
  const mode = pack ? 'char' : slug === 'native' ? 'native' : 'dot';

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Native mode: no custom cursor, restore system pointer
    if (mode === 'native') {
      document.body.classList.remove('cursor-custom', 'cursor-character', 'cursor-hover');
      return;
    }

    const isChar = mode === 'char';
    document.body.classList.add('cursor-custom');
    const dot = dotRef.current;
    const ring = ringRef.current;
    const ch = charRef.current;
    if (!isChar && (!dot || !ring)) return;
    if (isChar && !ch) return;

    document.body.classList.toggle('cursor-character', isChar);

    // Start from last known mouse position so switching styles doesn't jump to center
    let mx = lastMouseX, my = lastMouseY;
    let rx = mx, ry = my;
    let raf = 0;
    let active = false;
    // Hide until first real mousemove (style switch restarts the effect)
    if (ch) ch.style.opacity = '0';
    if (dot) dot.style.opacity = '0';
    if (ring) ring.style.opacity = '0';

    // ── Character mode: sprite-strip animation state ──
    const SCALE = 0.5; // display 50px (source art is 100px)
    let strips: Record<string, string> = {}; // state -> strip url (single image)
    let curState = 'stand';
    let frame = 0;
    let lastTick = 0;
    let interval = 100;
    let lastStateChange = 0; // cooldown to avoid stand/touch/text flapping

    const loadPack = async () => {
      const loaded: Record<string, string> = {};
      const specs = pack!.manifest.states;
      for (const [st] of Object.entries(specs)) {
        const key = `./${pack!.slug}/${st}.webp`;
        try {
          loaded[st] = await cursorImageLoaders[key]();
        } catch { /* skip */ }
      }
      strips = loaded;
      // Apply first frame of initial state once ready
      if (ch && strips[curState]) {
        ch.style.backgroundImage = `url("${strips[curState]}")`;
        ch.style.backgroundSize = `${pack!.manifest.states[curState].frames * 50}px 50px`;
        ch.style.backgroundPosition = '0 0';
      }
    };

    const detectState = (t: EventTarget | null): string => {
      const el = t as HTMLElement | null;
      if (!el || !el.closest) return 'stand';
      if (el.closest('input, textarea')) return 'text';
      if (el.closest('tr[draggable="true"]')) return 'drag';
      if (el.closest('a, button, .btn, label, select, [role="button"]')) return 'touch';
      return 'stand';
    };

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      lastMouseX = mx; lastMouseY = my;
      if (!active) {
        active = true;
        if (dot) dot.style.opacity = '1';
        if (ring) ring.style.opacity = '1';
        if (ch) ch.style.opacity = '1';
      }
      if (isChar) {
        // Cooldown on state switches so sweeping across elements doesn't flap
        // between stand/touch/text poses (which reads as flickering).
        const now = performance.now();
        const st = detectState(e.target);
        if (st !== curState && now - lastStateChange > 150) {
          const spec = pack!.manifest.states[st];
          if (spec) {
            curState = st;
            lastStateChange = now;
            frame = 0;
            if (ch && strips[curState]) {
              ch.style.backgroundImage = `url("${strips[curState]}")`;
              ch.style.backgroundSize = `${spec.frames * 50}px 50px`;
              ch.style.backgroundPosition = '0 0';
            }
          }
        }
      } else {
        const t = e.target as HTMLElement | null;
        const interactive = t && t.closest('a, button, .btn, input, select, textarea, label, [role="button"], th, td');
        document.body.classList.toggle('cursor-hover', !!interactive);
      }
    };

    const onLeave = () => {
      active = false;
      if (dot) dot.style.opacity = '0';
      if (ring) ring.style.opacity = '0';
      if (ch) ch.style.opacity = '0';
    };

    const tick = (t: number) => {
      rx += (mx - rx) * 0.5;
      ry += (my - ry) * 0.5;
      if (dot) dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      if (ring) ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      if (isChar && ch) {
        const spec = pack!.manifest.states[curState];
        if (spec) {
          const off = spec;
          ch.style.left = `${mx + off.ox * SCALE}px`;
          ch.style.top = `${my + off.oy * SCALE}px`;
          if (strips[curState]) {
            if (off.interval !== interval) { interval = off.interval; lastTick = t; }
            if (t - lastTick >= interval) {
              lastTick = t;
              frame = (frame + 1) % off.frames;
              // Animate within the single sprite strip — no per-frame loads
              ch.style.backgroundPosition = `-${frame * 50}px 0`;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    if (isChar) loadPack();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
      document.body.classList.remove('cursor-custom', 'cursor-character', 'cursor-hover');
    };
  }, [mode, pack]);

  // Native mode: render nothing, show the system cursor
  if (mode === 'native') return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={charRef} className="cursor-character-el" aria-hidden="true" />
    </>
  );
}
