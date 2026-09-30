/**
 * Pins the 简轴 chart model — the single source of truth all 7 formats render
 * from. These fixtures are the P1 acceptance check that the refactor out of
 * SimpleTable's inline JSX changed no behaviour.
 *
 * Note on fixtures: createDefaultState() reuses ONE emptyFA/emptyChar object
 * across all turns and characters, so a fixture must never mutate the default
 * state in place — build fresh objects (see `fa`/`turn` below).
 */
import { describe, expect, it } from 'vitest';
import { computeTurnPlanner, createDefaultState } from '../../engine/turnPlanner';
import type { ComputedTurnResult, FrontAction, PlannerTurn, TurnPlannerState } from '../../types';
import {
  S_BG1, S_BG2, buildCharSkills, buildChartModel, buildTeamNames, charColor, computeOdStyles, skillKeys,
  computeRedChain3, countModifiers, fmtFloat, toSlot, type ChartModel, type ChartTurnRow,
} from './rowChartModel';

// ─── Fixtures ─────────────────────────────────────────────────

function fa(charIndex: number, action = ''): FrontAction {
  return { charIndex, action, spCost: 0, spGain: 0, odGain: 0, dr: 0 };
}

function turn(roundLabel: string, opts: Partial<PlannerTurn> = {}): PlannerTurn {
  return {
    roundLabel,
    turnType: roundLabel.includes('追加') ? 'extra' : 'normal',
    frontActions: [fa(-1), fa(-1), fa(-1)],
    backSPGain: [0, 0, 0],
    jailOD: 0,
    passiveOD: 0,
    pursuitOD: 0,
    passiveDR: 0,
    bossDR: 0,
    ...opts,
  };
}

/** A 词条行 is just a turn carrying encounterModifier. */
function mod(text: string, roundLabel = '2'): PlannerTurn {
  return turn(roundLabel, { encounterModifier: text });
}

function state(overrides: Partial<TurnPlannerState> = {}): TurnPlannerState {
  return { ...createDefaultState(), ...overrides };
}

function results(pairs: [number, number][]): ComputedTurnResult[] {
  return pairs.map(([odAssist, odCapped]) => ({
    sp: [0, 0, 0, 0, 0, 0], odAssist, odCapped, cumulativeDR: 0, remainingDR: 0,
  }));
}

const ZERO = results([]);

function turnRows(model: ChartModel): ChartTurnRow[] {
  return model.rows.filter((r): r is ChartTurnRow => r.kind === 'turn');
}

function modelOf(s: TurnPlannerState, computed: ComputedTurnResult[] = ZERO): ChartModel {
  return buildChartModel(s, computed);
}

// ─── (a) default 10-turn empty axle ───────────────────────────

