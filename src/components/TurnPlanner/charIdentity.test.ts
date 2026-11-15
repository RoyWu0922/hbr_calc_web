/**
 * 入场行换名：只改入场行那一行，下面一行都不动。
 *
 * 这条特性原来只做对了一半 —— 名字换来换去时下面每行的 `charIndex` 会被改成对面
 * 槽（前1-前3 里还是同一个人），但后1-后3 按槽位号排序、配色按槽位号取、SP 池
 * 留在原槽，于是「下面所有是 A 或 C 的都换了位置」。这里把三层都钉住：
 *
 *   1. `applyCharEdit` 的互换语义（名字、SP、身份序号一起走）；
 *   2. 详情表渲染出来的东西（前1-前3 的名字、后1-后3 的名字、后列的 SP）换名前
 *      后完全一致 —— 这正是用户看着表格说的「下面不想动」；
 *   3. 简轴模型里同一个人的配色不变。
 */
import { describe, expect, it } from 'vitest';
import { computeTurnPlanner, createDefaultState } from '../../engine/turnPlanner';
import type { ComputedTurnResult, FrontAction, PlannerTurn, TurnPlannerChar, TurnPlannerState } from '../../types';
import { applyCharEdit, charIdentity, ensureCharIds, swapCharRecords } from './charIdentity';
import { buildCharSkills, buildChartModel, charColor } from './rowChartModel';

// ─── Fixtures ─────────────────────────────────────────────────

function fa(charIndex: number, action = ''): FrontAction {
  return { charIndex, action, spCost: 0, spGain: 0, odGain: 0, dr: 0 };
}

function turn(roundLabel: string, actions: [number, number, number]): PlannerTurn {
  return {
    roundLabel,
    turnType: 'normal',
    frontActions: [fa(actions[0]), fa(actions[1]), fa(actions[2])],
    backSPGain: [0, 0, 0],
    jailOD: 0,
    passiveOD: 0,
    pursuitOD: 0,
    passiveDR: 0,
    bossDR: 0,
  };
}

/** A..F 六人，SP 各不相同，好认出 SP 池有没有跟着人走。 */
function chars(): TurnPlannerChar[] {
  return 'ABCDEF'.split('').map((name, i) => ({ name, sp: 10 + i, id: i }));
}

function state(): TurnPlannerState {
  return {
    ...createDefaultState(),
    characters: ensureCharIds(chars()) as TurnPlannerState['characters'],
    turns: [
      turn('1', [0, 2, 2]),   // A、C、C 出场
      turn('2', [2, 1, 3]),   // C、B、D
      turn('3', [0, -1, 4]),  // A、E
    ],
  };
}

/** 入场行把槽 i 的名字改成 name 之后的新 state（复刻 DetailTable.updateChar）。 */
function rename(s: TurnPlannerState, i: number, name: string): TurnPlannerState {
  const edit = applyCharEdit(s.characters, s.turns, i, { ...s.characters[i], name });
  return {
    ...s,
    characters: ensureCharIds(edit.characters) as TurnPlannerState['characters'],
    turns: edit.turns,
  };
}

// ─── 详情表的渲染结果（与 TurnPlanner.DetailTable 同一套推导）──

/** 前1-前3 每格显示的名字。 */
function frontNames(s: TurnPlannerState): string[][] {
  return s.turns.map(t => t.frontActions.map(a => (a.charIndex >= 0 ? s.characters[a.charIndex].name : '')));
}

/** 后1-后3 每格显示的名字：未出场的角色按身份序号排。 */
function backNames(s: TurnPlannerState): string[][] {
  return s.turns.map(t => {
    const front = new Set(t.frontActions.map(a => a.charIndex).filter(i => i >= 0));
    return [0, 1, 2, 3, 4, 5]
      .filter(i => !front.has(i))
      .sort((a, b) => charIdentity(s.characters, a) - charIdentity(s.characters, b))
      .slice(0, 3)
      .map(i => s.characters[i].name);
  });
}

/** 后列 SP 显示的是「上一回合结束时这个槽的 SP」，槽里坐的是谁要一起看。 */
function backSpByChar(s: TurnPlannerState, computed: ComputedTurnResult[]): Record<string, number>[] {
  return s.turns.map((t, ti) => {
    const prev = ti > 0 ? computed[ti - 1] : null;
    const front = new Set(t.frontActions.map(a => a.charIndex).filter(i => i >= 0));
    const out: Record<string, number> = {};
    [0, 1, 2, 3, 4, 5]
      .filter(i => !front.has(i))
      .sort((a, b) => charIdentity(s.characters, a) - charIdentity(s.characters, b))
      .slice(0, 3)
      .forEach(i => {
        out[s.characters[i].name] = prev?.sp[i] ?? s.characters[i].sp;
      });
    return out;
  });
}

/** 名字 → SP 的对照，用来验证 SP 池跟人走。 */
function spByName(s: TurnPlannerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of s.characters) out[c.name] = c.sp;
  return out;
}

// ─── ensureCharIds ────────────────────────────────────────────

