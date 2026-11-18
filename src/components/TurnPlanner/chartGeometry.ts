/**
 * Geometry for the 简轴 轴图, derived from the widest action text.
 *
 * Every 版式 used to hand-tune its tracks for a short skill name, and the
 * leftover room was paid for with `text-overflow: ellipsis`. On the real panel
 * (a 440–720px host beside the 400px meta card) that left an action cell about
 * four CJK characters wide, so 「破竹之势慈悲之刃」 printed as its first four
 * characters — on screen and in the exported PNG alike, because the export is a
 * capture of the same layout.
 *
 * So the chart now asks the text how much room it needs instead of guessing:
 * ONE measurement of the widest action (measureMaxTextWidth) feeds the functions
 * here, each of which returns the minimum width at which that text renders in
 * full. Keeping them pure functions of `acW` is what makes them testable without
 * a browser.
 *
 * The results are MINIMA. A host wider than the floor lays out exactly as it
 * always did — equal thirds, one fixed row height — and a narrower host scrolls
 * horizontally, which the row 版式 already did via `.rc-wide { min-width: 520px }`.
 */

/** `.rc-wide`'s own floor — the chart never renders narrower than this. */
export const ROW_BASE_MIN = 520;

/**
 * Slack per action cell, on top of the measured width: `scrollWidth` rounds up
 * while a flex/grid track rounds down, and a 1px deficit is enough for the
 * browser to swap in an ellipsis. 4px absorbs both roundings plus a glyph that
 * overhangs its advance width.
 */
export const AC_SAFETY = 4;

/** Row padding (3px 8px) left + right. */
const ROW_PAD = 16;
/** `.rc-row` grid gap, counted once between each pair of columns. */
const ROW_GAP = 6;
/** `.rc-slots` flex gap between two slots. */
const SLOT_GAP = 2;
/** `.rc-slot` flex gap between the name and its action. */
const NAME_ACT_GAP = 3;
/** `.rc-ac` is `flex: 1 1 70%` against `.rc-nm`'s 30%. */
const ACTION_SHARE = 0.7;

/** `.rc-nm`'s min-width in every 版式 but 双栏紧凑. */
const NAME_FLOOR = 52;
/** `.rc-split .rc-nm`'s min-width — the compact 版式's deliberate compromise. */
const SPLIT_NAME_FLOOR = 40;

export type RowFormat = 'band' | 'zebra' | 'rail' | 'log' | 'split';

interface RowSpec {
  /** Everything the row spends before its slots: padding, label, OD, row gaps. */
  furniture: number;
  /** Min-width of the name box inside a slot. */
  nameFloor: number;
  /** Extra px one slot spends on decoration, not text. */
  extras: number;
  /** `.rc-slots`' column gap for this 版式 — 行程表 widens it to 12px. */
  slotGap: number;
  /**
   * Whether the slot splits its width 30% name / 70% action. 行程表's pair is
   * content-sized instead, so its need is simply additive.
   */
  ratioSplit: boolean;
}

const ROW_SPECS: Record<RowFormat, RowSpec> = {
  // '68px 1fr 96px' — two gaps.
  band: { furniture: ROW_PAD + 68 + 96 + ROW_GAP * 2, nameFloor: NAME_FLOOR, extras: 4, slotGap: SLOT_GAP, ratioSplit: true },
  zebra: { furniture: ROW_PAD + 68 + 96 + ROW_GAP * 2, nameFloor: NAME_FLOOR, extras: 6, slotGap: SLOT_GAP, ratioSplit: true },
  // '34px 58px 1fr 92px' — three gaps.
  rail: { furniture: ROW_PAD + 34 + 58 + 92 + ROW_GAP * 3, nameFloor: NAME_FLOOR, extras: 0, slotGap: SLOT_GAP, ratioSplit: true },
  // '16px 62px 1fr 88px' — three gaps; the pair's `·` plus its two gaps.
  // `.rc-log .rc-slots { gap: 4px 12px }` — its column gap is 6× the shared 2px,
  // which is 20px of the row's width that the shared SLOT_GAP does not cover.
  log: { furniture: ROW_PAD + 16 + 62 + 88 + ROW_GAP * 3, nameFloor: 44, extras: 10, slotGap: 12, ratioSplit: false },
  // '56px 1fr 62px' — two gaps. Two columns only when 双栏 renders them.
  split: { furniture: ROW_PAD + 56 + 62 + ROW_GAP * 2, nameFloor: SPLIT_NAME_FLOOR, extras: 0, slotGap: SLOT_GAP, ratioSplit: true },
};