describe('(a) default 10-turn empty axle', () => {
  const model = modelOf(createDefaultState());

  it('renders one turn row per turn, in order', () => {
    expect(model.rows).toHaveLength(10);
    expect(model.rows.every(r => r.kind === 'turn')).toBe(true);
    expect(model.nTurns).toBe(10);
    expect(turnRows(model).map(r => r.roundLabel)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('marks every slot empty so renderers can centre the 「—」', () => {
    for (const row of turnRows(model)) {
      expect(row.slots.map(s => s.charIndex)).toEqual([-1, -1, -1]);
      expect(row.slots.map(s => s.name)).toEqual(['', '', '']);
      expect(row.slots.map(s => s.action)).toEqual(['', '', '']);
    }
  });

  it('stripes on the raw turn index', () => {
    expect(turnRows(model).map(r => r.stripe)).toEqual([true, false, true, false, true, false, true, false, true, false]);
  });

  it('applies no tint and no OD block tint', () => {
    for (const row of turnRows(model)) {
      expect(row.rowBg).toBe('');
      expect(row.sOdStyle).toBe('');
      expect(row.isOD).toBe(false);
      expect(row.isODin).toBe(false);
      expect(row.isExtra).toBe(false);
      expect(row.extraIsRed).toBe(false);
    }
    expect(computeOdStyles(createDefaultState().turns, false).every(s => s === '')).toBe(true);
  });

  it('has a zeroed OD cell per turn', () => {
    expect(model.odByTi).toHaveLength(10);
    for (const od of model.odByTi) {
      expect(od.text).toBe('0');
      expect(od.overflow).toBeNull();
      expect(od.overflowText).toBeNull();
      expect(od.negative).toBe(false);
    }
  });

  it('leaves every lane empty', () => {
    expect(model.laneByChar).toHaveLength(6);
    for (const byTi of model.laneByChar) {
      expect(byTi).toHaveLength(10);
      for (const cell of byTi) expect(cell).toEqual([]);
    }
    expect(model.colStatus.every(s => s === 'normal')).toBe(true);
  });
});

// ─── (b) 后置OD + OD内 + 3 consecutive 追加 ────────────────────

describe('(b) OD window with a run of 追加', () => {
  const turns = [
    turn('1'),
    turn('后置OD1'),
    turn('OD内'),
    turn('追加'),
    turn('追加'),
    turn('追加'),
    turn('2'),
  ];
  const model = modelOf(state({ turns }));
  const rows = turnRows(model);

  it('cycles s1 → s2 → s3 across successive OD rounds', () => {
    // 后置OD1 → bi=1 → s1; OD内 → bi=2 → s2; the 追加 run inherits s2.
    expect(computeOdStyles(turns, false)).toEqual(['', 's1', 's2', 's2', 's2', 's2', '']);
    expect(rows.map(r => r.sOdStyle)).toEqual(['', 's1', 's2', 's2', 's2', 's2', '']);
  });

  it('wraps back to s3 (not s0) when the counter is a multiple of 3', () => {
    const sixODs = [
      turn('前置OD1'), turn('前置OD2'), turn('前置OD3'),
      turn('前置OD4'), turn('前置OD5'), turn('OD内'),
    ];
    // bi increments on every OD round, so the 3rd and 6th land on `bi % 3 === 0`
    // and the `|| 3` sends them to index 3 — 's3', not ''.
    expect(computeOdStyles(sixODs, false)).toEqual(['s1', 's2', 's3', 's1', 's2', 's3']);
  });

  it('tints OD rows by their block, and 追加 rows inherit the block tint', () => {
    expect(rows.map(r => r.rowBg)).toEqual(['', S_BG1, S_BG2, S_BG2, S_BG2, S_BG2, '']);
  });

  it('marks the 追加 run red once it traces back to the OD window', () => {
    expect(rows.map(r => r.extraIsRed)).toEqual([false, false, false, true, true, true, false]);
    expect(computeRedChain3(turns, 3)).toBe(true);  // directly follows OD内
    expect(computeRedChain3(turns, 5)).toBe(true);  // reaches it through the run
    expect(computeRedChain3(turns, 0)).toBe(false); // not a 追加 at all
  });

  it('never marks a 追加 red when no OD precedes it', () => {
    const lonely = [turn('1'), turn('追加')];
    expect(computeRedChain3(lonely, 1)).toBe(false);
    expect(turnRows(modelOf(state({ turns: lonely })))[1].rowBg).toBe('rgba(34,197,94,0.04)');
  });

  it('labels column status for the transposed view', () => {
    expect(model.colStatus).toEqual(['normal', 'od', 'od', 'extraRed', 'extraRed', 'extraRed', 'normal']);
  });
});

// ─── (c) showEncounter with 词条行 ────────────────────────────

describe('(c) encounter modifiers', () => {
  const turns = [
    turn('1'),
    turn('前置OD1'),
    turn('OD内'),
    turn('追加'),
    mod('敌方全体攻击力 +30%'),
    mod('每回合 HP 回复', '3'),
  ];

  it('hides 词条行 entirely when showEncounter is off', () => {
    const model = modelOf(state({ turns, showEncounter: false }));
    expect(model.rows).toHaveLength(4);
    expect(model.rows.every(r => r.kind === 'turn')).toBe(true);
  });

  it('interleaves 词条行 in place and numbers them from 1', () => {
    const model = modelOf(state({ turns, showEncounter: true }));
    expect(model.rows.map(r => r.kind)).toEqual(['turn', 'turn', 'turn', 'turn', 'modifier', 'modifier']);
    const mods = model.rows.filter(r => r.kind === 'modifier');
    expect(mods.map(r => r.modNum)).toEqual([1, 2]);
    expect(mods.map(r => r.text)).toEqual(['敌方全体攻击力 +30%', '每回合 HP 回复']);
    expect(model.nTurns).toBe(4);
    expect(countModifiers(turns, 0)).toBe(0);
    expect(countModifiers(turns, 4)).toBe(1);
    expect(countModifiers(turns, 5)).toBe(2);
  });

  it('suppresses the OD block tint entirely while showEncounter is on', () => {
    const on = turnRows(modelOf(state({ turns, showEncounter: true })));
    expect(computeOdStyles(turns, true).every(s => s === '')).toBe(true);
    // 前置OD1 falls back to the generic OD red instead of its s1 block tint.
    expect(on[1].sOdStyle).toBe('');
    expect(on[1].rowBg).toBe('rgba(239,68,68,0.06)');

    const off = turnRows(modelOf(state({ turns, showEncounter: false })));
    expect(off[1].sOdStyle).toBe('s1');
    expect(off[1].rowBg).toBe(S_BG1);
  });

  it('a 词条行 interrupts the red chain (pre-existing behaviour, pinned)', () => {
    // computeRedChain3 stops at the first row that is neither OD nor 追加 — a
    // 词条行 or a plain turn qualifies, so a 追加 beyond one is NOT red.
    expect(computeRedChain3([turn('前置OD1'), mod('词条', '2'), turn('追加')], 2)).toBe(false);
    expect(computeRedChain3([turn('前置OD1'), turn('2'), turn('追加')], 2)).toBe(false);
  });

  it('stamps the 词条行 with its own turn’s OD cell', () => {
    const model = modelOf(state({ turns, showEncounter: true }), results([
      [0, 0], [10, 10], [20, 20], [30, 30], [340, 300], [50, 50],
    ]));
    const mods = model.rows.filter(r => r.kind === 'modifier');
    // odMode 300 → overflow dec 1: 340 - 300 = 40
    expect(mods[0].od.overflow).toBe(40);
    expect(mods[0].od.overflowText).toBe('40');
  });
});

// ─── (d) OD precision + negative OD ──────────────────────────

describe('(d) OD precision and negative OD', () => {
  it('uses 3 decimals below 300 and 2 at/above it', () => {
    const hit = modelOf(state({ turns: [turn('1')], odMode: 120 }));
    const pct = modelOf(state({ turns: [turn('1')], odMode: 300 }));
    expect(hit.odDec).toBe(3);
    expect(hit.odOverflowDec).toBe(3);
    expect(pct.odDec).toBe(2);
    expect(pct.odOverflowDec).toBe(1);
  });

  it('formats the capped value at the mode’s precision', () => {
    const pct = modelOf(state({ turns: [turn('1')], odMode: 300 }), results([[63.421, 63.421]]));
    expect(pct.odByTi[0].text).toBe('63.42');
    const hit = modelOf(state({ turns: [turn('1')], odMode: 120 }), results([[12.3456, 12.3456]]));
    expect(hit.odByTi[0].text).toBe('12.346');
  });

  it('shows overflow only past the 0.005 threshold', () => {
    // Asserted in 120 (overflow dec 3) so the formatted value is legible and the
    // result does not hinge on binary-float rounding at the boundary.
    const at = modelOf(state({ turns: [turn('1')], odMode: 120 }), results([[120.004, 120.004]]));
    expect(at.odByTi[0].overflow).toBeNull();
    expect(at.odByTi[0].overflowText).toBeNull();
    expect(at.odByTi[0].text).toBe('120.004');

    const over = modelOf(state({ turns: [turn('1')], odMode: 120 }), results([[120.006, 120.006]]));
    expect(over.odByTi[0].overflow).toBeCloseTo(0.006, 6);
    expect(over.odByTi[0].overflowText).toBe('0.006');
  });

  it('formats the overflow delta at the mode’s overflow precision', () => {
    const pct = modelOf(state({ turns: [turn('1')], odMode: 300 }), results([[341.24, 300]]));
    expect(pct.odByTi[0].overflow).toBeCloseTo(41.24, 6);
    expect(pct.odByTi[0].overflowText).toBe('41.2'); // odOverflowDec 1
  });

  it('flags a negative OD for the red label', () => {
    const neg = modelOf(state({ turns: [turn('1')], odMode: 300 }), results([[-36.58, -36.58]]));
    expect(neg.odByTi[0].negative).toBe(true);
    expect(neg.odByTi[0].text).toBe('-36.58');
    expect(neg.odByTi[0].overflow).toBeNull();

    const pos = modelOf(state({ turns: [turn('1')], odMode: 300 }), results([[1, 1]]));
    expect(pos.odByTi[0].negative).toBe(false);
  });

  it('reads the OD of a hidden 词条行 by its raw ti, not its row position', () => {
    const turns = [turn('1'), mod('词条'), turn('2')];
    const computed = results([[1, 1], [2, 2], [3, 3]]);
    const hidden = modelOf(state({ turns, showEncounter: false }), computed);
    // Row index 1 is turn '2' (ti=2) — it must show OD 3, not OD 2.
    expect(hidden.rows[1].od.text).toBe('3');
    expect(turnRows(hidden)[1].ti).toBe(2);
  });
});

// ─── Slots, lanes, names ──────────────────────────────────────

describe('slots and lanes', () => {
  it('falls back to C{n} for an unnamed character, in both the slot and the lane', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(4, '大招'), fa(-1), fa(-1)] })] });
    const model = modelOf(s);
    expect(turnRows(model)[0].slots[0]).toEqual({ charIndex: 4, name: 'C5', action: '大招' });
    expect(model.laneByChar[4][0]).toEqual([{ slotIndex: 0, charIndex: 4, name: 'C5', action: '大招' }]);
    // and the same fallback feeds the header
    expect(buildTeamNames(s.characters)).toEqual({ front: 'C1  C2  C3', back: 'C4  C5  C6' });
  });

  it('uses the character name, and an empty action stays empty', () => {
    // .map widens the 6-tuple to an array; the cast restores the tuple the state wants.
    const chars0 = createDefaultState().characters;
    const chars = chars0.map((c, i) => (i === 0 ? { ...c, name: '月城最中' } : c)) as typeof chars0;
    const s = state({ characters: chars, turns: [turn('1', { frontActions: [fa(0), fa(-1), fa(-1)] })] });
    expect(turnRows(modelOf(s))[0].slots[0]).toEqual({ charIndex: 0, name: '月城最中', action: '' });
  });

  it('stacks two slots in one lane cell when the same character acts twice', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(2, '破竹之势'), fa(2, '慈悲之刃'), fa(-1)] })] });
    const cell = modelOf(s).laneByChar[2][0];
    expect(cell.map(l => [l.slotIndex, l.action])).toEqual([[0, '破竹之势'], [1, '慈悲之刃']]);
  });

  it('ignores out-of-range charIndex when building lanes', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(9), fa(-1), fa(-1)] })] });
    expect(modelOf(s).laneByChar.every(byTi => byTi[0].length === 0)).toBe(true);
  });

  it('gives every character slot a lane row, named like a slot would be', () => {
    const model = modelOf(createDefaultState());
    expect(model.laneRows).toEqual([
      { charIndex: 0, name: 'C1' }, { charIndex: 1, name: 'C2' }, { charIndex: 2, name: 'C3' },
      { charIndex: 3, name: 'C4' }, { charIndex: 4, name: 'C5' }, { charIndex: 5, name: 'C6' },
    ]);
  });

  it('names a lane row after its character, and agrees with the slot', () => {
    const chars0 = createDefaultState().characters;
    const chars = chars0.map((c, i) => (i === 3 ? { ...c, name: '国见玉' } : c)) as typeof chars0;
    const model = modelOf(state({ characters: chars, turns: [turn('1', { frontActions: [fa(3, '追击'), fa(-1), fa(-1)] })] }));
    // The lane header and the row chart's slot must resolve the same name — both
    // go through charDisplayName, and this is what would break if they did not.
    expect(model.laneRows[3]).toEqual({ charIndex: 3, name: '国见玉' });
    expect(turnRows(model)[0].slots[0].name).toBe('国见玉');
  });

  it('keeps a lane row even when the character never acts', () => {
    const model = modelOf(state({ turns: [turn('1', { frontActions: [fa(0, '增强'), fa(-1), fa(-1)] })] }));
    expect(model.laneRows).toHaveLength(6);
    expect(model.laneByChar[5][0]).toEqual([]);
  });

  it('toSlot normalises an empty action and an absent slot', () => {
    expect(toSlot(undefined, state().characters)).toEqual({ charIndex: -1, name: '', action: '' });
    expect(toSlot({ charIndex: -1, action: 'x' }, state().characters)).toEqual({ charIndex: -1, name: '', action: 'x' });
  });

  it('charColor maps 0-5 and nothing else', () => {
    expect([0, 1, 2, 3, 4, 5].map(charColor)).toEqual([
      'var(--char-1)', 'var(--char-2)', 'var(--char-3)', 'var(--char-4)', 'var(--char-5)', 'var(--char-6)',
    ]);
    expect(charColor(-1)).toBeUndefined();
    expect(charColor(6)).toBeUndefined();
  });
});

