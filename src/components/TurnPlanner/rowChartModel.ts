/**
 * Shared derived model for the 简轴 (simple axle) chart.
 *
 * Every 版式 (table / band / zebra / lane / rail / log / split) renders from
 * this one model. Before this file existed the derivation lived inline in the
 * JSX map inside SimpleTable, so "which rows get tinted / how OD is truncated /
 * how the red chain is found" had exactly one implementation and any second
 * view would have had to copy it. Nothing here is new logic — each function is
 * a line-by-line transcription of what SimpleTable used to do, and the tests in
 * rowChartModel.test.ts pin it.
 *
 * Keep it pure: no React, no DOM, no localStorage. That is what makes it
 * testable without a component renderer.
 */
import type { ComputedTurnResult, PlannerTurn, TurnPlannerChar, TurnPlannerState } from '../../types';

// ─── Formatting ───────────────────────────────────────────────

/** Moved here from TurnPlanner.tsx so the model and the planner format identically. */
export function fmtFloat(n: number, decimals = 1): string {
  if (!isFinite(n)) return '—';
  return Number(n.toFixed(decimals)).toLocaleString('zh-CN');
}

// ─── Character colors ─────────────────────────────────────────
//
// Fixed 6-color palette keyed by charIndex (NOT by slot position, which is what
// the old <colgroup> tinting did). Deliberately decoupled from the 25 planner
// themes: the tokens live in :root / [data-theme="light"] only, never in
// PLANNER_STYLES, so usePlannerStyle's inline vars cannot override them.

export const CHAR_COLORS = [
  'var(--char-1)',
  'var(--char-2)',
  'var(--char-3)',
  'var(--char-4)',
  'var(--char-5)',
  'var(--char-6)',
] as const;

/** undefined for an empty slot — callers must not paint a bar in that case. */
export function charColor(charIndex: number): string | undefined {
  return charIndex >= 0 && charIndex < CHAR_COLORS.length ? CHAR_COLORS[charIndex] : undefined;
}

export function charDisplayName(characters: TurnPlannerChar[], ci: number): string {
  return characters[ci]?.name || `C${ci + 1}`;
}

export const FRONT_INDICES = [0, 1, 2] as const;
export const BACK_INDICES = [3, 4, 5] as const;

/** Front = chars 0-2, back = 3-5 (matches the detail table layout). */
export function buildTeamNames(characters: TurnPlannerChar[]): { front: string; back: string } {
  return {
    front: FRONT_INDICES.map(i => charDisplayName(characters, i)).join('  '),
    back: BACK_INDICES.map(i => charDisplayName(characters, i)).join('  '),
  };
}

// ─── Chart header meta ────────────────────────────────────────

export interface ChartMeta {
  title: string;
  author: string;
  notes: string;
  front: string;
  back: string;
}

/** title/author/notes come from SimpleTable's props; the team names come from state. */
export function buildChartMeta(
  state: TurnPlannerState,
  title: string,
  author: string,
  notes: string,
): ChartMeta {
  const { front, back } = buildTeamNames(state.characters);
  return { title, author, notes, front, back };
}

// ─── Round classification ─────────────────────────────────────

export function isODRound(label: string): boolean { return label.includes('OD'); }
export function isExtraRound(label: string): boolean { return label.includes('追加'); }

// ─── Model types ──────────────────────────────────────────────

export interface ODModel {
  odMode: number;
  /** null when the raw OD does not exceed the cap; otherwise the difference. */
  overflow: number | null;
  /** Pre-formatted overflow delta — null exactly when `overflow` is null. */
  overflowText: string | null;
  /** Pre-formatted capped value, used only when `overflow` is null. */
  text: string;
  negative: boolean;
}

export interface ChartSlot {
  charIndex: number;   // -1 = empty
  name: string;        // '' for an empty slot
  action: string;
}

export interface ChartTurnRow {
  kind: 'turn';
  /** React key + reset identity; equals ti. */
  key: number;
  /** Index into state.turns — drives computed[] and turns[] lookups. */
  ti: number;
  roundLabel: string;
  isOD: boolean;
  isODin: boolean;
  isExtra: boolean;
  /** 追加 that follows an OD (directly or through a run of other 追加). */
  extraIsRed: boolean;
  /** Zebra stripe, keyed on ti so it stays aligned when 词条行 are filtered out. */
  stripe: boolean;
  slots: [ChartSlot, ChartSlot, ChartSlot];
  rowBg: string;
  sOdStyle: '' | 's1' | 's2' | 's3';
  od: ODModel;
}

export interface ChartModRow {
  kind: 'modifier';
  key: number;
  ti: number;
  /** 1-based ordinal among the modifier rows up to and including this one. */
  modNum: number;
  text: string;
  od: ODModel;
}

export type ChartRow = ChartTurnRow | ChartModRow;

export type ColStatus = 'normal' | 'od' | 'extra' | 'extraRed';

/** One action sitting in a char/turn cell of the transposed (角色泳道) view. */
export interface ChartLane {
  slotIndex: number;
  charIndex: number;
  name: string;
  action: string;
}

