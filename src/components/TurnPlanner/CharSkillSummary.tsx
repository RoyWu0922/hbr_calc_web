/**
 * 角色技能栏 — the per-character skill list rendered under the chart, plus the
 * editor that lets a user overwrite it by hand.
 *
 * It is deliberately NOT a 版式. It is not in the registry, takes no `cols`, and
 * looks identical under all seven formats; putting it in RowChartVariants.tsx
 * would have implied it was one of the choices in the 版式 dropdown.
 *
 * ChartHost renders the summary INSIDE the `data-timeline-export` container,
 * which is the whole reason it needs no export-side work: the PNG is a capture
 * of that one element, so anything in there is in the image by construction.
 * The EDITOR therefore lives outside that container — see CharSkillEditor.
 *
 * Rows come from buildCharSkills (rowChartModel.ts) — the same `laneRows` set the
 * 角色泳道 header uses, and the same `charColor(charIndex)` the 角色色带 and
 * 行程表 colour with. A character's name and colour therefore match across every
 * format, and an idle character shows 「—」 in place instead of vanishing.
 *
 * `overrides` replaces the derived list for a character. A key that is PRESENT
 * wins even when its array is empty ("this character contributes nothing"), so
 * only deleting the key restores the automatic list. Callers keep the map inside
 * TurnPlannerState so it travels with a saved or shared axle.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buildCharSkills, charColor, formatSkillEntries, parseSkillEntries } from './rowChartModel';
import type { CharSkillRow, ChartModel } from './rowChartModel';

export function CharSkillSummary({
  model, overrides,
}: {
  model: ChartModel;
  /** Per-character hand-written lists, keyed by charIndex. See the file header. */
  overrides?: Record<number, string[]>;
}) {
  const rows = useMemo(() => buildCharSkills(model), [model]);

  return (
    <div className="rc-skills">
      <div className="rc-skills-head">角色技能一览</div>
      {rows.map(r => {
        // `!== undefined` rather than `??`: an empty override is a real value.
        const override = overrides?.[r.charIndex];
        const skills = override !== undefined ? override : r.skills;
        return (
          <div key={r.charIndex} className="rc-skills-row">
            <span className="rc-skills-nm" style={{ color: charColor(r.charIndex) }} title={r.name}>
              {r.name}
            </span>
            <span className="rc-skills-list">
              {skills.length === 0
                ? <span className="rc-skills-idle">—</span>
                : skills.map((skill, i) => (
                    // `·` is a real node, never an `::after` — the export drops
                    // `content: ""` pseudo-elements. This is the same shared
                    // .rc-sep that 行程表 and 角色泳道's 词条 strip use.
                    // Keyed on the index too: a user may legitimately type the
                    // same skill twice in one override.
                    <Fragment key={`${i}:${skill}`}>
                      {i > 0 && <span className="rc-sep">·</span>}
                      <span className="rc-skills-item">{skill}</span>
                    </Fragment>
                  ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The 技能一览 editor.
 *
 * Rendered OUTSIDE the export container on purpose. The export is a capture of
 * `[data-timeline-export]`, so an editor inside it would print its own input
 * boxes into the PNG whenever the user exported while the editor was open —
 * which is exactly when they are tuning the list. Sitting beside the chart keeps
 * the export path free of any special-casing.
 *
 * Every field is PREFILLED with what the bar currently shows, so editing starts
 * from the derived list instead of from an empty box the user has to retype.
 * 「恢复自动」 therefore means "throw my edits away", not "fill it in".
 *
 * The field is backed by a local draft string, not by the stored array. The
 * array round-trips through formatSkillEntries → parseSkillEntries, which drops
 * empty tokens, so binding the input straight to it deleted every separator the
 * instant it was typed — no comma, `·` or `，` could be entered at all. The
 * draft keeps exactly what was typed while the parsed value goes to state, so
 * the bar under the chart still updates live.
 */
export function CharSkillEditor({
  model, overrides, onChange,
}: {
  model: ChartModel;
  overrides?: Record<number, string[]>;
  onChange: (next: Record<number, string[]>) => void;
}) {
  const rows = useMemo(() => buildCharSkills(model), [model]);

  // What the field shows for a row when nobody has edited it: the derived list.
  const autoText = (r: CharSkillRow) => formatSkillEntries(overrides?.[r.charIndex] ?? r.skills);

  const [draft, setDraft] = useState<Record<number, string>>(() => {
    const d: Record<number, string> = {};
    for (const r of rows) d[r.charIndex] = autoText(r);
    return d;
  });

  // Our own commits come back down as new `overrides`, and re-deriving the draft
  // from them would eat the separator the user just typed (the exact bug the
  // draft exists to avoid). Remember the last map we emitted and only resync
  // when `overrides` changes for some OTHER reason — an axle load, a reset.
  const lastEmitted = useRef<string | null>(null);
  useEffect(() => {
    const sig = JSON.stringify(overrides ?? {});
    if (lastEmitted.current === sig) return;
    const d: Record<number, string> = {};
    for (const r of rows) d[r.charIndex] = formatSkillEntries(overrides?.[r.charIndex] ?? r.skills);
    setDraft(d);
    // `rows` is derived from `model`; including it re-syncs when the axle's own
    // actions change, which is the other case where the auto text moves.
  }, [overrides, rows]);

  const emit = (next: Record<number, string[]>) => {
    lastEmitted.current = JSON.stringify(next);
    onChange(next);
  };

  const setRow = (charIndex: number, text: string) => {
    setDraft(d => ({ ...d, [charIndex]: text }));
    const next = { ...(overrides ?? {}) };
    next[charIndex] = parseSkillEntries(text);
    emit(next);
  };

  const resetRow = (charIndex: number) => {
    const next = { ...(overrides ?? {}) };
    delete next[charIndex];
    const auto = rows.find(r => r.charIndex === charIndex);
    setDraft(d => ({ ...d, [charIndex]: auto ? formatSkillEntries(auto.skills) : '' }));
    emit(next);
  };

  const resetAll = () => {
    const d: Record<number, string> = {};
    for (const r of rows) d[r.charIndex] = formatSkillEntries(r.skills);
    setDraft(d);
    emit({});
  };

  const overriddenCount = rows.filter(r => overrides?.[r.charIndex] !== undefined).length;

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold">角色技能一览 · 手动编辑</span>
        <span className="text-[10px] text-text-muted">已按自动结果填入，直接在上面改；用 · 或逗号分隔，清空表示这一栏不显示技能</span>
        <div className="flex-1" />
        <button
          className="btn btn-secondary btn-xs whitespace-nowrap"
          onClick={resetAll}
          disabled={overriddenCount === 0}
          title="所有角色都改回自动从行动槽抽取"
        >全部恢复自动</button>
      </div>
      {rows.map(r => {
        const isOverridden = overrides?.[r.charIndex] !== undefined;
        return (
          <div key={r.charIndex} className="flex items-center gap-2">
            <span
              className="rc-skills-nm flex-shrink-0"
              style={{ color: charColor(r.charIndex), width: 68 }}
              title={r.name}
            >{r.name}</span>
            <input
              className="input-field text-xs py-1 flex-1 min-w-0"
              type="text"
              value={draft[r.charIndex] ?? ''}
              placeholder="（这一栏不显示技能）"
              onChange={e => setRow(r.charIndex, e.target.value)}
              aria-label={`${r.name || '角色'} 的技能，逗号分隔`}
            />
            <button
              className="btn btn-secondary btn-xs flex-shrink-0 whitespace-nowrap"
              onClick={() => resetRow(r.charIndex)}
              disabled={!isOverridden}
              title="这一个角色改回自动抽取"
            >恢复自动</button>
          </div>
        );
      })}
    </div>
  );
}