// ─── Formatting ───────────────────────────────────────────────

describe('fmtFloat', () => {
  it('trims trailing zeros and passes through the precision', () => {
    expect(fmtFloat(63.421, 2)).toBe('63.42');
    expect(fmtFloat(41.2, 1)).toBe('41.2');
    expect(fmtFloat(4, 1)).toBe('4');
    expect(fmtFloat(-36.58, 2)).toBe('-36.58');
  });

  it('renders a non-finite value as an em dash', () => {
    expect(fmtFloat(NaN)).toBe('—');
    expect(fmtFloat(Infinity)).toBe('—');
  });
});

// ─── An invalid charIndex is data, not a crash ────────────────

describe('invalid charIndex', () => {
  // A share code / stored axle is user-supplied JSON, so charIndex can be any
  // number. NaN is the interesting one: `NaN < 0` and `NaN >= n` are both false,
  // so a bare range test passes it and the lane aggregation indexed
  // laneByChar[NaN] — a render-time throw that white-screened the whole app.
  it('treats a NaN slot as empty instead of throwing', () => {
    const s = state({
      turns: [turn('1', { frontActions: [fa(NaN, '大招'), fa(0, '增强'), fa(-1)] })],
    });
    const model = buildChartModel(s, computeTurnPlanner(s));
    const slots = turnRows(model)[0].slots;
    // Exactly what a literal -1 slot produces, action text included: an empty
    // slot has always kept its action in the model (SlotBody renders 「—」 and
    // ignores it), so NaN must not be a third kind of slot.
    expect(slots[0]).toEqual(toSlot(fa(-1, '大招'), s.characters));
    expect(slots[0]).toEqual({ charIndex: -1, name: '', action: '大招' });
    // the valid slot beside it is untouched
    expect(slots[1].charIndex).toBe(0);
    // and nothing was filed under a NaN lane
    expect(model.laneByChar[0][0].map(l => l.action)).toEqual(['增强']);
    expect(model.laneByChar.flat(2).every(l => Number.isInteger(l.charIndex))).toBe(true);
  });

  it('treats a NaN slot as empty in toSlot', () => {
    const chars = state().characters;
    expect(toSlot(fa(NaN, '大招'), chars)).toEqual(toSlot(fa(-1, '大招'), chars));
    // a well-formed empty slot and a real one keep their existing meaning
    expect(toSlot(undefined, chars).charIndex).toBe(-1);
    expect(toSlot(fa(2, 'x'), chars).charIndex).toBe(2);
  });
});

