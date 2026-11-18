/**
 * 简轴 版式 registry + the single export host.
 *
 * The export container lives OUTSIDE the variant, so all formats share one ref,
 * one `data-timeline-export` marker and one width-expansion patch in the export
 * util. There is deliberately no "temporarily switch format for export" logic:
 * what is on screen is what gets exported.
 *
 * Adding a format is two lines — one entry in FORMAT_LABELS (which is also the
 * dropdown order and the type's source of truth) and one in VARIANTS. ChartFormat
 * widens automatically.
 *
 * The display preference is localStorage-only and must stay out of
 * TurnPlannerState: it is a per-viewer preference and has no business riding
 * along in share codes, saved axles or the Supabase sync.
 */
import { useMemo, useState, type ComponentType, type RefObject } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { CharSkillSummary } from './CharSkillSummary';
import { AC_SAFETY, measureMaxTextWidth, splitMinWidth } from './chartGeometry';
import type { ChartMeta, ChartModel } from './rowChartModel';
import { RowChartTable } from './RowChartTable';
import {
  RowChartBand, RowChartLane, RowChartLog, RowChartRail, RowChartSplit, RowChartZebra,
} from './RowChartVariants';

export interface VariantProps {
  model: ChartModel;
  meta: ChartMeta;
  /** Column count. Only 双栏紧凑 varies it; every other format ignores it. */
  cols: number;
  /**
   * Width (px) of the widest action text, as rendered, + AC_SAFETY. 0 until the
   * measurement has run. Every 版式 uses it as a MINIMUM track size so a skill
   * is never ellipsised — see chartGeometry.ts for why guessing a pixel floor
   * instead produced four visible characters.
   */
  acWidth: number;
  /** The same for the 表格 版式, which renders its actions at 12px rather than 11px. */
  acWidthTable: number;
}

export const FORMAT_LABELS = {
  table: '表格',
  band: '角色色带',
  zebra: '极简斑马',
  lane: '角色泳道',
  rail: '轨道时间线',
  log: '行程表',
  split: '双栏紧凑',
} as const;

export type ChartFormat = keyof typeof FORMAT_LABELS;

const FORMAT_KEY = 'planner-simple-format';

/** Dropdown order = declaration order. */
export const FORMATS = Object.keys(FORMAT_LABELS) as ChartFormat[];

const VARIANTS: Record<ChartFormat, ComponentType<VariantProps>> = {
  table: RowChartTable,
  band: RowChartBand,
  zebra: RowChartZebra,
  lane: RowChartLane,
  rail: RowChartRail,
  log: RowChartLog,
  split: RowChartSplit,
};

/**
 * The widest action text, measured in the two font sizes the chart renders it
 * in: `.rc-row` uses 11px, the 表格 版式's `text-xs` cells 12px. Every 版式
 * turns these into minimum track widths (chartGeometry.ts), so a skill name is
 * never ellipsised — the old fixed floors left a ~44px action cell, i.e. four
 * characters, which is what 「只能输出4个字」 was.
 *
 * Measured in a useMemo rather than an effect, for two reasons: the chart must
 * be right on its FIRST paint (an effect would paint the old narrow layout and
 * then jump, and an export clicked in between captures the wrong one), and a
 * synchronous setState in an effect is a cascading render by definition. The
 * measurement itself only reads layout from a temporary, removed-again <span>,
 * so it has no observable side effect.
 *
 * Keyed on the TEXT, not on `model`: the model is rebuilt whenever the planner
 * state changes (including every keystroke in the detail table), while this
 * needs two measurements per string. The font comes from <body> because the
 * chart only sets its size — the family is inherited — and reading it from the
 * host ref during render would be null on the first pass.
 *
 * 0 means "nothing to measure" and every caller falls back to its own floor.
 */
