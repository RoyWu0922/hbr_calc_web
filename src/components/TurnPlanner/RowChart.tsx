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
import { useState, type ComponentType, type RefObject } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
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
 * 双栏紧凑 switches at this host width, derived rather than picked.
 *
 * Per half: the split gaps and 1px divider cost 41px, the row's own padding 16,
 * the label and OD tracks (SPLIT_TEMPLATE) 118, the grid gaps 12 — so a half
 * W/2 wide leaves (W/2 - 20.5 - 146) / 3 per slot. The name floor is 40px
 * (.rc-split) plus a 3px slot gap, so the action track gets its own 3 characters
 * (33px) at exactly W = 790. Below that the action collapses to an ellipsis and
 * the format stops being a readable axle; above it, both halves hold.
 *
 * Note the host is capped at 832px by the page layout (main is max-w-7xl =
 * 1280px and the meta card takes a fixed 400px + 16px gap), so the plan's
 * pencilled-in 900px would have meant 双栏紧凑 rendered as one column on every
 * screen that exists. 790 puts the real switch at a ~1240px window, i.e. two
 * columns show up exactly for the windows wide enough to render them well —
 * every 1280px-and-wider window gets the 395px halves this was tuned against.
 */
const SPLIT_MIN_WIDTH = 790;

const FORMAT_KEY = 'planner-simple-format';

export function useSimpleFormat() {
  const [format, setFormat] = useState<ChartFormat>(() => {
    const saved = localStorage.getItem(FORMAT_KEY);
    return (saved && saved in FORMAT_LABELS) ? saved as ChartFormat : 'table';
  });
  const setAndSave = (f: ChartFormat) => { setFormat(f); localStorage.setItem(FORMAT_KEY, f); };
  return { format, setFormat: setAndSave };
}

export function ChartHost({
  model, meta, format, hostRef,
}: {
  model: ChartModel;
  meta: ChartMeta;
  format: ChartFormat;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const Variant = VARIANTS[format];
  // Measured on the live DOM, not a container query: the export clone rewrites
  // this container's width, so a CQ would re-evaluate against a box that only
  // exists inside the clone. Reading the real clientWidth keeps the exported
  // column count identical to what the user is looking at.
  const width = useElementWidth(hostRef);
  const cols = width >= SPLIT_MIN_WIDTH ? 2 : 1;
  return (
    <div ref={hostRef} data-timeline-export className="card overflow-x-auto !p-0 w-full md:flex-1">
      <Variant model={model} meta={meta} cols={cols} />
    </div>
  );
}