// ─── A real engine pass, so the model is exercised on real output ──

describe('integration with computeTurnPlanner', () => {
  it('builds from the engine’s own results', () => {
    const s = state({
      turns: [
        turn('1', { frontActions: [fa(0, '增强'), fa(-1), fa(-1)] }),
        turn('前置OD1', { frontActions: [fa(1, '大招'), fa(-1), fa(-1)] }),
        turn('追加', { frontActions: [fa(1, '大招'), fa(-1), fa(-1)] }),
      ],
    });
    const model = buildChartModel(s, computeTurnPlanner(s));
    expect(model.rows).toHaveLength(3);
    expect(model.odByTi).toHaveLength(3);
    expect(model.nTurns).toBe(3);
    // '追加' trails an OD round, so it is red.
    expect(turnRows(model)[2].extraIsRed).toBe(true);
    expect(model.laneByChar[1][1].map(l => l.action)).toEqual(['大招']);
  });
});

// ─── 角色技能栏 ────────────────────────────────────────────────

describe('buildCharSkills', () => {
  it('emits one row per character slot, always 6', () => {
    const rows = buildCharSkills(modelOf(createDefaultState()));
    expect(rows).toHaveLength(6);
    expect(rows.map(r => r.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(rows.every(r => r.skills.length === 0)).toBe(true);
  });

  it('dedupes per character and keeps first-use order', () => {
    const s = state({
      turns: [
        turn('1', { frontActions: [fa(0, '破竹之势'), fa(1, '圣夜的赠礼'), fa(-1)] }),
        turn('2', { frontActions: [fa(0, '无情歼灭'), fa(1, '圣夜的赠礼'), fa(-1)] }),
        turn('3', { frontActions: [fa(0, '破竹之势'), fa(-1), fa(-1)] }),
      ],
    });
    const rows = buildCharSkills(modelOf(s));
    // The repeat on turn 3 adds nothing, and the repeat is what would break a
    // Set-free implementation's order (it would sort or re-append).
    expect(rows[0].skills).toEqual(['破竹之势', '无情歼灭']);
    // Each character gets their own entry for a shared skill name.
    expect(rows[1].skills).toEqual(['圣夜的赠礼']);
  });

  it('keeps the skills while 遭遇战词条 are hidden', () => {
    const turns = [
      turn('1', { frontActions: [fa(0, '增强'), fa(-1), fa(-1)] }),
      mod('敌方全体攻击力 +30%'),
      turn('2', { frontActions: [fa(0, '大招'), fa(-1), fa(-1)] }),
    ];
    const off = buildCharSkills(modelOf(state({ turns, showEncounter: false })));
    const on = buildCharSkills(modelOf(state({ turns, showEncounter: true })));
    // The 词条行 has no frontActions, so both sources agree — but they must agree
    // rather than one of them blanking the character out.
    expect(off[0].skills).toEqual(['增强', '大招']);
    expect(on[0].skills).toEqual(['增强', '大招']);
  });

  it('keeps turn order across a hidden 词条行', () => {
    const turns = [
      turn('1', { frontActions: [fa(3, '甲'), fa(-1), fa(-1)] }),
      mod('词条'),
      turn('2', { frontActions: [fa(3, '乙'), fa(-1), fa(-1)] }),
    ];
    expect(buildCharSkills(modelOf(state({ turns, showEncounter: false })))[3].skills).toEqual(['甲', '乙']);
  });

  it('collects both actions when one character fills two slots of a turn', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(2, '破竹之势'), fa(2, '慈悲之刃'), fa(-1)] })] });
    expect(buildCharSkills(modelOf(s))[2].skills).toEqual(['破竹之势', '慈悲之刃']);
  });

  it('skips a slot whose action is blank or only whitespace', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(0, '   '), fa(0, '大招'), fa(-1)] })] });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['大招']);
  });

  it('strips padding, so spacing does not create a second entry', () => {
    const s = state({
      turns: [
        turn('1', { frontActions: [fa(0, '大招'), fa(-1), fa(-1)] }),
        turn('2', { frontActions: [fa(0, ' 大招 '), fa(-1), fa(-1)] }),
      ],
    });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['大招']);
  });

  it('files a levelled and a parenthesised variant under the bare name', () => {
    const s = state({
      turns: [
        turn('1', { frontActions: [fa(0, '破竹之势慈悲之刃'), fa(-1), fa(-1)] }),
        turn('2', { frontActions: [fa(0, '破竹之势慈悲之刃2'), fa(-1), fa(-1)] }),
        turn('3', { frontActions: [fa(0, '破竹之势慈悲之刃(强化)'), fa(-1), fa(-1)] }),
        turn('4', { frontActions: [fa(0, '破竹之势慈悲之刃（弱化）'), fa(-1), fa(-1)] }),
      ],
    });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['破竹之势慈悲之刃']);
  });

  it('keeps what follows a separator, so 角色-技能-类型 names stay distinct', () => {
    // The regression guard for the normalisation: this app's own skill names are
    // `胜利之弧-普加攻` / `胜利之弧-心眼`. Identity is the whole 汉字/字母 run,
    // so the hyphen and everything after it is kept — a leading-run-only rule
    // would file both as `胜利之弧` and the bar would stop naming the skill.
    const s = state({
      turns: [
        turn('1', { frontActions: [fa(0, '胜利之弧-普加攻'), fa(-1), fa(-1)] }),
        turn('2', { frontActions: [fa(0, '胜利之弧-心眼'), fa(-1), fa(-1)] }),
      ],
    });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['胜利之弧普加攻', '胜利之弧心眼']);
  });

  it('splits one slot holding two skills on the plus', () => {
    const s = state({
      turns: [turn('1', { frontActions: [fa(0, '破竹之势+慈悲之刃＋终焉之刃'), fa(-1), fa(-1)] })],
    });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['破竹之势', '慈悲之刃', '终焉之刃']);
  });

  it('names a character exactly as the lane header and the slots do', () => {
    const chars0 = createDefaultState().characters;
    const chars = chars0.map((c, i) => (i === 4 ? { ...c, name: '白河结奈' } : c)) as typeof chars0;
    const s = state({ characters: chars, turns: [turn('1', { frontActions: [fa(4, '终焉之刃'), fa(-1), fa(-1)] })] });
    expect(buildCharSkills(modelOf(s))[4]).toEqual({ charIndex: 4, name: '白河结奈', skills: ['终焉之刃'] });
  });

  it('drops a NaN slot instead of filing it under a lane', () => {
    const s = state({ turns: [turn('1', { frontActions: [fa(NaN, '大招'), fa(1, '增强'), fa(-1)] })] });
    const rows = buildCharSkills(modelOf(s));
    expect(rows.every(r => r.skills.includes('大招'))).toBe(false);
    expect(rows[1].skills).toEqual(['增强']);
  });

  it("strips the axle's own character names, and the arrow tail, out of the bar", () => {
    const chars0 = createDefaultState().characters;
    const chars = chars0.map((c, i) => (i === 0 ? { ...c, name: '月城最中' } : c)) as typeof chars0;
    const s = state({
      characters: chars,
      turns: [
        turn('1', { frontActions: [fa(0, '月城最中-破竹之势'), fa(-1), fa(-1)] }),
        // Same skill, written with the arrow the app's own names use.
        turn('2', { frontActions: [fa(0, '破竹之势->强化'), fa(-1), fa(-1)] }),
      ],
    });
    // Both spellings file under the one skill.
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['破竹之势']);
  });

  it("strips only the axle's names, not some other character's", () => {
    // 圣华 is a plausible character name that is NOT in this axle — it stays.
    const chars0 = createDefaultState().characters;
    const s = state({
      characters: chars0.map((c, i) => (i === 0 ? { ...c, name: '月城最中' } : c)) as typeof chars0,
      turns: [turn('1', { frontActions: [fa(0, '圣华-火加攻'), fa(-1), fa(-1)] })],
    });
    expect(buildCharSkills(modelOf(s))[0].skills).toEqual(['圣华火加攻']);
  });
});