describe('ensureCharIds', () => {
  it('老轴没有 id 时按槽位号补齐', () => {
    const bare: TurnPlannerChar[] = 'ABCDEF'.split('').map(name => ({ name, sp: 0 }));
    expect(ensureCharIds(bare).map(c => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('合法的 id 原样保留，返回同一个对象（不制造 re-render）', () => {
    const withIds = chars();
    const out = ensureCharIds(withIds);
    expect(out.map(c => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
    out.forEach((c, i) => expect(c).toBe(withIds[i]));
  });

  it('重复或越界的 id 按最小空闲号修掉', () => {
    const bad = chars();
    bad[1] = { ...bad[1], id: 0 };   // 撞车
    bad[2] = { ...bad[2], id: 99 };  // 越界
    expect(ensureCharIds(bad).map(c => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ─── applyCharEdit ────────────────────────────────────────────

describe('applyCharEdit', () => {
  it('把 A 的名字填成 C：两条记录整份对调，SP 和身份序号跟着人走', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    expect(next.characters.map(c => c.name)).toEqual(['C', 'B', 'A', 'D', 'E', 'F']);
    expect(next.characters.map(c => c.id)).toEqual([2, 1, 0, 3, 4, 5]);
    // SP 也跟着走了：C 带着自己的 12 现在坐在 0 号槽
    expect(spByName(next)).toEqual(spByName(s));
    expect(next.characters[0].sp).toBe(12);
  });

  it('下面每行的 charIndex 改到对面槽，前1-前3 里还是同一个人', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    expect(frontNames(next)).toEqual(frontNames(s));
    expect(frontNames(next)).toEqual([['A', 'C', 'C'], ['C', 'B', 'D'], ['A', '', 'E']]);
  });

  it('后1-后3 的名字和 SP 一列都不动', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    expect(backNames(next)).toEqual(backNames(s));
    expect(backNames(next)).toEqual([['B', 'D', 'E'], ['A', 'E', 'F'], ['B', 'C', 'D']]);
  });

  it('只改成一个没人用过的名字就只是改名，turns 保持同一个引用', () => {
    const s = state();
    const next = rename(s, 0, '月歌');
    expect(next.characters[0]).toMatchObject({ name: '月歌', id: 0 });
    expect(next.turns).toBe(s.turns);
  });

  it('清空名字不触发互换', () => {
    const s = state();
    const next = rename(s, 0, '');
    expect(next.turns).toBe(s.turns);
    expect(next.characters[0]).toMatchObject({ name: '', id: 0 });
  });

  it('对调两个后位角色同样只动入场行', () => {
    const s = state();
    const next = rename(s, 4, 'F');
    expect(next.characters.map(c => c.name)).toEqual(['A', 'B', 'C', 'D', 'F', 'E']);
    expect(frontNames(next)).toEqual(frontNames(s));
    expect(backNames(next)).toEqual(backNames(s));
  });
});

// ─── 简轴模型：同一个人的配色不变 ────────────────────────────

describe('简轴配色按身份序号', () => {
  it('换名前后，每个名字的色带颜色一样', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    const colorOf = (st: TurnPlannerState) => {
      const model = buildChartModel(st, []);
      const out: Record<string, string | undefined> = {};
      for (const lr of model.laneRows) out[lr.name] = charColor(lr.colorIndex);
      for (const row of model.rows) {
        if (row.kind !== 'turn') continue;
        for (const slot of row.slots) if (slot.name) out[slot.name] = charColor(slot.colorIndex);
      }
      return out;
    };
    expect(colorOf(next)).toEqual(colorOf(s));
    expect(colorOf(next).A).toBe(charColor(0));
  });

  it('泳道行与技能一览的顺序按身份序号，换名后不重排', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    expect(buildChartModel(next, []).laneRows.map(r => r.name))
      .toEqual(buildChartModel(s, []).laneRows.map(r => r.name));
    expect(buildCharSkills(buildChartModel(next, [])).map(r => r.name))
      .toEqual(buildCharSkills(buildChartModel(s, [])).map(r => r.name));
    // 手写技能表的键是身份序号，所以 A 的手写表还在 A 名下
    expect(buildCharSkills(buildChartModel(next, []))[0].colorIndex).toBe(0);
  });

  it('老轴（没有 id）的配色与顺序与改动前一致', () => {
    const bare = 'ABCDEF'.split('').map(name => ({ name, sp: 0 }));
    const st: TurnPlannerState = {
      ...createDefaultState(),
      characters: bare as unknown as TurnPlannerState['characters'],
    };
    const model = buildChartModel(st, []);
    expect(model.laneRows.map(r => r.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(model.laneRows.map(r => r.colorIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ─── 后列 SP 与计算引擎 ─────────────────────────────────────

describe('后列 SP', () => {
  it('换名后后列显示的 SP 数值与换名前一致（同一个人同一格）', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    expect(backSpByChar(next, computeTurnPlanner(next)))
      .toEqual(backSpByChar(s, computeTurnPlanner(s)));
  });

  it('计算引擎的结果不变：同一个人的 SP 曲线不因为换名而变', () => {
    const s = state();
    const next = rename(s, 0, 'C');
    const before = computeTurnPlanner(s);
    const after = computeTurnPlanner(next);
    // 每回合每个姓名对应的 SP 一样
    const spByChar = (st: TurnPlannerState, computed: ComputedTurnResult[]) =>
      computed.map(r => {
        const out: Record<string, number> = {};
        st.characters.forEach((c, i) => { out[c.name] = r.sp[i]; });
        return out;
      });
    expect(spByChar(next, after)).toEqual(spByChar(s, before));
  });
});

// ─── swapCharRecords ─────────────────────────────────────────

describe('swapCharRecords', () => {
  it('整条对调，不改原数组', () => {
    const c = chars();
    const out = swapCharRecords(c, 0, 2);
    expect(out.map(x => x.name)).toEqual(['C', 'B', 'A', 'D', 'E', 'F']);
    expect(c.map(x => x.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
