/**
 * The row-based 简轴 版式.
 *
 * B 角色色带 and C 极简斑马 both render through RowShell — they differ only in
 * class names, the row background, and what they put inside a slot. That is the
 * whole point of the shared shell: the three semantic cells (label / 3 slots /
 * OD) and the empty-slot rule have exactly one implementation, in
 * RowChartPrimitives.tsx. Do not re-derive any of it here.
 *
 * Everything is model-driven: `row.rowBg` already encodes the OD-block tint and
 * the red/green chain, `row.stripe` is keyed on the RAW turn index (so turning
 * 遭遇战词条 on cannot shear the stripes out of alignment), and `row.od` is
 * pre-formatted at the mode's precision. A variant that computes any of these
 * itself has become a second source of truth.
 *
 * Colours come from --char-N (see index.css): fixed, page-level, and keyed by
 * charIndex so a character keeps its colour across turns. The table's old
 * --simple-slot-N tinting was keyed by SLOT position, which is why a character
 * changed colour when they moved slots.
 */
import { Fragment } from 'react';
import { charColor } from './rowChartModel';
import type { ChartTurnRow } from './rowChartModel';
import type { VariantProps } from './RowChart';
import {
  ChartColHead, ChartMetaBlock, ColorBar, ModRow, NodeMark, ODValue, RailDot, RowShell,
  colStatusTone, labelTone, toneClass, toneColor,
} from './RowChartPrimitives';

/**
 * Label | 3 slots | OD. Shared by B and C; E and G prepend a leading column and
 * pass their own template.
 */
const TEMPLATE = '68px 1fr 96px';

/** E / G prepend a rail resp. node column, so their label column is narrower. */
const RAIL_TEMPLATE = '34px 58px 1fr 92px';
const LOG_TEMPLATE = '16px 62px 1fr 88px';

/** K's columns are half-width, so its label / OD tracks shrink to match. */
const SPLIT_TEMPLATE = '56px 1fr 62px';

/** E and G keep a column header: they introduce columns a reader has no prior for. */
const HEAD = (template: string) => (
  <ChartColHead
    template={template}
    leading={<span />}
    cells={[
      <span key="r">回合</span>,
      <span key="a">行动</span>,
      <span key="o" className="rc-colhead-od">OD</span>,
    ]}
  />
);

// ─── B · 角色色带 ─────────────────────────────────────────────

/**
 * A 3px colour bar and the character's name in their colour. The bar is a real
 * <span> (ColorBar), never a ::before — the export's html2canvas does not paint
 * `content: ""` pseudo-elements, so a bar built that way would be missing from
 * the PNG. An empty slot renders no bar at all (charColor returns undefined).
 */
export function RowChartBand({ model, meta }: VariantProps) {
  return (
    <div className="rc-band rc-wide">
      <ChartMetaBlock meta={meta} />
      {model.rows.map(row => (
        row.kind === 'modifier'
          ? <ModRow
              key={row.key}
              template={TEMPLATE}
              modNum={row.modNum}
              text={row.text}
              od={row.od}
              variantClass="rc-band-mod"
            />
          : <RowShell
              key={row.key}
              template={TEMPLATE}
              variantClass="rc-band-row"
              rowStyle={{ background: row.rowBg || undefined }}
              label={row.roundLabel}
              labelClass={labelTone(row)}
              slots={row.slots}
              od={row.od}
              slotPrefix={slot => <ColorBar color={charColor(slot.charIndex)} />}
              nameStyle={slot => ({ color: charColor(slot.charIndex) })}
            />
      ))}
    </div>
  );
}

// ─── C · 极简斑马 ─────────────────────────────────────────────

/**
 * Zebra stripes plus hairlines between the slots. The stripe is an explicit
 * class driven by row.stripe, NOT CSS :nth-child — a 词条行 sits at the same DOM
 * level and would shift every following row's parity.
 *
 * The divider is a real border-left on slots 2 and 3 (never a pseudo-element),
 * and the shell hands the variant the slot index so it need not recount which
 * one is first.
 */
export function RowChartZebra({ model, meta }: VariantProps) {
  return (
    <div className="rc-zebra rc-wide">
      <ChartMetaBlock meta={meta} />
      {model.rows.map(row => (
        row.kind === 'modifier'
          ? <ModRow
              key={row.key}
              template={TEMPLATE}
              modNum={row.modNum}
              text={row.text}
              od={row.od}
              variantClass="rc-zebra-mod"
            />
          : <RowShell
              key={row.key}
              template={TEMPLATE}
              variantClass="rc-zebra-row"
              rowClass={row.stripe ? 'rc-zebra-alt' : undefined}
              rowStyle={{ background: row.rowBg || undefined }}
              label={row.roundLabel}
              labelClass={labelTone(row)}
              slots={row.slots}
              od={row.od}
              slotClass={(_slot, i) => (i > 0 ? 'rc-slot-div' : undefined)}
            />
      ))}
    </div>
  );
}

// ─── E · 轨道时间线 ───────────────────────────────────────────