describe('skillKeys', () => {
  it('keeps 汉字 and Latin letters and drops everything else', () => {
    expect(skillKeys('Spot of Tea')).toEqual(['SpotofTea']);
    expect(skillKeys('破竹之势慈悲之刃２')).toEqual(['破竹之势慈悲之刃']);
    expect(skillKeys('胜利之弧-普加攻')).toEqual(['胜利之弧普加攻']);
  });

  it('strips a parenthesised suffix, ASCII or full-width', () => {
    expect(skillKeys('指挥(别改)')).toEqual(['指挥']);
    expect(skillKeys('指挥（别改）')).toEqual(['指挥']);
  });

  it('does not split on a plus inside parentheses', () => {
    // Parentheses come off first, so the plus is part of the suffix rather than
    // a skill separator.
    expect(skillKeys('技能A(1+2)')).toEqual(['技能A']);
  });

  it('splits on a plus anywhere else', () => {
    expect(skillKeys('技能A+技能B')).toEqual(['技能A', '技能B']);
    expect(skillKeys('技能A＋技能B')).toEqual(['技能A', '技能B']);
  });

  it('yields nothing for text with no 汉字/字母 to name it by', () => {
    expect(skillKeys('')).toEqual([]);
    expect(skillKeys('   ')).toEqual([]);
    expect(skillKeys('123')).toEqual([]);
    expect(skillKeys('+')).toEqual([]);
    // …and drops only the unnamed part, keeping the named one
    expect(skillKeys('技能A+')).toEqual(['技能A']);
  });

  it('keeps the written order of the skills in one slot', () => {
    expect(skillKeys('丙+甲+乙')).toEqual(['丙', '甲', '乙']);
  });

  it('drops everything from an arrow on', () => {
    // `->` is a "targets / leads to" annotation, never part of the name.
    expect(skillKeys('充能->月城最中')).toEqual(['充能']);
    expect(skillKeys('充能→月城最中')).toEqual(['充能']);
    // The whole tail goes, plus separating anything after it.
    expect(skillKeys('破竹之势->强化+心眼')).toEqual(['破竹之势']);
    // No arrow, no truncation.
    expect(skillKeys('破竹之势')).toEqual(['破竹之势']);
  });

  it('does not cut on an arrow inside parentheses', () => {
    // Parentheses come off first, so the arrow is inside a suffix being dropped
    // anyway and cannot end the name early.
    expect(skillKeys('技能A(1->2)')).toEqual(['技能A']);
  });

  it('strips the axle character names out of the skill text', () => {
    expect(skillKeys('圣华-热带大杂烩-火加攻', ['圣华'])).toEqual(['热带大杂烩火加攻']);
    expect(skillKeys('月城最中-破竹之势', ['月城最中'])).toEqual(['破竹之势']);
    // A name is not special-cased: it is only stripped where it appears.
    expect(skillKeys('破竹之势', ['圣华'])).toEqual(['破竹之势']);
  });

  it('strips the longest matching name first', () => {
    // `月` alone must not eat the `月` of `月歌`, or `月歌-大招` would come out
    // as `歌大招` instead of `大招`.
    expect(skillKeys('月歌-大招', ['月', '月歌'])).toEqual(['大招']);
  });

  it('drops a part that is nothing but a character name', () => {
    // Nothing left to name the skill by — a nameless entry is worse than none.
    expect(skillKeys('圣华', ['圣华'])).toEqual([]);
    expect(skillKeys('圣华+大招', ['圣华'])).toEqual(['大招']);
  });

  it('matches a character name whatever the case', () => {
    // The roster's Latin names are all-caps; nobody types them that way.
    expect(skillKeys('MONA-大招', ['Mona'])).toEqual(['大招']);
  });

  it('leaves the text alone when the axle has no names', () => {
    expect(skillKeys('圣华-火加攻')).toEqual(['圣华火加攻']);
    expect(skillKeys('圣华-火加攻', [])).toEqual(['圣华火加攻']);
    expect(skillKeys('圣华-火加攻', ['  '])).toEqual(['圣华火加攻']);
  });

  it('keeps a name out of the middle of a real skill name', () => {
    // 三乡 is a character AND a substring of nothing here — the point is that
    // only a whole written occurrence goes, not the characters scattered.
    expect(skillKeys('三乡-活力声援-普加攻', ['三乡'])).toEqual(['活力声援普加攻']);
    expect(skillKeys('活力声援-普加攻', ['三乡'])).toEqual(['活力声援普加攻']);
  });
});
