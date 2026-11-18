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
import { useEffect, useMemo, useState, type ComponentType, type RefObject } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useAppSettings } from '../../utils/appSettings';
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
   * Width (px) of the widest action text, as rendered, + AC_SAFETY. 0 when the
   * axle has no actions at all (never "not measured yet" — the measurement runs
   * during the first render). Every 版式 uses it as a MINIMUM track size so a
   * skill is never ellipsised — see chartGeometry.ts for why guessing a pixel
   * floor instead produced four visible characters.
   */
  acWidth: number;
  /**
   * Width (px) of the widest character name on the axle, + AC_SAFETY. The name
   * box has its own floor (52px, 40px in 双栏紧凑) tuned for a 3–4 character
   * name, so a longer one ellipsised — the same defect as the action text, one
   * column over.
   */
  nameWidth: number;
  /** The same as acWidth for the 表格 版式, which renders its actions at 12px rather than 11px. */
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
 * Measured in a useMemo rather than an effect: the chart must be right on its
 * FIRST paint (an effect would paint the old narrow layout and then jump, and an
 * export clicked in between captures the wrong one), and a synchronous setState
 * in an effect is a cascading render by definition. The measurement only reads
 * layout from a temporary, removed-again <span>, so it has no observable effect.
 *
 * Three things invalidate the cache, and all three change how wide a string
 * renders: the text itself, the 文字字体 setting (设置 → 字体, which rewrites the
 * `--font-body` variable), and a webfont that arrives after the first paint
 * (`document.fonts.ready`). Keying only on the text measured with a fallback
 * font and never again would leave the floor short by the font's own difference.
 */
function useActionWidths(model: ChartModel) {
  const { settings } = useAppSettings();
  const [fontGeneration, setFontGeneration] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    // BOTH, because they cover different events: `ready` settles the fonts the
    // page was already using at load, and `loadingdone` fires again for every
    // later download — which is the common case here, since the presets are
    // fetched on first use when the user switches 文字字体.
    const bump = () => { if (alive) setFontGeneration(g => g + 1); };
    void document.fonts.ready.then(bump);
    document.fonts.addEventListener('loadingdone', bump);
    return () => {
      alive = false;
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, []);

  // ONE STRING, not an object: useMemo compares dependencies by value, so the
  // text keeps its identity across the planner's re-renders (every keystroke in
  // the detail table rebuilds `model`) and the measurement below only re-runs
  // when a string or the font actually changed. The font preset and generation
  // ride inside it for the same reason — a late webfont changes the metrics of
  // the same text, and folding them in is what makes them honest dependencies
  // instead of keys the linter rightly calls unnecessary.
  const signature = useMemo(() => {
    const actionTexts: string[] = [];
    const nameTexts: string[] = [];
    for (const row of model.rows) {
      if (row.kind !== 'turn') continue;
      for (const slot of row.slots) {
        if (slot.action) actionTexts.push(slot.action);
        if (slot.name) nameTexts.push(slot.name);
      }
    }
    return [settings.fontText, fontGeneration, nameTexts.join('\u0000'), actionTexts.join('\u0000')].join('\u0001');
  }, [model, settings.fontText, fontGeneration]);

  return useMemo(() => {
    const [, , names, actions] = signature.split('\u0001');
    if (!names && !actions) return ZERO_WIDTHS;
    // Read off the DOM rather than rebuilt from the preset: it is the family the
    // rows will actually inherit, whatever --font-body resolved to.
    const family = typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(document.body).fontFamily;
    const texts = (s: string) => (s ? s.split('\u0000') : []);
    return {
      acWidth: measureMaxTextWidth(texts(actions), { size: 11, weight: 400, family }) + AC_SAFETY,
      // 600 because 行程表's name is bold — the widest case the box must hold.
      nameWidth: measureMaxTextWidth(texts(names), { size: 11, weight: 600, family }) + AC_SAFETY,
      // Raw, not padded: the 表格 formula knows its cell chrome exactly and adds
      // its own slack (see tableActionColWidth).
      acWidthTable: measureMaxTextWidth(texts(actions), { size: 12, weight: 400, family }),
    };
  }, [signature]);
}

const ZERO_WIDTHS = { acWidth: 0, acWidthTable: 0, nameWidth: 0 };

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
  const { acWidth, acWidthTable, nameWidth } = useActionWidths(model);
  // Two columns only while both halves can hold a full action at their floor.
  // Below that the format renders one full-width column (same list, same styling).
  const cols = width >= splitMinWidth(acWidth, nameWidth) ? 2 : 1;
  return (
    <div ref={hostRef} data-timeline-export className="card overflow-x-auto !p-0 w-full md:flex-1">
      <Variant model={model} meta={meta} cols={cols} acWidth={acWidth} acWidthTable={acWidthTable} nameWidth={nameWidth} />
      {/* Inside the export container on purpose: the PNG captures this element,
          so the summary needs no export-side handling and cannot drift out of
          sync with what is on screen. It renders under all 7 版式 — it is an
          appendix to the chart, not an alternative to it. */}
      {showSkills && <CharSkillSummary model={model} overrides={skillOverrides} />}
    </div>
  );
}
