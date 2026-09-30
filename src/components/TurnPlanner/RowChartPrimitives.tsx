/**
 * Shared render primitives for the 简轴 版式.
 *
 * These own the three semantic cells every row-based variant has — label,
 * the 3 action slots, the OD cell — plus the ONE implementation of the empty
 * slot rule. No variant is allowed to write its own `charIndex === -1` check;
 * if the 「—」 rendering ever needs to change it changes here, once.
 *
 * Geometry is data: RowShell takes a grid template string. B/C/E/G differ only
 * in that template plus class names, which is what lets them share a shell
 * while D (transposed) and the table render their own DOM.
 *
 * IMPORTANT: every decoration below is a real DOM node. The bundled html2canvas
 * does not render `content: ""` pseudo-elements (resolvePseudoContent bails on
 * a falsy content value), so a color bar or rail built with ::before would be
 * invisible in the exported PNG.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { ChartMeta, ChartSlot, ChartTurnRow, ColStatus, ODModel } from './rowChartModel';

// ─── Slot ─────────────────────────────────────────────────────

export function SlotBody({
  slot, nameClass, actClass, nameStyle, separator,
}: {
  slot: ChartSlot;
  nameClass?: string;
  actClass?: string;
  /** Applied to a filled slot only — an empty slot always renders as plain 「—」. */
  nameStyle?: CSSProperties;
  /**
   * A real element rendered between name and action (行程表's `·`). It must be a
   * node, not a `::after` — the export drops `content:""` pseudo-elements.
   * Omitted, and also skipped for an empty slot, which has nothing to separate.
   */
  separator?: ReactNode;
}) {
  if (slot.charIndex < 0) {
    return <span className={['rc-nm', 'rc-empty', nameClass].filter(Boolean).join(' ')}>—</span>;
  }
  return (
    <>
      <span className={['rc-nm', nameClass].filter(Boolean).join(' ')} style={nameStyle} title={slot.name}>
        {slot.name}
      </span>
      {separator}
      <span className={['rc-ac', actClass].filter(Boolean).join(' ')} title={slot.action}>
        {slot.action}
      </span>
    </>
  );
}

// ─── OD cell ──────────────────────────────────────────────────

/**
 * The single OD expression — this used to be duplicated verbatim in the turn
 * row and the modifier row of SimpleTable.
 */
export function ODValue({ od, className }: { od: ODModel; className?: string }) {
  return (
    <div className={['rc-od', 'font-mono', 'font-bold', 'text-xs', od.negative ? 'text-red-400' : 'text-accent', className].filter(Boolean).join(' ')}>
      {od.overflow !== null ? (
        <>
          {od.odMode}
          <span className="rc-ov text-[8px] text-text-muted">+{od.overflowText}</span>
        </>
      ) : od.text}
    </div>
  );
}

// ─── Character color bar ──────────────────────────────────────

/** A real node, never a ::before — see the file header. */
export function ColorBar({ color, className }: { color?: string; className?: string }) {
  if (!color) return null;
  return <span className={['rc-bar', className].filter(Boolean).join(' ')} style={{ background: color }} aria-hidden="true" />;
}

// ─── Row tone helper ──────────────────────────────────────────

type ToneRow = Pick<ChartTurnRow, 'isOD' | 'isODin' | 'isExtra' | 'extraIsRed'>;

/**
 * The one classification of a round's tone: an OD round reads red, a 追加 green.
 * `extraIsRed` (a 追加 continuing an OD window) outranks `isExtra`, and `isODin`
 * counts as OD. Everything that needs a tone — the label, the rail dot, the
 * 行程表 diamond — derives from this, so they can never disagree.
 */
export type RowTone = 'od' | 'extra' | 'none';

export function rowTone(row: ToneRow): RowTone {
  if (row.isOD || row.isODin || row.extraIsRed) return 'od';
  if (row.isExtra) return 'extra';
  return 'none';
}

/** Tailwind text classes for the round label — the RowChartTable's original pair. */
const TONE_CLASS: Record<RowTone, string> = {
  od: 'text-red-400',
  extra: 'text-green-400',
  none: '',
};

/**
 * Explicit hex for the dot / diamond. Deliberately NOT `currentColor` or
 * `var(--app-text-muted)`: the export renders SVG through a serialized
 * standalone <img> (svgRendering), where `currentColor` resolves to black and
 * `var()` to nothing — the marker would silently differ from the screen. The
 * neutral value is Tailwind's slate-400, which reads on both themes.
 */
const TONE_COLOR: Record<RowTone, string> = {
  od: '#f87171',
  extra: '#4ade80',
  none: '#94a3b8',
};

/** Text/geometry colour for a tone. The only reader of the two maps above. */
export function toneClass(tone: RowTone): string { return TONE_CLASS[tone]; }
export function toneColor(tone: RowTone): string { return TONE_COLOR[tone]; }

export function labelTone(row: ToneRow): string {
  return toneClass(rowTone(row));
}