/*
 * The decorations the `extras` numbers pay for, since a silent change to any of
 * them would show up only as a clipped glyph:
 *   band  — .rc-bar is `flex: 0 0 3px` + `.rc-band .rc-bar { margin-right: 1px }`
 *   zebra — `.rc-zebra .rc-slot-div { border-left: 1px; padding-left: 5px }`
 *   log   — the real `·` node plus the 3px gap on either side of it
 */

/**
 * The width one slot needs so its action fits without ellipsising.
 *
 * Two branches, because the slot splits unevenly: while the 30% name box is at
 * its floor the action just takes the rest (`additive`), and once 30% of the
 * slot is wider than that floor the action only ever gets 70% of it — so the
 * slot has to be proportionally bigger (`proportional`). Using only the additive
 * branch was 1.4px short for a 12-character skill, which is exactly the kind of
 * off-by-a-glyph that a pixel floor cannot be trusted to absorb.
 *
 * `nameW` raises the name floor to the widest name this axle actually has: the
 * fixed floors are sized for a 3–4 character name, and a four-character one in
 * 双栏紧凑's 40px box ellipsised to 「月城最…」 — the same defect as the action
 * text, one column over, and newly reachable now that the compact format's
 * two-column mode comes back for short skills.
 */
function slotNeed(spec: RowSpec, acW: number, nameW: number): number {
  const fixed = NAME_ACT_GAP + spec.extras;
  const nameFloor = Math.max(spec.nameFloor, nameW);
  const additive = nameFloor + fixed + acW;
  if (!spec.ratioSplit) return Math.ceil(additive);
  return Math.ceil(Math.max(additive, (acW + fixed) / ACTION_SHARE));
}

/**
 * Minimum width of a row 版式's root so no action has to ellipsise.
 *
 * `acW` is the widest action in px, 0 when the axle has no actions at all — the
 * result is then clamped to ROW_BASE_MIN, i.e. the layout the chart has always
 * had, so an empty chart cannot shrink either.
 */
export function rowRootMinWidth(format: RowFormat, acW: number, nameW = 0): number {
  const spec = ROW_SPECS[format];
  const slots = 3 * slotNeed(spec, acW, nameW) + spec.slotGap * 2;
  return Math.max(ROW_BASE_MIN, spec.furniture + slots);
}

/**
 * One 双栏紧凑 column's floor, WITHOUT the whole-chart 520px floor.
 *
 * The two-column decision has to ask 「does a HALF fit」, and ROW_BASE_MIN is the
 * floor of a whole chart, not of a half — clamping a half to it put the switch
 * at 2 × 520 + 21 = 1061px, i.e. above the ~720px the panel actually gets, so
 * the format silently lost its two-column mode even for short skills. A half
 * only has to hold a row.
 */
export function splitColWidth(acW: number, nameW = 0): number {
  const spec = ROW_SPECS.split;
  return Math.ceil(spec.furniture + 3 * slotNeed(spec, acW, nameW) + spec.slotGap * 2);
}

/**
 * The width a row root actually gives ONE slot's action track. The inverse of
 * rowRootMinWidth, and the reason it exists: a test can assert the invariant
 * 「the action track is at least as wide as the text it must hold」 without
 * re-deriving the furniture numbers in the test file.
 */
