import { describe, it, expect } from 'vitest';
import { calcWhiteStats, DEFAULT_INPUT } from './whiteStats';
import { EQUIP_PRESETS, LEGACY_EQUIP_NAMES, WEAPON_BONUS } from './whiteStatsData';

// 专武加成按 WEAPON_BONUS[level] 直接相加（0 级也有 +5，这是有意的：0~5 → 5/9/13/17/21/25）。
// 配装值本身不含专武，两者相加才等于顶配计算器那份（含专武）的数字。
const mk = (equipPreset: string, weaponLevel = 0) =>
  calcWhiteStats({
    ...DEFAULT_INPUT, shortId: '02', equipPreset, weaponLevel,
    support: { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 },
  });
const F = ['pow', 'dex', 'tough', 'spr', 'wis', 'luck'] as const;
const sum6 = (o: { pow: number; dex: number; tough: number; spr: number; wis: number; luck: number }) =>
  o.pow + o.dex + o.tough + o.spr + o.wis + o.luck;

describe('装备预设同步（V2.3）', () => {
  it('13 套，且带上了恒星吊饰说明', () => {
    expect(EQUIP_PRESETS).toHaveLength(13);
    expect(EQUIP_PRESETS.some(p => p.name === '减防最优（红晶片、智力恒星吊饰）')).toBe(true);
    expect(EQUIP_PRESETS.some(p => p.name === '运气依存（红智力晶片、智力恒星吊饰）')).toBe(true);
  });

  it('每一套都能算出结果，配装加成非零（裸装除外）', () => {
    for (const p of EQUIP_PRESETS) {
      const r = mk(p.name);
      expect(r, p.name).toBeTruthy();
      const s = sum6(r.equipBonus);
      if (p.name === '裸装') expect(s, '裸装应为 0').toBe(0);
      else expect(s, p.name + ' 的配装加成不应为 0').toBeGreaterThan(0);
    }
  });

  it('配装加成如实进入总白值（差额 = 预设值 + 专武；luck 另有坠链规则）', () => {
    const naked = mk('裸装');
    const p = EQUIP_PRESETS.find(x => x.name.startsWith('减防最优（红晶片'))!;
    const geared = mk(p.name);
    // 裸装时 isNaked 会短路两处：专武加成、以及 (necklaceLuck - 48)。
    // DEFAULT_INPUT.necklaceLuck = 0，所以非裸装时 luck 实际少 48。
    const luckAdjust = DEFAULT_INPUT.necklaceLuck - 48;
    for (const k of F) {
      const expected = p[k] + WEAPON_BONUS[0] + (k === 'luck' ? luckAdjust : 0);
      expect(geared.totalStats[k] - naked.totalStats[k], k).toBe(expected);
    }
  });

  it('旧名字经映射命中，结果与新名字完全一致', () => {
    const legacy = '[对HP+]最优配装';
    expect(LEGACY_EQUIP_NAMES[legacy]).toBe('[对HP+]/力量依存最优配装（力量恒星吊饰）');
    expect(mk(legacy).totalStats).toEqual(mk(LEGACY_EQUIP_NAMES[legacy]).totalStats);
  });

  it('旧名字不再静默退化成裸装', () => {
    expect(mk('减防最优配装').totalStats).not.toEqual(mk('裸装').totalStats);
  });

  it('每条旧名都有映射目标，且目标真实存在', () => {
    const names = new Set(EQUIP_PRESETS.map(p => p.name));
    for (const [oldName, newName] of Object.entries(LEGACY_EQUIP_NAMES)) {
      expect(names.has(newName), oldName + ' → ' + newName + ' 不存在').toBe(true);
    }
  });

  it('配装值 = 顶配表减 25（专武 +5 另计）', () => {
    const p = EQUIP_PRESETS.find(x => x.name.startsWith('减防最优（红晶片'))!;
    expect([p.pow, p.dex, p.tough, p.spr, p.wis, p.luck]).toEqual([109, 96, 99, 99, 210, 102]);
  });

  it('专武档位的差值符合 WEAPON_BONUS（5→9→…→25）', () => {
    const deg = (lvl: number) => mk('减防最优（红晶片、智力恒星吊饰）', lvl);
    for (let lvl = 1; lvl <= 5; lvl++) {
      const delta = deg(lvl).totalStats.pow - deg(lvl - 1).totalStats.pow;
      expect(delta, `+${lvl - 1} → +${lvl}`).toBe(WEAPON_BONUS[lvl] - WEAPON_BONUS[lvl - 1]);
    }
  });

  it('默认输入指向一个真实存在的配装', () => {
    expect(EQUIP_PRESETS.some(p => p.name === DEFAULT_INPUT.equipPreset)).toBe(true);
  });

  it('13 套里没有重名（重名会让下拉选中错项）', () => {
    expect(new Set(EQUIP_PRESETS.map(p => p.name)).size).toBe(EQUIP_PRESETS.length);
  });
});