function useActionWidths(model: ChartModel) {
  const signature = useMemo(() => {
    const texts: string[] = [];
    for (const row of model.rows) {
      if (row.kind !== 'turn') continue;
      for (const slot of row.slots) if (slot.action) texts.push(slot.action);
    }
    return texts.join('\u0000');
  }, [model]);

  return useMemo(() => {
    if (!signature) return ZERO_WIDTHS;
    const family = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily;
    const texts = signature.split('\u0000');
    return {
      acWidth: measureMaxTextWidth(texts, { size: 11, weight: 400, family }) + AC_SAFETY,
      // Raw, not padded: the 表格 formula knows its cell chrome exactly and adds
      // its own slack (see tableActionColWidth).
      acWidthTable: measureMaxTextWidth(texts, { size: 12, weight: 400, family }),
    };
  }, [signature]);
}

const ZERO_WIDTHS = { acWidth: 0, acWidthTable: 0 };

export function useSimpleFormat() {
  const [format, setFormat] = useState<ChartFormat>(() => {
    const saved = localStorage.getItem(FORMAT_KEY);
    return (saved && saved in FORMAT_LABELS) ? saved as ChartFormat : 'table';
  });
  const setAndSave = (f: ChartFormat) => { setFormat(f); localStorage.setItem(FORMAT_KEY, f); };
  return { format, setFormat: setAndSave };
}

const SKILLS_KEY = 'planner-simple-skilllist';

/**
 * 角色技能栏 visibility. Same shape as useSimpleFormat, and localStorage-only for
 * the same reason: it is a per-viewer display preference, so it must not ride
 * along in share codes, saved axles or the Supabase sync.
 *
 * Default OFF, unlike the 版式 default. The 版式 default only had to preserve
 * what existing users already saw; this section ADDS to the exported image, and
 * an export that silently grew a block the user never asked for is a worse
 * default than one they have to switch on.
 *
 * Stored as '1'/'0' rather than a boolean-looking word so a hand-edited value
 * reads as obviously-not-a-flag; an unreadable value falls back to off, which is
 * the same thing `=== '1'` gives for free.
 */
export function useShowCharSkills() {
  const [show, setShow] = useState(() => localStorage.getItem(SKILLS_KEY) === '1');
  const setAndSave = (v: boolean) => { setShow(v); localStorage.setItem(SKILLS_KEY, v ? '1' : '0'); };
  return { show, setShow: setAndSave };
}

export function ChartHost({
  model, meta, format, hostRef, showSkills, skillOverrides,
}: {
  model: ChartModel;
  meta: ChartMeta;
  format: ChartFormat;
  hostRef: RefObject<HTMLDivElement | null>;
  /** 角色技能栏. Off by default — it changes the exported PNG. */
  showSkills: boolean;
  /** Hand-written per-character skill lists; see CharSkillSummary. */
  skillOverrides?: Record<number, string[]>;
}) {
  const Variant = VARIANTS[format];
  // Measured on the live DOM, not a container query: the export clone rewrites
  // this container's width, so a CQ would re-evaluate against a box that only
  // exists inside the clone. Reading the real clientWidth keeps the exported
  // column count identical to what the user is looking at.
  const width = useElementWidth(hostRef);
  const { acWidth, acWidthTable } = useActionWidths(model);
  // Two columns only while both halves can hold a full action at their floor.
  // Below that the format renders one full-width column (same list, same styling).
  const cols = width >= splitMinWidth(acWidth) ? 2 : 1;
  return (
    <div ref={hostRef} data-timeline-export className="card overflow-x-auto !p-0 w-full md:flex-1">
      <Variant model={model} meta={meta} cols={cols} acWidth={acWidth} acWidthTable={acWidthTable} />
      {/* Inside the export container on purpose: the PNG captures this element,
          so the summary needs no export-side handling and cannot drift out of
          sync with what is on screen. It renders under all 7 版式 — it is an
          appendix to the chart, not an alternative to it. */}
      {showSkills && <CharSkillSummary model={model} overrides={skillOverrides} />}
    </div>
  );
}