/**
 * 角色泳道 has no row to hang a tone on — the OD / 追加 information moves up into
 * the transposed column header — so it classifies a ColStatus instead. Mapped
 * onto the same three tones rather than given its own palette: a red-chain 追加
 * reads red in the column header for the same reason `extraIsRed` outranks
 * `isExtra` on a row label.
 */
export function colStatusTone(status: ColStatus): RowTone {
  if (status === 'od' || status === 'extraRed') return 'od';
  if (status === 'extra') return 'extra';
  return 'none';
}

/** 轨道时间线's node. A real node — see the file header. */
export function RailDot({ row }: { row: ToneRow }) {
  return <span className="rc-dot" style={{ background: TONE_COLOR[rowTone(row)] }} aria-hidden="true" />;
}

/**
 * 行程表's diamond. An SVG <polygon> rather than a rotated square: the export
 * runs with `svgRendering: true`, so the geometry is reliable, and it avoids
 * re-deriving a rotated box's bounding rect.
 */
export function NodeMark({ row }: { row: ToneRow }) {
  return (
    <svg className="rc-node" viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,0 12,6 6,12 0,6" fill={TONE_COLOR[rowTone(row)]} />
    </svg>
  );
}

// ─── Modifier row ─────────────────────────────────────────────

/**
 * A 词条行 in the row-based 版式. Its own component rather than a RowShell call
 * because it has no action slots — the modifier text takes that whole column.
 * `leading` keeps the label column aligned with the variants that have one
 * (轨道时间线 / 行程表), and `template` is the same string the sibling rows use.
 */
export function ModRow({
  template, leading, modNum, text, od, variantClass, rowClass,
}: {
  template: string;
  leading?: ReactNode;
  modNum: number;
  text: string;
  od: ODModel;
  variantClass?: string;
  rowClass?: string;
}) {
  return (
    <div
      className={['rc-row', 'rc-mod', variantClass, rowClass].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: template }}
    >
      {leading ?? null}
      <div className="rc-lbl rc-mod-lbl">词条{modNum}</div>
      <div className="rc-mod-txt" title={text}>{text}</div>
      <ODValue od={od} />
    </div>
  );
}

// ─── Row shell ────────────────────────────────────────────────

export interface RowShellProps {
  /** Grid template for the whole row, e.g. '68px 1fr 96px'. */
  template: string;
  /** E's rail dot / G's node mark — an extra column ahead of the label. */
  leading?: ReactNode;
  label: ReactNode;
  labelClass?: string;
  labelStyle?: CSSProperties;
  slots: readonly ChartSlot[];
  od: ODModel;
  variantClass?: string;
  rowClass?: string;
  rowStyle?: CSSProperties;
  /** B's ColorBar — rendered inside the slot, before the text. */
  slotPrefix?: (slot: ChartSlot, index: number) => ReactNode;
  /** C's first-slot border reset; the variant gets the index so it needn't recount. */
  slotClass?: (slot: ChartSlot, index: number) => string | undefined;
  nameClass?: string;
  actClass?: string;
  nameStyle?: (slot: ChartSlot) => CSSProperties | undefined;
  /** G's `·` between name and action. A node, never a pseudo-element. */
  slotSeparator?: (slot: ChartSlot, index: number) => ReactNode;
}

export function RowShell({
  template, leading, label, labelClass, labelStyle, slots, od,
  variantClass, rowClass, rowStyle, slotPrefix, slotClass, nameClass, actClass, nameStyle,
  slotSeparator,
}: RowShellProps) {
  return (
    <div
      className={['rc-row', variantClass, rowClass].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: template, ...rowStyle }}
    >
      {leading}
      <div className={['rc-lbl', labelClass].filter(Boolean).join(' ')} style={labelStyle}>{label}</div>
      <div className="rc-slots">
        {slots.map((slot, i) => (
          <div key={i} className={['rc-slot', slotClass?.(slot, i)].filter(Boolean).join(' ')}>
            {slotPrefix?.(slot, i)}
            <SlotBody
              slot={slot}
              nameClass={nameClass}
              actClass={actClass}
              nameStyle={nameStyle?.(slot)}
              separator={slotSeparator?.(slot, i)}
            />
          </div>
        ))}
      </div>
      <ODValue od={od} />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────

export function ChartMetaBlock({ meta, variantClass }: { meta: ChartMeta; variantClass?: string }) {
  return (
    <div className={['rc-head', variantClass].filter(Boolean).join(' ')}>
      <div className="rc-title">【{meta.title || '标题'}】 — 作者: {meta.author || '—'}</div>
      <div className="rc-team">
        前: <b>{meta.front || '—'}</b> | 后: <b>{meta.back || '—'}</b>
      </div>
      {meta.notes && <div className="rc-notes">{meta.notes}</div>}
    </div>
  );
}

// ─── Column header strip (E/G/D keep one; B/C/K omit it) ──────

export function ChartColHead({ template, leading, cells }: { template: string; leading?: ReactNode; cells: ReactNode[] }) {
  return (
    <div className="rc-colhead" style={{ gridTemplateColumns: template }}>
      {leading}
      {cells}
    </div>
  );
}
