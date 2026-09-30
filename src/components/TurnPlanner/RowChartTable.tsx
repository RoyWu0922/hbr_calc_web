/**
 * 表格 版式 — the original 简轴 table, now driven by the shared model.
 *
 * Deliberately still a real <table>: the exported PNG relied on the table's
 * own layout, and the export util has a <td>/<th> vertical-centering patch
 * guarded on `clonedDoc.querySelector('table')` that only this variant wants.
 *
 * One intentional difference from the row-based variants: an empty slot here
 * renders as a blank cell, not 「—」. That was the existing behaviour and P1 is
 * a no-visual-change refactor, so it stays. Note this is not a `charIndex === -1`
 * check — the model already turned an empty slot into '' and we just print it.
 */
import { Fragment } from 'react';
import type { ChartMeta, ChartModel, ChartModRow, ChartTurnRow } from './rowChartModel';
import { ODValue, labelTone } from './RowChartPrimitives';

/**
 * Theme-tied per-slot column tint. This is keyed on SLOT position, which is
 * right for the table because its columns are literally 「行动槽1/2/3」 — but it
 * is exactly why the row-based variants use CHAR_COLORS (per character) instead.
 */
const SIMPLE_SLOT_COLORS = [
  'var(--simple-slot1)',
  'var(--simple-slot2)',
  'var(--simple-slot3)',
] as const;

export function RowChartTable({ model, meta }: { model: ChartModel; meta: ChartMeta }) {
  return (
    <table className="planner-table simple-timeline" style={{ tableLayout: 'fixed', width: '100%' }}>
      <colgroup>
        <col style={{ width: 56 }} />
        <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[0] }} />
        <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[0] }} />
        <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[1] }} />
        <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[1] }} />
        <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[2] }} />
        <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[2] }} />
        <col style={{ width: 64 }} />
      </colgroup>
      <thead>
        <tr>
          <td colSpan={8} className="font-bold text-xs text-center px-2" style={{ borderBottom: 'none' }}>
            【{meta.title || '标题'}】 — 作者: {meta.author || '—'}
          </td>
        </tr>
        <tr>
          <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none' }}>
            前: <span className="font-bold">{meta.front || '—'}</span> | 后: <span className="font-bold">{meta.back || '—'}</span>
          </td>
        </tr>
        {meta.notes && (
          <tr>
            <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {' '}{meta.notes}
            </td>
          </tr>
        )}
        <tr>
          <th>回合</th>
          <th colSpan={2} className="text-center">行动槽1</th>
          <th colSpan={2} className="text-center">行动槽2</th>
          <th colSpan={2} className="text-center">行动槽3</th>
          <th>当前OD</th>
        </tr>
      </thead>
      <tbody>
        {model.rows.map(row => (
          row.kind === 'modifier'
            ? <ModifierRow key={row.key} row={row} />
            : <TurnRow key={row.key} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function ModifierRow({ row }: { row: ChartModRow }) {
  return (
    <tr className="planner-mod-row">
      <td className="font-bold text-[10px] text-purple-400">词条{row.modNum}</td>
      <td colSpan={6} className="text-xs text-left pl-1 text-text-muted">{row.text}</td>
      <td className={`font-mono font-bold text-xs text-center ${row.od.negative ? 'text-red-400' : 'text-accent'}`}>
        <ODValue od={row.od} />
      </td>
    </tr>
  );
}

function TurnRow({ row }: { row: ChartTurnRow }) {
  // The trailing space matters: it keeps the od-start class and alt-row from
  // running together into one class name.
  const rowClass = (row.isOD && !row.isODin ? 'planner-od-start ' : '') + (row.stripe ? 'alt-row' : '');
  return (
    <tr className={rowClass}>
      <td className={`font-bold text-xs ${labelTone(row)}`} style={{ background: row.rowBg || undefined }}>
        {row.roundLabel}
      </td>
      {row.slots.map((slot, ai) => (
        <Fragment key={ai}>
          <td className="font-medium text-xs text-right pr-1">{slot.name}</td>
          <td className="text-xs text-left pl-1">{slot.action}</td>
        </Fragment>
      ))}
      <td className={`font-mono font-bold text-xs text-center ${row.od.negative ? 'text-red-400' : 'text-accent'}`}>
        <ODValue od={row.od} />
      </td>
    </tr>
  );
}