/**
 * A row header of the transposed view. Built from `characters`, not from
 * `laneByChar` — a character with no actions at all still gets a lane, and its
 * name has to come from somewhere. Uses the same `charDisplayName` fallback
 * (`C{n}`) as the slots, so the lane header and the row charts can never
 * disagree about what an unnamed character is called.
 */
export interface ChartLaneRow {
  charIndex: number;
  name: string;
}

export interface ChartModel {
  /** Filtered by showEncounter, in the same order the table renders them. */
  rows: ChartRow[];
  /** Indexed by raw ti over state.turns, so both row kinds can look up their own OD. */
  odByTi: ODModel[];
  /** Indexed by raw ti; the transposed view reads it via row.ti for its column headers. */
  colStatus: ColStatus[];
  /** laneByChar[charIndex][ti] — a cell stacks when the same char fills 2 slots. */
  laneByChar: ChartLane[][][];
  /** The transposed view's row headers, one per character slot (always 6). */
  laneRows: ChartLaneRow[];
  /** Number of kind==='turn' rows in `rows`. */
  nTurns: number;
  odDec: number;
  odOverflowDec: number;
}

// ─── OD cell ──────────────────────────────────────────────────

function buildOd(
  result: ComputedTurnResult | undefined,
  odMode: number,
  odDec: number,
  odOverflowDec: number,
): ODModel {
  const capped = result?.odCapped ?? 0;
  const diff = (result?.odAssist ?? 0) - odMode;
  const overflow = diff > 0.005 ? diff : null;
  return {
    odMode,
    overflow,
    overflowText: overflow === null ? null : fmtFloat(overflow, odOverflowDec),
    text: fmtFloat(capped, odDec),
    negative: capped < 0,
  };
}

// ─── OD block tinting ─────────────────────────────────────────

/**
 * Walking tint for OD windows: successive OD rounds cycle s1 → s2 → s3 so
 * adjacent windows are distinguishable. `bi % 3 || 3` is load-bearing — when
 * bi%3 is 0 the `||` sends it to index 3, which is 's3'.
 *
 * Skipped entirely while showEncounter is on (the table does the same), and
 * 追加 rows keep whatever tint the preceding OD round established.
 */
export function computeOdStyles(turns: PlannerTurn[], showEncounter: boolean): ('' | 's1' | 's2' | 's3')[] {
  const styles: ('' | 's1' | 's2' | 's3')[] = new Array(turns.length).fill('');
  if (showEncounter) return styles;
  const CYCLE = ['', 's1', 's2', 's3'] as const;
  let cur: '' | 's1' | 's2' | 's3' = '';
  let bi = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (isODRound(t.roundLabel) && !t.roundLabel.includes('OD内')) {
      bi++; cur = CYCLE[bi % 3 || 3];
    } else if (t.roundLabel.includes('OD内')) {
      bi++; cur = CYCLE[bi % 3 || 3];
    } else if (!isExtraRound(t.roundLabel)) {
      cur = '';
    }
    styles[i] = cur;
  }
  return styles;
}

/** JS-hardcoded rgba — intentionally NOT theme tokens (the table did the same). */
export const S_BG1 = 'rgba(59,130,246,0.10)';
export const S_BG2 = 'rgba(147,51,234,0.10)';
export const S_BG3 = 'rgba(234,88,12,0.08)';

export function computeRowBg(
  sOdStyle: '' | 's1' | 's2' | 's3',
  flags: { isOD: boolean; isODin: boolean; extraIsRed: boolean; isExtra: boolean },
): string {
  if (sOdStyle === 's1') return S_BG1;
  if (sOdStyle === 's2') return S_BG2;
  if (sOdStyle === 's3') return S_BG3;
  if (flags.isOD || flags.isODin || flags.extraIsRed) return 'rgba(239,68,68,0.06)';
  if (flags.isExtra) return 'rgba(34,197,94,0.04)';
  return '';
}

// ─── Red chain ────────────────────────────────────────────────

/**
 * A 追加 is "red" when it continues an OD window: either it directly follows an
 * OD round, or it follows a run of 追加 rows that traces back to one.
 */
export function computeRedChain3(turns: PlannerTurn[], ti: number): boolean {
  const turn = turns[ti];
  if (!turn || !isExtraRound(turn.roundLabel)) return false;
  const prevTurn = ti > 0 ? turns[ti - 1] : null;
  const prevIsOD = prevTurn ? isODRound(prevTurn.roundLabel) || prevTurn.roundLabel.includes('OD内') : false;
  if (prevIsOD) return true;
  for (let k = ti - 1; k >= 0; k--) {
    const t = turns[k];
    if (isODRound(t.roundLabel) || t.roundLabel.includes('OD内')) return true;
    if (!isExtraRound(t.roundLabel)) break;
  }
  return false;
}

/**
 * 1-based ordinal of a modifier row. Scans the FULL turns array up to ti, not
 * the filtered row list, so hiding/revealing other rows cannot renumber it.
 */
export function countModifiers(turns: PlannerTurn[], ti: number): number {
  let n = 0;
  for (let k = 0; k <= ti; k++) {
    if (turns[k]?.encounterModifier !== undefined) n++;
  }
  return n;
}

