import { describe, expect, it } from 'vitest';
import {
  AC_SAFETY, ROW_BASE_MIN, derivedActionWidth, laneColMin, measureMaxTextWidth,
  rowRootMinWidth, splitColWidth, splitMinWidth, tableActionColWidth, tableMinWidth, tableWidth,
} from './chartGeometry';

/**
 * The complaint these pin: 「每个技能块只能输出4个字」. The floors used to be
 * tuned for a 3–8 character skill, so the action track in a 角色色带 row on the
 * real panel was ~44px — four CJK characters — and everything longer was cut by
 * `text-overflow: ellipsis`, on screen and in the exported PNG.
 *
 * The invariant is therefore not a magic number, it is the relation: whatever
 * the widest action measures, the action track must be at least that wide.
 */

const FORMATS = ['band', 'zebra', 'rail', 'log', 'split'] as const;

describe('rowRootMinWidth', () => {
  it('never goes below the chart\'s own floor, so an unmeasured chart cannot shrink', () => {
    for (const f of FORMATS) expect(rowRootMinWidth(f, 0)).toBe(ROW_BASE_MIN);
  });

  it('gives every 版式 an action track at least as wide as the text it holds', () => {
    // 11px CJK glyphs: 4 chars ≈ 44px … 16 chars ≈ 176px.
    for (const acW of [0, 22, 33, 44, 66, 88, 110, 121, 143, 176]) {
      for (const f of FORMATS) {
        // Holds even while the chart floor (520px) is the larger of the two:
        // there, a slot already has ~44px of action track, i.e. the four
        // characters that used to be the ceiling — and no less.
        expect(derivedActionWidth(f, rowRootMinWidth(f, acW))).toBeGreaterThanOrEqual(acW);
      }
    }
  });

  it('still fits a four-character skill at its floor — the case that used to fail', () => {
    for (const f of FORMATS) expect(derivedActionWidth(f, rowRootMinWidth(f, 44 + AC_SAFETY))).toBeGreaterThan(44);
  });

  it('grows monotonically with the text', () => {
    for (const f of FORMATS) {
      let prev = 0;
      for (const acW of [0, 44, 88, 132]) {
        const w = rowRootMinWidth(f, acW);
        expect(w).toBeGreaterThanOrEqual(prev);
        prev = w;
      }
    }
  });

  it('holds a four-character name in 双栏紧凑, where the 40px box used to ellipsise it', () => {
    // 月城最中 at 11px/600 measures ~48px with the safety margin; the fixed 40px
    // floor cut it to 「月城最…」, which is the same defect as the action text.
    // Asserted on splitColWidth, NOT rowRootMinWidth: the latter is clamped to
    // the 520px whole-chart floor and would pass even with nameW ignored.
    const nameW = 48;
    const acW = 44;
    const col = splitColWidth(acW, nameW);
    const slot = (col - 146 - 4) / 3;
    expect(slot).toBeGreaterThanOrEqual(nameW + 3 + acW);
    // …and the two-column switch has to honour the name too, or 双栏 comes back
    // with the name clipped instead of the action. Asserted as a DIFFERENCE in
    // the switch line: the half itself is always wider than one slot, so
    // comparing it to nameW+gap+acW passes with nameW ignored.
    expect(splitMinWidth(acW, nameW)).toBeGreaterThan(splitMinWidth(acW));
    expect(splitMinWidth(acW, nameW)).toBe(2 * splitColWidth(acW, nameW) + 21);
    const half = (splitMinWidth(acW, nameW) - 21) / 2;
    expect(derivedActionWidth('split', half, nameW)).toBeGreaterThanOrEqual(acW);
  });

  it('gives every 版式 room for a long name as well as a long action', () => {
    const acW = 143;
    const nameW = 66; // a 6-character name
    for (const f of FORMATS) {
      expect(derivedActionWidth(f, rowRootMinWidth(f, acW, nameW), nameW)).toBeGreaterThanOrEqual(acW);
    }
  });
});

describe('table 版式', () => {
  it('keeps the historical 100px action column until the text needs more', () => {
    expect(tableActionColWidth(0)).toBe(100);
    expect(tableActionColWidth(88)).toBe(100);
    expect(tableActionColWidth(133)).toBe(143);
  });

  it('sums to the table width it declares, with enough chrome for the text', () => {
    const acW = 133;
    expect(tableWidth(acW)).toBe(56 + 64 + 3 * (56 + tableActionColWidth(acW)));
    // 4px of side padding + 2px of border, then slack.
    expect(tableActionColWidth(acW) - 6).toBeGreaterThan(acW);
  });

  it('keeps .planner-table\'s 760px floor, which the old inline min-width killed', () => {
    // Restoring the floor is what makes a narrow host scroll the table instead
    // of compressing its columns — the inline `minWidth: '100%'` used to win
    // over the stylesheet's `max(100%, 760px)`.
    expect(tableMinWidth(0)).toBe(760);
    // A 12-char skill's own table is 717px, i.e. the floor still governs…
    expect(tableWidth(133)).toBeLessThan(760);
    expect(tableMinWidth(133)).toBe(760);
    // …and a 20-char one is wider than the floor, so the text governs.
    expect(tableWidth(200)).toBeGreaterThan(760);
    expect(tableMinWidth(200)).toBe(tableWidth(200));
  });
});

describe('laneColMin', () => {
  it('keeps the 88px floor and otherwise pays the cell\'s 12px padding', () => {
    expect(laneColMin(0)).toBe(88);
    expect(laneColMin(76)).toBe(88);
    // `contain: inline-size` means the column can never grow to fit, so this
    // subtraction is the only guarantee the action is not ellipsised.
    expect(laneColMin(121) - 12).toBeGreaterThanOrEqual(121);
  });
});

describe('splitMinWidth / splitColWidth', () => {
  it('measures a HALF, not a whole chart — the 520px floor is not a column floor', () => {
    // Clamping a half to ROW_BASE_MIN put the switch at 2×520+21 = 1061px, above
    // the ~720px the panel gives the chart, so 双栏 lost its two-column mode.
    expect(splitColWidth(20)).toBeLessThan(ROW_BASE_MIN);
    expect(splitMinWidth(20)).toBeLessThan(2 * ROW_BASE_MIN + 21);
    expect(splitMinWidth(20)).toBe(2 * splitColWidth(20) + 21);
  });

  it('is two full columns plus the 20px gap and 1px divider', () => {
    for (const acW of [0, 88, 121]) {
      expect(splitMinWidth(acW)).toBe(2 * splitColWidth(acW) + 21);
    }
  });

  it('never switches to two columns before both halves fit their own floor', () => {
    for (const acW of [20, 88, 121]) {
      const half = (splitMinWidth(acW) - 21) / 2;
      expect(derivedActionWidth('split', half)).toBeGreaterThanOrEqual(acW);
    }
  });
});

describe('measureMaxTextWidth', () => {
  it('returns 0 without a DOM rather than a bogus width', () => {
    expect(measureMaxTextWidth(['破竹之势'], { size: 11, weight: 400, family: 'sans-serif' })).toBe(0);
  });
});
