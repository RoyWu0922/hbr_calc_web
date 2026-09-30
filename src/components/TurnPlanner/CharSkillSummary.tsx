/**
 * 角色技能栏 — the per-character skill list rendered under the chart.
 *
 * It is deliberately NOT a 版式. It is not in the registry, takes no `cols`, and
 * looks identical under all seven formats; putting it in RowChartVariants.tsx
 * would have implied it was one of the choices in the 版式 dropdown.
 *
 * ChartHost renders it INSIDE the `data-timeline-export` container, which is the
 * whole reason it needs no export-side work: the PNG is a capture of that one
 * element, so anything in there is in the image by construction.
 *
 * Rows come from buildCharSkills (rowChartModel.ts) — the same `laneRows` set the
 * 角色泳道 header uses, and the same `charColor(charIndex)` the 角色色带 and
 * 行程表 colour with. A character's name and colour therefore match across every
 * format, and an idle character shows 「—」 in place instead of vanishing.
 */
import { Fragment, useMemo } from 'react';
import { buildCharSkills, charColor } from './rowChartModel';
import type { ChartModel } from './rowChartModel';

export function CharSkillSummary({ model }: { model: ChartModel }) {
  const rows = useMemo(() => buildCharSkills(model), [model]);

  return (
    <div className="rc-skills">
      <div className="rc-skills-head">角色技能一览</div>
      {rows.map(r => (
        <div key={r.charIndex} className="rc-skills-row">
          <span className="rc-skills-nm" style={{ color: charColor(r.charIndex) }} title={r.name}>
            {r.name}
          </span>
          <span className="rc-skills-list">
            {r.skills.length === 0
              ? <span className="rc-skills-idle">—</span>
              : r.skills.map((skill, i) => (
                  // `·` is a real node, never an `::after` — the export drops
                  // `content: ""` pseudo-elements. This is the same shared
                  // .rc-sep that 行程表 and 角色泳道's 词条 strip use.
                  <Fragment key={skill}>
                    {i > 0 && <span className="rc-sep">·</span>}
                    <span className="rc-skills-item">{skill}</span>
                  </Fragment>
                ))}
          </span>
        </div>
      ))}
    </div>
  );
}