/**
 * A continuous rail down the left with a node per round. The line is ONE real
 * absolutely-positioned <span> spanning the list — not a per-row `::before` and
 * not a border on the dots, both of which the export would drop or break
 * between rows. It lives inside .rc-rail-list, which wraps only the rows, so the
 * rail starts below the column header instead of running through it.
 */
export function RowChartRail({ model, meta }: VariantProps) {
  return (
    <div className="rc-rail-variant rc-wide">
      <ChartMetaBlock meta={meta} />
      {HEAD(RAIL_TEMPLATE)}
      <div className="rc-rail-list">
        <span className="rc-rail" aria-hidden="true" />
        {model.rows.map(row => (
          row.kind === 'modifier'
            ? <ModRow
                key={row.key}
                template={RAIL_TEMPLATE}
                leading={<span />}
                modNum={row.modNum}
                text={row.text}
                od={row.od}
                variantClass="rc-rail-mod"
              />
            : <RowShell
                key={row.key}
                template={RAIL_TEMPLATE}
                leading={<RailDot row={row} />}
                variantClass="rc-rail-row"
                rowStyle={{ background: row.rowBg || undefined }}
                label={row.roundLabel}
                labelClass={labelTone(row)}
                slots={row.slots}
                od={row.od}
              />
        ))}
      </div>
    </div>
  );
}

// ─── G · 行程表 ───────────────────────────────────────────────

/**
 * Name · action inline as `name · action`, with a diamond per round. The 30/70
 * split is turned off here in CSS (.rc-log), so a slot reads as one pair rather
 * than two columns — but each pair still takes an equal third of the track and
 * the rows hold the shared fixed height. See the .rc-log section of index.css
 * for why the wrap and the auto row height were given up.
 *
 * The `·` is a real node via slotSeparator: an `::after { content: "·" }` would
 * be visible on screen and absent from the export.
 */
export function RowChartLog({ model, meta }: VariantProps) {
  return (
    <div className="rc-log rc-wide">
      <ChartMetaBlock meta={meta} />
      {HEAD(LOG_TEMPLATE)}
      {model.rows.map(row => (
        row.kind === 'modifier'
          ? <ModRow
              key={row.key}
              template={LOG_TEMPLATE}
              leading={<span />}
              modNum={row.modNum}
              text={row.text}
              od={row.od}
              variantClass="rc-log-mod"
            />
          : <RowShell
              key={row.key}
              template={LOG_TEMPLATE}
              leading={<NodeMark row={row} />}
              variantClass="rc-log-row"
              rowStyle={{ background: row.rowBg || undefined }}
              label={row.roundLabel}
              labelClass={labelTone(row)}
              slots={row.slots}
              od={row.od}
              nameStyle={slot => ({ color: charColor(slot.charIndex) })}
              slotSeparator={slot => (slot.action ? <span className="rc-sep">·</span> : null)}
            />
      ))}
    </div>
  );
}

// ─── D · 角色泳道 (transposed) ────────────────────────────────

/** First column of the lane grid: the frozen character names. */
const LANE_HEAD_W = 96;
/** Floor for a round column — below this the OD cell and stacked actions collide. */
const LANE_COL_MIN = 88;

/**
 * Rows are characters, columns are rounds — the transpose of every other 版式,
 * which is why it cannot share RowShell.
 *
 * The transpose loses three things a row could carry, and each is handled
 * rather than dropped:
 *
 *   1. Two slots of one round can belong to the SAME character. The cell stacks
 *      the actions instead of joining them: nothing is lost, no separator has to
 *      be invented, and the slot order is still readable top-to-bottom.
 *   2. A 词条行 has no "round" to be a row of. It becomes a strip above the grid.
 *      The strip shows the round's ordinal from `ti`, which is the only round
 *      fact a 词条行 carries — in the row 版式 that turn's own label is already
 *      invisible, so this adds nothing that contradicts them.
 *   3. `isODin` / the red chain have no row left to express themselves in, so
 *      they move to the column header via `colStatus` — which is also where a
 *      reader looks when asking "which column is the OD window".
 *
 * Columns come from the model's `rows`, not from `state.turns`: a modifier turn
 * has no row in the row 版式, so giving it a column here would show a round the
 * other six formats hide. Every column keeps its raw `ti` and looks up
 * `laneByChar` / `colStatus` / `odByTi` with it.
 *
 * Width: `minmax(88px, 1fr)` per round, so a short axle fills the panel and a
 * long one scrolls (the host's overflow-x-auto) while the export patch expands
 * to the full width. The first column is sticky so the names stay legible while
 * scrolling horizontally — hence its opaque --rc-frozen background.
 */