export function derivedActionWidth(format: RowFormat, rootWidth: number, nameW = 0): number {
  const spec = ROW_SPECS[format];
  const nameFloor = Math.max(spec.nameFloor, nameW);
  const slot = (rootWidth - spec.furniture - spec.slotGap * 2) / 3;
  const name = spec.ratioSplit ? Math.max(slot * (1 - ACTION_SHARE), nameFloor) : nameFloor;
  return slot - name - NAME_ACT_GAP - spec.extras;
}

/** 表格's 回合 / name / OD columns are fixed; only the action ones follow the text. */
export const TABLE_FIXED = { round: 56, name: 56, od: 64 } as const;

/**
 * The 表格's own min-width: `.planner-table` declares `max(100%, 760px)` so a
 * narrow host scrolls instead of compressing the tracks, and this table used to
 * kill that floor by pinning an inline `minWidth: '100%'`. It also carries an
 * inline `width` that never took effect — `.simple-timeline` sets
 * `width: 100% !important`, which wins over any inline width — so the columns'
 * own widths (the colgroup below) are what actually size it. Hence: min-width,
 * no width.
 */
export function tableMinWidth(acW: number): number {
  return Math.max(760, tableWidth(acW));
}

/**
 * The action column's width in the 表格 版式, from the action text's own width.
 *
 * `acW` here is the RAW 12px measurement — no AC_SAFETY, because the cell's
 * chrome is known: `.planner-table td` has 0.125rem of side padding plus a
 * collapsed border, ~6–8px, and the 100px floor it used to have was already
 * ~5px short of an 8-character skill. The extra is 10px: the chrome plus the
 * same few px of rounding slack the row 版式 buy with AC_SAFETY.
 */
export function tableActionColWidth(acW: number): number {
  return Math.max(100, Math.ceil(acW) + 10);
}

/** The 表格's total column width (the columns, which is what actually sizes it). */
export function tableWidth(acW: number): number {
  return TABLE_FIXED.round + TABLE_FIXED.od + 3 * (TABLE_FIXED.name + tableActionColWidth(acW));
}

/**
 * 角色泳道's round-column floor. Its cells are `contain: inline-size`, so a
 * column can never chase the text and this floor is the ONLY thing that can stop
 * an action being ellipsised. 12px pays the cell's `padding: 3px 6px`.
 */
export function laneColMin(acW: number): number {
  return Math.max(88, Math.ceil(acW) + 12);
}

/**
 * Host width at which 双栏紧凑 can show two columns: two column floors (each
 * WITHOUT the whole-chart 520px floor, see splitColWidth) plus the 20px flex gap
 * and the 1px divider between them. The panel gives the chart ~720px, so two
 * columns still only appear for short skills — a long skill legitimately wants
 * the full width.
 */
export function splitMinWidth(acW: number, nameW = 0): number {
  return 2 * splitColWidth(acW, nameW) + 21;
}

/**
 * The widest of a set of strings, measured in the font the chart actually
 * renders with. Returns 0 where there is no DOM (or nothing to measure), which
 * callers must treat as "not measured yet" rather than "zero width".
 *
 * A hidden <span> is used instead of a canvas context so the browser applies the
 * same font fallback, kerning and CJK glyph selection the rows will use. The
 * element is removed before this returns, so it is never part of an export.
 */
export function measureMaxTextWidth(
  texts: readonly string[],
  font: { size: number; weight: number; family: string },
): number {
  if (typeof document === 'undefined' || texts.length === 0) return 0;
  const span = document.createElement('span');
  span.style.cssText = [
    'position:absolute', 'left:-99999px', 'top:0', 'white-space:nowrap', 'visibility:hidden',
    `font-size:${font.size}px`, `font-weight:${font.weight}`, `font-family:${font.family}`,
  ].join(';');
  document.body.appendChild(span);
  let max = 0;
  try {
    for (const text of texts) {
      span.textContent = text;
      max = Math.max(max, span.getBoundingClientRect().width);
    }
  } finally {
    span.remove();
  }
  return Math.ceil(max);
}
