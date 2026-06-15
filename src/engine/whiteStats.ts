import {
  CharGrowth, Bonus6, BIAS_TYPES, BADGE_BONUS, WEAPON_BONUS,
  CHAR_GROWTH, AS_BONUSES, SS_BONUSES, EQUIP_PRESETS,
} from './whiteStatsData';

// ─── Input ─────────────────────────────────────────────────────
export interface WhiteStatsInput {
  shortId: string;          // 角色 ID 后两位 (e.g. "02")
  level: number;            // 等级 (default 200)
  badgeLevel: number;       // 徽章等级 1-15 (default 13)
  rebirth: number;          // 转生次数 (default 20)
  biasType: number;         // 强化偏向 1=力体 2=器运 3=智精 4=力器 (default 1)
  breakLevel: number;       // 突破等级 0-6 (default 5)
  missingPower: number;     // 缺失力体型SS数
  missingDex: number;       // 缺失器运型SS数
  missingSpr: number;       // 缺失智精型SS数
  missingPowerDex: number;  // 缺失力器型SS数
  baseFix: Bonus6;          // 基础值修正行 (D21-I21)
  equipPreset: string;      // 配装预设名称 ("" = none)
  weaponLevel: number;      // 专武+值 0-5 (default 5)
  resonance: number;        // 共鸣加成 (default 0)
  support: Bonus6;          // 支援加成 6维 (default 0)
  scoreBuff: number;        // 打分buff 0/15/30 (default 0)
  totalFix: Bonus6;         // 合计值修正行 (D37-I37)
  necklaceLuck: number;     // 坠链运气加成 0 or 48 (default 0)
}

export const DEFAULT_INPUT: WhiteStatsInput = {
  shortId: '02',
  level: 200,
  badgeLevel: 13,
  rebirth: 20,
  biasType: 1,
  breakLevel: 5,
  missingPower: 0,
  missingDex: 0,
  missingSpr: 0,
  missingPowerDex: 0,
  baseFix: { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 },
  equipPreset: '[对HP+]最优配装',
  weaponLevel: 5,
  resonance: 0,
  support: { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 },
  scoreBuff: 0,
  totalFix: { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 },
  necklaceLuck: 0,
};

// ─── Output ────────────────────────────────────────────────────
export interface WhiteStatsOutput {
  growth: CharGrowth;
  asBonus: Bonus6;
  ssBonus: Bonus6;
  equipBonus: Bonus6;
  biasMultipliers: Bonus6;
  biasFlats: Bonus6;
  baseStats: Bonus6;       // Output1
  totalStats: Bonus6;      // Output2
  resonanceEff: Bonus6;    // Output3-共鸣有效值: ceil(不含配装专武共鸣 / 10)
  hpEff: number;           // HP偏有效值
  dpEff: number;           // DP偏有效值
  neutralEff: number;      // 无偏有效值
  defDownEff: number;      // 减防有效值
  vulnEff: number;         // 脆弱有效值
}

// ─── Calculation ───────────────────────────────────────────────
const ZERO_BONUS: Bonus6 = { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 };