export function RowChartLane({ model, meta }: VariantProps) {
  const turns = model.rows.filter((r): r is ChartTurnRow => r.kind === 'turn');
  const mods = model.rows.filter(r => r.kind === 'modifier');
  // `repeat(0, …)` is out of the spec's [1,∞) range, and an invalid value makes
  // the browser drop the whole grid-template-columns declaration — so a 0-turn
  // axle must emit the header column alone rather than a zero-count repeat.
  const template = turns.length > 0
    ? `${LANE_HEAD_W}px repeat(${turns.length}, minmax(${LANE_COL_MIN}px, 1fr))`
    : `${LANE_HEAD_W}px`;

  return (
    <div className="rc-lane">
      <ChartMetaBlock meta={meta} />
      {mods.length > 0 && (
        <div className="rc-lane-mods">
          {mods.map(m => (
            <div key={m.key} className="rc-lane-mod">
              <span className="rc-mod-lbl">词条{m.modNum}</span>
              <span className="rc-sep">·</span>
              <span className="rc-lane-mod-round">回合{m.ti + 1}</span>
              <span className="rc-sep">·</span>
              <span className="rc-mod-txt" title={m.text}>{m.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rc-lane-grid" style={{ gridTemplateColumns: template }}>
        <div className="rc-lane-corner" />
        {turns.map(r => {
          const tone = colStatusTone(model.colStatus[r.ti]);
          return (
            <div
              key={`h${r.ti}`}
              className="rc-lane-colhead"
              style={{ background: r.rowBg || undefined, borderBottomColor: toneColor(tone) }}
            >
              <span className={toneClass(tone)}>{r.roundLabel}</span>
            </div>
          );
        })}
        {model.laneRows.map(lr => (
          <Fragment key={lr.charIndex}>
            <div className="rc-lane-rowhead">
              <span className="rc-lane-dot" style={{ background: charColor(lr.charIndex) }} aria-hidden="true" />
              <span className="rc-lane-nm" style={{ color: charColor(lr.charIndex) }} title={lr.name}>{lr.name}</span>
            </div>
            {turns.map(r => {
              const lanes = model.laneByChar[lr.charIndex]?.[r.ti] ?? [];
              return (
                <div key={`c${lr.charIndex}-${r.ti}`} className="rc-lane-cell" style={{ background: r.rowBg || undefined }}>
                  {lanes.length === 0
                    ? <span className="rc-lane-idle">—</span>
                    : lanes.map(l => (
                        <span key={l.slotIndex} className="rc-lane-act" title={l.action}>{l.action}</span>
                      ))}
                </div>
              );
            })}
          </Fragment>
        ))}
        <div className="rc-lane-odlbl">OD</div>
        {turns.map(r => (
          <div key={`od${r.ti}`} className="rc-lane-odcell" style={{ background: r.rowBg || undefined }}>
            <ODValue od={model.odByTi[r.ti]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── K · 双栏紧凑 ─────────────────────────────────────────────

/**
 * One list split across two columns when the host is wide enough, one column
 * otherwise. `cols` is measured from the live DOM by ChartHost — see
 * useElementWidth for why this is not a container query.
 *
 * Falling back to a single column is NOT a different format: the rows, template
 * and styling are identical, there is just one of them. So "导出跟随当前版式"
 * still holds — and since the export reads the same live measurement, the PNG
 * matches what is on screen rather than re-deciding at capture time.
 *
 * No name abbreviation: a trimmed name would need its own rule set and would
 * disagree with every other 版式. The name keeps its `title` tooltip instead.
 */
export function RowChartSplit({ model, meta, cols }: VariantProps) {
  // A single row cannot fill two columns — splitting it would render an empty
  // half and a divider beside nothing. `cols` is a measurement of the host, not
  // a promise that the content divides, so the guard belongs on the content
  // rather than in the breakpoint: a 1-turn axle reads full width at every
  // window size, which is the same thing the 1-column fallback means.
  const twoCols = cols > 1 && model.rows.length > 1;
  const half = Math.ceil(model.rows.length / 2);
  // Each row is self-contained (it carries its own ti / od / rowBg), so the
  // split needs no turn-index bookkeeping — a 词条行 IS its turn's row.
  const columns = twoCols ? [model.rows.slice(0, half), model.rows.slice(half)] : [model.rows];

  return (
    <div className="rc-split rc-wide">
      <ChartMetaBlock meta={meta} />
      <div className={twoCols ? 'rc-split-cols' : undefined}>
        {columns.map((rows, ci) => (
          <Fragment key={ci}>
            {/* The divider is its own flex item, not a border on a column:
                inside a column it would be paid for out of that column's
                border-box and leave the two halves 24px apart in content
                width. As a sibling it comes out of the free space instead,
                so the two halves measure identically. Real node, naturally —
                the export drops `content:""` pseudo-elements. */}
            {ci > 0 && <span className="rc-split-div" aria-hidden="true" />}
            <div className="rc-split-col">
              {rows.map(row => (
                row.kind === 'modifier'
                  ? <ModRow
                      key={row.key}
                      template={SPLIT_TEMPLATE}
                      modNum={row.modNum}
                      text={row.text}
                      od={row.od}
                      variantClass="rc-split-mod"
                    />
                  : <RowShell
                      key={row.key}
                      template={SPLIT_TEMPLATE}
                      variantClass="rc-split-row"
                      rowStyle={{ background: row.rowBg || undefined }}
                      label={row.roundLabel}
                      labelClass={labelTone(row)}
                      slots={row.slots}
                      od={row.od}
                    />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
