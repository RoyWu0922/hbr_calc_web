import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppSettings } from '../utils/appSettings';

/**
 * A collapsible module.
 *
 * `wrapper` defaults to FALSE: a module is a typographic group (title, hairline,
 * then content), not a bordered box. Every section used to draw its own `.card`,
 * and those were stacked inside page containers, so each screen read as a column
 * of equal-weight panels with no focal point. The card surface is now reserved for
 * objects you can act on. Pass `wrapper` to get the boxed form where a genuine
 * panel is wanted.
 *
 * Every module can also have its own surface presence ("模块底色"): by default it
 * follows 组件透明度 — the same knob as the card and field fills, because a solid
 * field on a flat panel reads as a chip floating in space. A module whose value is
 * saved in settings.moduleOpacityOverrides deviates from that; its control sits in
 * the section head, appears on hover (always where there is no hover), and turns
 * accent-coloured once the module differs from the rest.
 */
export default function CollapsibleSection({ title, defaultOpen, wrapper, moduleId, children }: {
  title: ReactNode;
  defaultOpen?: boolean;
  wrapper?: boolean;
  /** Stable key for this module's surface override. Defaults to the title when that is a plain string — pass one explicitly when the title is JSX, and use the SAME id for variants of one module (e.g. the 体1/体2/体3 copies of 主动加攻区). */
  moduleId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const [popOpen, setPopOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const { settings, setModuleOpacityFor } = useAppSettings();
  const w = wrapper ?? false;
  const id = moduleId ?? (typeof title === 'string' ? title : undefined);
  const override = id ? settings.moduleOpacityOverrides[id] : undefined;
  // No override: follow 组件透明度, the same knob as the card and field fills
  // (see .section::before in index.css).
  const value = override ?? settings.cardOpacity;

  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: MouseEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popOpen]);

  // The card form already has a surface of its own, so it gets no second one.
  const control = id && !w ? (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="module-opacity-btn"
        title="这个模块的底色浓度"
        aria-label="这个模块的底色浓度"
        data-open={popOpen ? 'true' : 'false'}
        data-changed={override !== undefined ? 'true' : 'false'}
        onClick={(e) => { e.stopPropagation(); setPopOpen(!popOpen); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {popOpen && (
        <div className="module-opacity-pop" role="dialog" aria-label="模块底色">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--app-text-secondary)' }}>模块底色</span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--app-text-muted)' }}>{Math.round(value * 100)}%</span>
          </div>
          <input
            type="range" min="0" max="1" step="0.05" value={value}
            aria-label="模块底色浓度"
            onChange={(e) => setModuleOpacityFor(id, parseFloat(e.target.value))}
            className="w-full"
            style={{ accentColor: settings.accentColor }}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px]" style={{ color: 'var(--app-text-muted)' }}>透明</span>
            <button
              type="button"
              className="text-[11px] underline"
              style={{ color: 'var(--app-text-muted)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
              onClick={() => { setModuleOpacityFor(id, null); setPopOpen(false); }}
            >跟随全局</button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const header = (
    <div className="section-head" ref={hostRef}>
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="section-title">{title}</span>
        <span className="section-caret" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {control}
    </div>
  );
  const body = open ? <div className="section-body">{children}</div> : null;

  if (w) {
    return <div className="card">{header}{body}</div>;
  }
  return (
    <div
      className="section"
      data-module={id}
      style={override !== undefined ? ({ '--mod-opacity': String(override) } as CSSProperties) : undefined}
    >
      {header}{body}
    </div>
  );
}