// ─── Slots ────────────────────────────────────────────────────

/** An empty slot keeps charIndex -1 and an '' name; renderers show a centered 「—」. */
export function toSlot(
  fa: { charIndex: number; action: string } | undefined,
  characters: TurnPlannerChar[],
): ChartSlot {
  if (!fa) return { charIndex: -1, name: '', action: '' };
  // Not-an-integer counts as empty, so the name, the colour and the lane cell all
  // agree on 「—」. See isValidSlotIndex for what NaN used to do.
  const ci = isValidSlotIndex(fa.charIndex, characters.length) ? fa.charIndex : -1;
  return {
    charIndex: ci,
    name: ci >= 0 ? charDisplayName(characters, ci) : '',
    action: fa.action || '',
  };
}

/**
 * Whether a raw `charIndex` from state names a real slot.
 *
 * `Number.isInteger` is load-bearing, not defensive noise: `Number('')` is NaN,
 * and `NaN < 0` and `NaN >= n` are BOTH false, so a plain range test passes NaN
 * through and the caller then indexes with it. That is not hypothetical — a
 * malformed share code or a corrupted stored axle can carry it, and the lane
 * aggregation below does `laneByChar[NaN][ti]`, which throws during render and
 * took the whole app down to a white screen (SimpleTable has no error boundary).
 */
function isValidSlotIndex(ci: number, count: number): boolean {
  return Number.isInteger(ci) && ci >= 0 && ci < count;
}

// ─── Entry point ──────────────────────────────────────────────

export function buildChartModel(state: TurnPlannerState, computed: ComputedTurnResult[]): ChartModel {
  const { characters, turns } = state;
  // Hit-count modes (120/200) show 3 decimals; percentage modes (300/500) keep 2.
  const odDec = state.odMode < 300 ? 3 : 2;
  const odOverflowDec = state.odMode < 300 ? 3 : 1;

  const sOdStyles = computeOdStyles(turns, state.showEncounter);

  const odByTi: ODModel[] = turns.map((_, ti) => buildOd(computed[ti], state.odMode, odDec, odOverflowDec));

  const colStatus: ColStatus[] = turns.map((turn, ti) => {
    const isOD = isODRound(turn.roundLabel);
    const isODin = turn.roundLabel.includes('OD内');
    const isExtra = isExtraRound(turn.roundLabel);
    if (isExtra && computeRedChain3(turns, ti)) return 'extraRed';
    if (isOD || isODin) return 'od';
    if (isExtra) return 'extra';
    return 'normal';
  });

  const laneByChar: ChartLane[][][] = characters.map(() => turns.map(() => []));
  turns.forEach((turn, ti) => {
    turn.frontActions.forEach((fa, slotIndex) => {
      const ci = fa.charIndex;
      // Reads the RAW state value, so it needs the same validity test toSlot uses
      // rather than a bare range check — NaN would slip past one and index
      // laneByChar[NaN] here, which is what crashed the app.
      if (!isValidSlotIndex(ci, laneByChar.length)) return;
      laneByChar[ci][ti].push({
        slotIndex,
        charIndex: ci,
        name: charDisplayName(characters, ci),
        action: fa.action || '',
      });
    });
  });

  const rows: ChartRow[] = [];
  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    const isModifierTurn = turn.encounterModifier !== undefined;
    // Mirrors the table's `.filter(t => showEncounter || t.encounterModifier === undefined)`:
    // a 词条行 exists in the list only while showEncounter is on. Dropping this
    // makes hidden modifier turns leak through as ordinary turn rows.
    if (isModifierTurn && !state.showEncounter) continue;

    const od = odByTi[ti];

    if (isModifierTurn) {
      rows.push({
        kind: 'modifier',
        key: ti,
        ti,
        modNum: countModifiers(turns, ti),
        text: turn.encounterModifier ?? '',
        od,
      });
      continue;
    }

    const isOD = isODRound(turn.roundLabel);
    const isODin = turn.roundLabel.includes('OD内');
    const isExtra = isExtraRound(turn.roundLabel);
    const extraIsRed = computeRedChain3(turns, ti);
    const sOdStyle = sOdStyles[ti];

    rows.push({
      kind: 'turn',
      key: ti,
      ti,
      roundLabel: turn.roundLabel,
      isOD,
      isODin,
      isExtra,
      extraIsRed,
      stripe: ti % 2 === 0,
      slots: [
        toSlot(turn.frontActions[0], characters),
        toSlot(turn.frontActions[1], characters),
        toSlot(turn.frontActions[2], characters),
      ],
      rowBg: computeRowBg(sOdStyle, { isOD, isODin, extraIsRed, isExtra }),
      sOdStyle,
      od,
    });
  }

  return {
    rows,
    odByTi,
    colStatus,
    laneByChar,
    laneRows: characters.map((_, ci) => ({ charIndex: ci, name: charDisplayName(characters, ci) })),
    nTurns: rows.reduce((n, r) => (r.kind === 'turn' ? n + 1 : n), 0),
    odDec,
    odOverflowDec,
  };
}