export function calcWhiteStats(input: WhiteStatsInput): WhiteStatsOutput {
  const growth = CHAR_GROWTH.find(c => c.shortId === input.shortId) || CHAR_GROWTH[0];
  const asBonus = AS_BONUSES[input.shortId] || ZERO_BONUS;
  const ssBonus = SS_BONUSES[input.shortId] || ZERO_BONUS;

  const bias = BIAS_TYPES.find(b => b.id === input.biasType) || BIAS_TYPES[0];
  const badgeBonus = BADGE_BONUS[input.badgeLevel] || 0;
  const weaponBonus = WEAPON_BONUS[input.weaponLevel] || 0;

  // Equipment preset
  const equip = EQUIP_PRESETS.find(p => p.name === input.equipPreset);
  const equipBonus = equip || ZERO_BONUS;
  const isNaked = input.equipPreset === '裸装' || !input.equipPreset;

  const lf = (input.level - 1) / 199;

  // ── Output1: Base Stats (D23-I23) ──────────────────────────
  const baseStats: Bonus6 = {
    pow: Math.round((growth.maxPow - growth.minPow) * lf) + growth.minPow + asBonus.pow + ssBonus.pow
      - 3 * input.missingPower - 3 * input.missingSpr + badgeBonus + input.rebirth + input.baseFix.pow,
    dex: Math.round((growth.maxDex - growth.minDex) * lf) + growth.minDex + asBonus.dex + ssBonus.dex
      - 3 * input.missingDex - 2 * input.missingSpr + badgeBonus + input.rebirth + input.baseFix.dex,
    tough: Math.round((growth.maxTough - growth.minTough) * lf) + growth.minTough + asBonus.tough + ssBonus.tough
      - 2 * input.missingPower + badgeBonus + input.rebirth + input.baseFix.tough,
    spr: Math.round((growth.maxSpr - growth.minSpr) * lf) + growth.minSpr + asBonus.spr + ssBonus.spr
      - 2 * input.missingSpr + badgeBonus + input.rebirth + input.baseFix.spr,
    wis: Math.round((growth.maxWis - growth.minWis) * lf) + growth.minWis + asBonus.wis + ssBonus.wis
      - 3 * input.missingSpr + badgeBonus + input.rebirth + input.baseFix.wis,
    luck: Math.round((growth.maxLuck - growth.minLuck) * lf) + growth.minLuck + asBonus.luck + ssBonus.luck
      - 2 * input.missingDex + badgeBonus + input.rebirth + input.baseFix.luck,
  };

  // Helper: compute a single total stat (excluding equip/weapon/resonance for resonanceEff)
  function totalForStat(
    base: number, mult: number, flat: number,
    equip: number, support: number,
  ) {
    const scaled = Math.ceil(base * (1 + mult + 0.1 * input.breakLevel)) + flat;
    return {
      withGear: scaled + input.resonance + support + equip
        + (isNaked ? 0 : weaponBonus) + input.scoreBuff,
      noGear: scaled,
    };
  }

  const tp = totalForStat(baseStats.pow, bias.multipliers.pow, bias.flats.pow, equipBonus.pow, input.support.pow);
  const td = totalForStat(baseStats.dex, bias.multipliers.dex, bias.flats.dex, equipBonus.dex, input.support.dex);
  const tt = totalForStat(baseStats.tough, bias.multipliers.tough, bias.flats.tough, equipBonus.tough, input.support.tough);
  const ts = totalForStat(baseStats.spr, bias.multipliers.spr, bias.flats.spr, equipBonus.spr, input.support.spr);
  const tw = totalForStat(baseStats.wis, bias.multipliers.wis, bias.flats.wis, equipBonus.wis, input.support.wis);
  const tl = totalForStat(baseStats.luck, bias.multipliers.luck, bias.flats.luck, equipBonus.luck, input.support.luck);

  // ── Output2: Total Stats (D40-I40) ──────────────────────────
  const totalStats: Bonus6 = {
    pow: tp.withGear + input.totalFix.pow,
    dex: td.withGear + input.totalFix.dex,
    tough: tt.withGear + input.totalFix.tough,
    spr: ts.withGear + input.totalFix.spr,
    wis: tw.withGear + input.totalFix.wis,
    luck: tl.withGear + input.totalFix.luck + (isNaked ? 0 : input.necklaceLuck - 48),
  };

  // ── Output3-共鸣有效值: ceil(不含配装/专武/共鸣/修正 / 10) ─
  const resonanceEff: Bonus6 = {
    pow: Math.ceil(tp.noGear / 10),
    dex: Math.ceil(td.noGear / 10),
    tough: Math.ceil(tt.noGear / 10),
    spr: Math.ceil(ts.noGear / 10),
    wis: Math.ceil(tw.noGear / 10),
    luck: Math.ceil(tl.noGear / 10),
  };

  // ── Output3: Effective Values (D42-I45) ────────────────────
  const hpEff = (totalStats.pow * 2 + totalStats.dex) / 3;
  const dpEff = (totalStats.dex * 2 + totalStats.pow) / 3;
  const neutralEff = totalStats.pow * 0.5 + totalStats.dex * 0.5;
  const defDownEff = (totalStats.wis * 2 + totalStats.luck) / 3;
  const vulnEff = (totalStats.luck * 2 + totalStats.wis) / 3;

  return {
    growth, asBonus, ssBonus, equipBonus,
    biasMultipliers: bias.multipliers,
    biasFlats: bias.flats,
    baseStats, totalStats, resonanceEff,
    hpEff, dpEff, neutralEff, defDownEff, vulnEff,
  };
}
