/**
 * 角色身份 —— 槽位之外的那个「是谁」。
 *
 * 排轴的 `characters` 是 6 个固定槽，`turns[].frontActions[].charIndex` 存的是
 * 槽位号。入场行把 A、C 换个名字时，如果只换名字，下面就全跟着搬：前1-前3 里的
 * 角色变了，后1-后3 按槽位号排序也跟着重排，配色（按槽位取 --char-N）互换，
 * SP 池留在原槽。用户想要的只是入场行那一行的顺序变，下面一行都别动。
 *
 * 所以每个角色带一个 `id`（0-5，身份序号，不随槽位走）：
 *   - id 跟着名字走 —— 换名互换时它连同 name、sp 一起换到对面槽；
 *   - 后1-后3 的排序按 id，不按槽位，于是换名前后顺序一致；
 *   - 配色与技能一览的键按 id，于是同一个人的颜色和手写技能表都不动。
 *
 * 老轴没有这个字段：`ensureCharIds` 把缺的、重复的 id 按槽位号补齐，老数据的行为
 * 与改动前完全一致。
 */
import type { PlannerTurn, TurnPlannerChar } from '../../types';

const isSlotId = (v: unknown, n: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;

/**
 * 每个槽都拿到一个唯一的身份序号。
 *
 * 已经是合法且不重复的 id 原样保留（返回的也是原对象，不制造无谓的 re-render），
 * 缺的、越界的、跟前面撞车的按最小空闲号补。
 */
export function ensureCharIds<T extends TurnPlannerChar>(characters: readonly T[]): T[] {
  const n = characters.length;
  const kept: (number | undefined)[] = characters.map(() => undefined);
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const id = characters[i].id;
    if (isSlotId(id, n) && !used.has(id)) {
      kept[i] = id;
      used.add(id);
    }
  }
  const free: number[] = [];
  for (let id = 0; id < n; id++) if (!used.has(id)) free.push(id);

  return characters.map((c, i) => {
    const id = kept[i] ?? free.shift() ?? i;
    return c.id === id ? c : { ...c, id };
  });
}

/** 槽位 ci 的身份序号；越界或没有 characters 时退回 ci 本身。 */
export function charIdentity(characters: readonly TurnPlannerChar[], ci: number): number {
  const id = characters[ci]?.id;
  return isSlotId(id, characters.length) ? id : ci;
}

/** 两个槽整条对调（name、sp、id 一起走），返回新数组。 */
export function swapCharRecords<T extends TurnPlannerChar>(characters: readonly T[], i: number, j: number): T[] {
  const next = [...characters];
  const a = next[i];
  next[i] = next[j];
  next[j] = a;
  return next;
}

/**
 * 入场行改了第 i 个槽之后的 state 片段。
 *
 * 新名字撞上另一个槽的名字（把 A、C 填成对方的名字）就算「互换」：两条记录整份
 * 对调 —— 名字、SP、身份序号一起走 —— 再把下面每行的 `charIndex` 改到对面槽，
 * 于是前1-前3 里坐的还是同一个人。后1-后3 的顺序、配色、技能一览都按身份序号取，
 * 谁也不动。
 *
 * 只改成一个没人用过的名字就只是改名：`turns` 原样返回（还是同一个引用，调用方
 * 的 memo 不会白跑）。
 */
export function applyCharEdit(
  characters: readonly TurnPlannerChar[],
  turns: readonly PlannerTurn[],
  i: number,
  patch: TurnPlannerChar,
): { characters: TurnPlannerChar[]; turns: PlannerTurn[] } {
  const oldName = characters[i].name;
  const newName = patch.name;

  const otherIdx = newName && newName !== oldName
    ? characters.findIndex((c, idx) => idx !== i && c.name === newName)
    : -1;

  // 只改名 / 改 SP：patch 落回原槽，turns 原样返回（同一个引用）。
  if (otherIdx < 0) {
    const next = [...characters];
    next[i] = patch;
    return { characters: next, turns: turns as PlannerTurn[] };
  }

  // 互换：对调的是两条【原有】记录，不是 patch。patch 只用来表达「这个名字是别人
  // 的名字」这个意图 —— 它本身已经是对方的名字，拿去填对面槽会让两个人同名。
  return {
    characters: swapCharRecords(characters, i, otherIdx),
    turns: turns.map(t => ({
      ...t,
      frontActions: t.frontActions.map(fa => {
        if (fa.charIndex === otherIdx) return { ...fa, charIndex: i };
        if (fa.charIndex === i) return { ...fa, charIndex: otherIdx };
        return fa;
      }) as PlannerTurn['frontActions'],
    })),
  };
}
