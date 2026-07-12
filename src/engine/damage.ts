import {
  SkillInput, Stats, BuffSkill, DebuffSkill, WeaknessSkill,
  Equipment, BonusArea, ODParams, BreakParams, BreakResult, BreakHitDetail,
  ScoreParams,
  DamageResultData, DamageInput,
} from '../types';
import { BUFF_SKILLS, DEBUFF_SKILLS, WEAKNESS_SKILLS, getScoreData, getTurnCoeff } from './skillDb';

// ─── Helpers ─────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function roundDown(v: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.floor(v * factor) / factor;
}

// ─── Skill Power Calculation ─────────────────────────────────
export function calcSkillPower(skill: SkillInput): {
  minPower: number; maxPower: number; currentPower: number;
  orbPower: number; overDiffPower: number; skillPower: number; multiplier: number;
} {
  const { skillLevel, deviation, token, special, orb, baseDiff, whiteBonus,
    currentWeighted, enemyAttr, maxPower: inputMaxPower, isCrit } = skill;

  // Max power (user-provided, default 17085)
  const maxPower = inputMaxPower || 0;
  const minPower = maxPower / 2;

  // Scale by skill level
  const minScaled = minPower * (1 + 0.05 * (skillLevel - 1));
  const maxScaled = maxPower * (1 + 0.02 * (skillLevel - 1));

  // Effective stat diff
  const critBonus = isCrit ? 50 : 0;
  const effectiveDiff = currentWeighted + whiteBonus + critBonus - baseDiff - enemyAttr;

  // Current power (G10 formula)
  let currentPower: number;
  if (effectiveDiff >= 0) {
    currentPower = maxScaled;
  } else if (currentWeighted + whiteBonus + critBonus - enemyAttr >= 0) {
    const ratio = (currentWeighted + whiteBonus + critBonus - enemyAttr) / baseDiff;
    currentPower = minScaled + (maxScaled - minScaled) * ratio;
  } else if (currentWeighted + whiteBonus + critBonus - enemyAttr + baseDiff >= 0) {
    const ratio = (currentWeighted + whiteBonus + critBonus - enemyAttr + baseDiff) / baseDiff;
    currentPower = ratio * (minScaled - 1) + 1;
  } else {
    currentPower = 1;
  }

  // Orb power (I10 formula)
  let orbPower: number;
  const orbThreshold = orb * 20;
  if (effectiveDiff >= orbThreshold) {
    orbPower = maxPower * 0.02 * orb;
  } else if (currentWeighted + whiteBonus + critBonus - enemyAttr >= 0) {
    const ratio = (currentWeighted + whiteBonus + critBonus - enemyAttr) / (orbThreshold + baseDiff);
    orbPower = ratio * (maxPower - minPower) * 0.02 * orb + minPower * 0.02 * orb;
  } else if (currentWeighted + whiteBonus + critBonus + baseDiff - enemyAttr + orbThreshold >= 0) {
    const ratio = (currentWeighted + whiteBonus + critBonus + baseDiff - enemyAttr + orbThreshold) / (baseDiff + orbThreshold);
    orbPower = ratio * minPower * 0.02 * orb;
  } else {
    orbPower = 1;
  }

  // Over-difference power (J10 formula)
  let overDiffPower = 0;
  if (effectiveDiff > 0) {
    overDiffPower = currentPower * 25 / 10000 * effectiveDiff;
  }

  const skillPower = currentPower + orbPower + overDiffPower;
  const multiplier = skillPower * deviation * token * special;

  return { minPower: minScaled, maxPower: maxScaled, currentPower, orbPower, overDiffPower, skillPower, multiplier };
}

// ─── Stat Deviations ─────────────────────────────────────────
export function calcDeviations(stats: Stats, skill: SkillInput) {
  const { str, spr, int: int_, luk } = stats;
  // Using the same stat values for all rows (简化: 使用相同基础值)
  const hpDev = (str * 2 + spr) / 3;
  const dpDev = (spr * 2 + str) / 3;
  const intDev = (int_ * 2 + luk) / 3;
  const lukDev = (luk * 2 + int_) / 3;
  return { hpDeviation: hpDev, dpDeviation: dpDev, intDeviation: intDev, lukDeviation: lukDev };
}

// ─── Buff Power Calculation ──────────────────────────────────

interface BuffPowerDetail {
  basePower: number;
  orbPower: number;
  overDiffPower: number;
  finalPower: number;
}

/**
 * 主动加攻威力（详细版）— 返回 base/orb/overDiff/final 四项拆解
 */
export function calcBuffPowerDetail(buff: BuffSkill): BuffPowerDetail {
  const { maxPower, border, orb, currentAttr, moraleFighting, skillLevel, passive, layers } = buff;
  const combinedAttr = currentAttr + moraleFighting;
  const skillScale = 0.98 + 0.02 * skillLevel;
  const mul = (passive || 1) * (layers ?? 1);

  // Base power (三区段 — attr=0 视为满属性向后兼容)
  let basePower: number;
  if (combinedAttr > border) {
    basePower = maxPower * skillScale;
  } else if (combinedAttr > 0) {
    basePower = (combinedAttr / border) * maxPower * skillScale;
  } else {
    basePower = maxPower * skillScale;
  }

  // Orb power (指挥宝珠默认吃满)
  let orbPower: number;
  if (buff.name === '指挥(别改)') {
    orbPower = maxPower * orb * 0.04;
  } else if (combinedAttr > 0 && combinedAttr - 100 <= border) {
    orbPower = (combinedAttr / (border + 100)) * maxPower * orb * 0.04;
  } else {
    orbPower = maxPower * orb * 0.04;
  }

  // Over-diff power (指挥无超差倍率)
  let overDiffPower = 0;
  if (buff.name !== '指挥(别改)' && combinedAttr > border) {
    overDiffPower = (combinedAttr - border) * (1+skillLevel*0.02-0.02) * maxPower * 2 / 10000;
  }

  return {
    basePower: basePower * mul,
    orbPower: orbPower * mul,
    overDiffPower: overDiffPower * mul,
    finalPower: (basePower + orbPower + overDiffPower) * mul,
  };
}

export function calcBuffPower(buff: BuffSkill): number {
  return calcBuffPowerDetail(buff).finalPower;
}

export function calcBuffTotal(buffs: BuffSkill[]): number {
  return buffs.reduce((sum, b) => sum + calcBuffPower(b), 0);
}

// ─── Debuff Power Calculation ────────────────────────────────
interface DebuffPowerDetail {
  basePower: number;
  orbPower: number;
  overDiffPower: number;
  finalPower: number;
}

/**
 * 降防/弱点威力（详细版）— 返回 base/orb/overDiff/final 四项拆解
 */
export function calcDebuffPowerDetail(debuff: DebuffSkill, enemyAttr: number): DebuffPowerDetail {
  const { maxPower, minPower, border, orb, currentAttr, moraleDebuffs, skillLevel, passive, layers } = debuff;
  const combinedAttr = currentAttr + moraleDebuffs;
  const mul = (passive || 1) * (layers ?? 1);

  // Base power
  let basePower: number;
  if (combinedAttr - enemyAttr <= 0) {
    basePower = minPower * (0.95 + skillLevel * 0.05);
  } else if (combinedAttr - enemyAttr <= border) {
    const ratio = (combinedAttr - enemyAttr) / border;
    basePower = ratio * (maxPower * (0.98 + skillLevel * 0.02) - minPower * (0.95 + skillLevel * 0.05))
      + minPower * (0.95 + skillLevel * 0.05);
  } else {
    basePower = maxPower * (0.98 + skillLevel * 0.02);
  }

  // Orb power
  let orbPower: number;
  if (combinedAttr - enemyAttr <= 0) {
    orbPower = minPower * orb * 0.02;
  } else if (combinedAttr - enemyAttr - 100 <= border) {
    const ratio = (combinedAttr - enemyAttr) / (border + 100);
    orbPower = ratio * (maxPower - minPower) * orb * 0.02 + minPower * orb * 0.02;
  } else {
    orbPower = maxPower * 0.02 * orb;
  }

  // Over-diff power
  let overDiffPower = 0;
  if (combinedAttr - enemyAttr > border) {
    overDiffPower = (combinedAttr - enemyAttr - border) * (0.98 + 0.02 * skillLevel) * maxPower * 10 / 10000;
  }

  return {
    basePower: basePower * mul,
    orbPower: orbPower * mul,
    overDiffPower: overDiffPower * mul,
    finalPower: (basePower + orbPower + overDiffPower) * mul,
  };
}

export function calcDebuffPower(debuff: DebuffSkill, enemyAttr: number): number {
  return calcDebuffPowerDetail(debuff, enemyAttr).finalPower;
}

export function calcDebuffTotal(debuffs: DebuffSkill[], enemyAttr: number): number {
  return debuffs.reduce((sum, d) => sum + calcDebuffPower(d, enemyAttr), 0);
}

// ─── Weakness Power Calculation (same formula as debuff) ─────
export function calcWeaknessPower(w: WeaknessSkill, enemyAttr: number): number {
  return calcDebuffPower(w, enemyAttr);
}

export function calcWeaknessTotal(weaknesses: WeaknessSkill[], enemyAttr: number): number {
  return weaknesses.reduce((sum, w) => sum + calcWeaknessPower(w, enemyAttr), 0);
}

// ─── Equipment ───────────────────────────────────────────────
export function calcEquipmentBonus(eq: Equipment, hitCount: number): number {
  let bonus = 0;
  if (eq.ring) bonus += 10;
  if (eq.silverNecklace) bonus += 10;
  if (eq.hpEarring) {
    bonus += Math.max(0, 15 - hitCount * 10 / 9 + 10 / 9);
  }
  return bonus;
}

// ─── Crit Damage ─────────────────────────────────────────────
export function calcCritDamage(bonus: BonusArea, isCrit: boolean): number {
  let dmg = bonus.critDmgBase;
  if (isCrit) dmg += bonus.critDmgBonus;
  // Add extra crit entries
  dmg += bonus.critDmgExtraEntries.reduce((sum, e) => sum + e.value, 0);
  return dmg;
}

export function calcPassiveAtkSum(bonus: BonusArea): number {
  return bonus.passiveAtkEntries.reduce((sum, e) => sum + e.value, 0);
}

export function calcPassiveDefSum(bonus: BonusArea): number {
  return bonus.passiveDefEntries.reduce((sum, e) => sum + e.value, 0);
}

// ─── OD Calculation ──────────────────────────────────────────
export function calcOD(params: ODParams): { odPercent: number; odHit: number; earringActualCoeff: number } {
  const { origHit, addHit, fixedOD, earringCoeff } = params;

  // Earring actual coefficient (AD formula)
  let earringActual: number;
  if (origHit > 9) {
    earringActual = earringCoeff;
  } else if (origHit === 0) {
    earringActual = 5;
  } else if (earringCoeff === 0) {
    earringActual = 0;
  } else {
    earringActual = ((origHit - 1) / 9 * (earringCoeff - 5) + 5);
  }
  earringActual = earringActual / 100 + 1;

  // OD% (AE formula)
  const odPercent = roundDown(fixedOD * earringActual, 2)
    + (origHit + addHit) * roundDown(earringActual * 2.5, 2);

  // OD hit (AF formula)
  const odHit = odPercent * 0.4;

  return { odPercent, odHit, earringActualCoeff: earringActual };
}

// ─── Break / DR Calculation (dmg calc.xlsx method) ──────────

/**
 * 破坏计算（基于 dmg calc.xlsx）
 *
 * Spreadsheet reference:
 *   K (DR增量): IF(无效,0, IF(本体,skillDR/origHits, skillDR*J) * enemyDR * drMultiplier)
 *   L (累计DR): IF(无效,prevL, IF(maxDR blank, prevL+K, MIN(maxDR, prevL+K)))
 *   M (实际伤害): IF(无效,0, L*J)
 *   E15 (理论DR增量): skillDR * (1+ΣchainMult) * drMultiplier  (不含enemyDR)
 *   E16 (理论破坏率增量): E15 * enemyDR
 *   E17 (实际最终破坏率): MIN(maxDR, initDR + E16)
 *   E18 (平均破坏率): SUM(M) / (1+ΣchainMult)
 */
export function calcBreakDetail(params: BreakParams): BreakResult {
  const {
    skillDR, enemyDR, origHits,
    earring, necklace, otherDR,
    superChain, bigChain, midChain, smallChain,
    maxDR, initDR: initDRRaw, dists,
  } = params;

  const initDR = initDRRaw ?? 1;

  // Guard: no meaningful computation when no original hits
  if (origHits <= 0) {
    return {
      theoreticalDRInc: 0, theoreticalBreakInc: 0,
      actualFinalDR: initDR, averageDR: 0, weightedBreak: 0,
      drMultiplier: 1, earringBonus: 0,
      totalHits: 0, totalChainMult: 0,
      hitDetails: [],
    };
  }

  // Earring bonus (spreadsheet: IF(B5=0,0, IF(B4>=10,0.15, 0.05+(B4-1)*(0.15-0.05)/9)))
  let earringBonus = 0;
  if (earring) {
    if (origHits >= 10) earringBonus = 0.15;
    else if (origHits > 0) earringBonus = 0.05 + (origHits - 1) * (0.15 - 0.05) / 9;
  }

  // Per-hit K column uses ROUND(earringBonus, 3); summary E15 uses unrounded
  const earringBonusRounded = Math.round(earringBonus * 1000) / 1000;

  // Necklace bonus (spreadsheet: IF(B6=0,0,0.1))
  const necklaceBonus = necklace ? 0.1 : 0;

  // DR multiplier for summary (E15) uses unrounded earringBonus
  const drMultiplierSummary = 1 + earringBonus + necklaceBonus + otherDR;
  // DR multiplier for per-hit K column uses ROUND(earringBonus, 3)
  const drMultiplier = 1 + earringBonusRounded + necklaceBonus + otherDR;

  // Total chain multiplier sum for summary formulas
  const totalChainMult = superChain * 0.5 + bigChain * 0.25 + midChain * 0.12 + smallChain * 0.06;
  const totalHits = origHits + superChain + bigChain + midChain + smallChain;

  const hitDetails: BreakHitDetail[] = [];
  let cumulativeDR = initDR;
  let weightedBreak = 0;

  for (let h = 1; h <= totalHits; h++) {
    // Determine hit type (spreadsheet I column)
    let type: BreakHitDetail['type'];
    let mult: number;

    if (h <= origHits) {
      type = '本体';
      mult = dists[h - 1] ?? 0.05;
    } else if (h <= origHits + superChain) {
      type = '连击';
      mult = 0.5;
    } else if (h <= origHits + superChain + bigChain) {
      type = '连击';
      mult = 0.25;
    } else if (h <= origHits + superChain + bigChain + midChain) {
      type = '连击';
      mult = 0.12;
    } else if (h <= origHits + superChain + bigChain + midChain + smallChain) {
      type = '连击';
      mult = 0.06;
    } else {
      type = '无效';
      mult = 0;
    }

    // DR increment (spreadsheet K column — uses ROUNDed earringBonus)
    let drInc: number;
    if (type === '无效') {
      drInc = 0;
    } else if (type === '本体') {
      drInc = (skillDR / origHits) * enemyDR/100 * drMultiplier;
    } else {
      drInc = skillDR * mult * enemyDR/100 * drMultiplier;
    }

    // Damage = DR_BEFORE_increment × mult (spreadsheet: M = L * J)
    const dmg = cumulativeDR * mult;

    // Advance cumulative DR (spreadsheet L column)
    if (type !== '无效') {
      if (maxDR === undefined) {
        cumulativeDR = cumulativeDR + drInc;
      } else {
        cumulativeDR = Math.min(maxDR, cumulativeDR + drInc);
      }
    }

    weightedBreak += dmg;

    hitDetails.push({ hit: h, type, mult, drInc, cumDR: cumulativeDR, dmg });
  }

  // Summary calculations (spreadsheet E15-E18)
  // E15: 理论DR增量 = skillDR * (1+ΣchainMult) * drMultiplier  (不含enemyDR, unrounded earringBonus)
  const theoreticalDRInc = skillDR * (1 + totalChainMult) * drMultiplierSummary;

  // E16: 理论破坏率增量 = E15 * enemyDR / 100
  const theoreticalBreakInc = theoreticalDRInc * enemyDR / 100;

  // E17: 实际最终破坏率 = IF(maxDR blank, initDR+E16, MIN(maxDR, initDR+E16))
  const actualFinalDR = maxDR === undefined
    ? initDR + theoreticalBreakInc
    : Math.min(maxDR, initDR + theoreticalBreakInc);

  // E18: 平均破坏率 = SUM(M) / (1 + ΣchainMult)
  const averageDR = weightedBreak / (1 + totalChainMult);

  return {
    theoreticalDRInc,
    theoreticalBreakInc,
    actualFinalDR,
    averageDR,
    weightedBreak,
    drMultiplier: drMultiplierSummary,
    earringBonus,
    totalHits,
    totalChainMult,
    hitDetails,
  };
}

/**
 * 简化版：只返回加权破坏（用于 damage calc 总入口）
 */
export function calcWeightedBreak(params: BreakParams): number {
  return calcBreakDetail(params).weightedBreak;
}

// ─── Attenuation ─────────────────────────────────────────────
/**
 * 伤害衰减：超过阈值后对数软上限，不突破 20e
 *   伤害 ≤ 10e → 原样返回
 *   伤害 > 10e → 20e - exp(0.7 - 0.7 * 伤害/10e) * 10e，上限硬钳 20e
 */
const ATTEN_THRESHOLD = 10_000_000_00;  
const ATTEN_CAP = 20_000_000_00;         

export function applyAttenuation(damage: number, float = 1): number {
  if (damage > ATTEN_THRESHOLD) {
    const result = ATTEN_CAP - Math.exp(0.7 - 0.7 * (damage * float / ATTEN_THRESHOLD)) * ATTEN_THRESHOLD;
    return Math.min(result, ATTEN_CAP);
  }
  return damage * float;
}

// ─── Score Calculation ───────────────────────────────────────
export function calcScore(damage: number, params: ScoreParams, bonusDmg = 0): {
  baseScore: number; threshold: number; damageScore: number;
  shieldScore: number; turnCoeff: number; totalScore: number;
} {
  const { difficulty, turns, hasShield, damageCoeff, thresholdOverride, modifier, targets } = params;

  const scoreData = getScoreData(difficulty);
  const threshold = thresholdOverride || scoreData.threshold;
  const baseScore = params.baseScoreOverride || scoreData.base;
  const turnCoeff = getTurnCoeff(turns);
  const shieldScore = hasShield ? scoreData.shield : 0;

  const totalDmg = damage * (targets || 1) + bonusDmg;
  // Damage score: H*(G*ln(damage/G)+G)
  const damageScore = damageCoeff * (threshold * Math.log(totalDmg / threshold) + threshold);

  const totalScore = (baseScore + damageScore + shieldScore) * turnCoeff * modifier;

  return { baseScore, threshold, damageScore, shieldScore, turnCoeff, totalScore };
}

// ─── Master Calculation ──────────────────────────────────────
/**
 * calculateAll — 伤害计算总入口
 *
 * 伤害公式（按乘区）:
 *   衰减前伤害 = 技能倍率 × 加攻区 × 降防区 × 弱点区 × 爆伤区 × (连击 × 破坏 × OD × 浮动)
 *   衰减为最后一步 — 所有乘区算完后再应用衰减
 *
 * 各区定义:
 *   加攻区 = (主动加攻 + 被动加攻 + 装备) / 100 + 1
 *   降防区 = (主动降防 + 被动降防) / 100 + 1
 *   弱点区 = (武器弱点 + 1) × (元素弱点 + 元素减抗/100 + 1)
 *   爆伤区 = critDmgBase (+ critDmgBonus if暴击) + 爆伤额外条目
 *   额外乘区 = 连击 × 破坏 × OD × 浮动 (用户手动调节)
 */
export function calculateAll(input: DamageInput): DamageResultData {
  const { skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, break_, score, chainMul, breakMul, odMul, floatVal, bonusDmg } = input;

  // ── 技能威力 ────────────────────────────────────────────────
  const skillResult = calcSkillPower(skill);
  const deviations = calcDeviations(stats, skill);

  // ── 加攻区 = 主动加攻 + 被动加攻 + 装备 ────────────────────
  const activeAtk = calcBuffTotal(buffs);                        // 主动: 增强/蓄力/斗志等
  const passiveAtk = calcPassiveAtkSum(bonus);                   // 被动: 连击buff/永续加成等
  const equipAtk = calcEquipmentBonus(equipment, skill.hitCount);// 装备: 戒指/耳环/项链
  const atkFactor = (activeAtk + passiveAtk + equipAtk) / 100 + 1;

  // ── 降防区 = 主动降防 + 被动降防 ────────────────────────────
  const activeDef = calcDebuffTotal(debuffs, skill.enemyAttr);   // 主动: 降防/脆弱等
  const passiveDef = calcPassiveDefSum(bonus);                   // 被动: 永续降防等
  const defFactor = (activeDef + passiveDef) / 100 + 1;

  // ── 弱点区 = 武器弱点 × 元素弱点 ────────────────────────────
  const weaknessTotal = calcWeaknessTotal(weaknesses, skill.enemyAttr);
  const weaponWeakFactor = skill.weaponWeak + 1;
  const elementFactor = skill.elementWeak + weaknessTotal / 100 + 1;
  const weaknessFactor = weaponWeakFactor * elementFactor;

  // ── 爆伤区 ──────────────────────────────────────────────────
  const critFactor = calcCritDamage(bonus, skill.isCrit) / 100;   // 基础 + 暴击 + 额外条目（存储为百分比，/100 转为乘数）

  // ── 额外乘区（用户手动调节）─────────────────────────────────

  // ── 合并：衰减前伤害（含所有乘区，衰减为最后一步）────────────
  const preAttenuation = skillResult.multiplier
    * atkFactor
    * defFactor
    * weaknessFactor
    * critFactor
    * chainMul
    * breakMul
    * odMul
    * floatVal;

  // ── 衰减（最后一步，所有乘区已并入）──────────────────────────
  const attenuationApplied = preAttenuation > ATTEN_THRESHOLD;
  const postAttenuation = applyAttenuation(preAttenuation, 1);

  // ── OD / 破坏 / 打分 ────────────────────────────────────────
  const odResult = calcOD(od);
  const weightedBreak = calcWeightedBreak(break_);
  const scoreResult = calcScore(input.damageValueOverride || postAttenuation, score, bonusDmg);

  return {
    minPower: skillResult.minPower,
    maxPower: skillResult.maxPower,
    currentPower: skillResult.currentPower,
    orbPower: skillResult.orbPower,
    overDiffPower: skillResult.overDiffPower,
    skillPower: skillResult.skillPower,
    multiplier: skillResult.multiplier,
    stats,
    ...deviations,
    buffTotal: activeAtk,
    debuffTotal: activeDef,
    weaknessTotal,
    equipmentBonus: equipAtk,
    critDamage: critFactor,
    // 因子（供 UI 直接展示，无需重算）
    passiveAtkSum: passiveAtk,
    passiveDefSum: passiveDef,
    atkFactor,
    defFactor,
    weaknessFactor,
    critFactor,
    // 伤害
    preAttenuation,
    postAttenuation,
    attenuationApplied,
    odPercent: odResult.odPercent,
    odHit: odResult.odHit,
    weightedBreak,
    score: scoreResult,
  };
}

// ─── Encounter Score (遭遇战出分) ──────────────────────────────

/** Single-round damage → score (piecewise linear, same as encounter.xlsx) */
function roundDamageScore(dmg: number): number {
  const capped = Math.min(dmg, 6_000_000_000);
  if (capped > 100_000_000) return (capped - 100_000_000) / 5000 * 0.0001 + 4450;
  if (capped >  75_000_000) return (capped -  75_000_000) / 5000 * 0.01   + 4400;
  if (capped >  50_000_000) return (capped -  50_000_000) / 5000 * 0.04   + 4200;
  if (capped >  25_000_000) return (capped -  25_000_000) / 5000 * 0.2    + 3200;
  if (capped >  10_000_000) return (capped -  10_000_000) / 5000 * 0.4    + 2000;
  return capped / 5000;
}

export interface EncounterInput {
  damages: number[];         // 5 round damages (0 if unused)
  difficulty: number;        // e.g. 40
  turns: number;             // e.g. 5
  difficultyScore: number;   // 难度分, default 65000 for diff 40
  modifier: number;          // 词条, default 1.3
  isInternational?: boolean; // 国际服: 回合分衰减从 turns-3 开始
}

export interface EncounterResult {
  roundScores: number[];     // per-round damage scores
  totalDamageScore: number;  // sum of round scores
  roundScore: number;        // 回合分 (decayed)
  difficultyScore: number;   // 难度分 (passthrough)
  modifier: number;          // 词条
  finalScore: number;        // total = (totalDmg + round + diff) * modifier
}

export function calcEncounterScore(input: EncounterInput): EncounterResult {
  const roundScores = input.damages.map(d => Math.round(roundDamageScore(d)));
  const totalDamageScore = roundScores.reduce((a, b) => a + b, 0);
  // Round score = 50000 * 0.9^(turns - offset - (difficulty - 40))
  // 日服 offset=1, 国际服 offset=3
  const turnOffset = input.isInternational ? 3 : 1;
  const roundScore = Math.round(50000 * Math.pow(0.9, input.turns - turnOffset - (input.difficulty - 40)));
  const finalScore = Math.round((totalDamageScore + roundScore + input.difficultyScore) * input.modifier);
  return {
    roundScores,
    totalDamageScore,
    roundScore,
    difficultyScore: input.difficultyScore,
    modifier: input.modifier,
    finalScore,
  };
}

// ─── Incoming Damage (受击伤害计算) ──────────────────────────────

export interface IncomingDamageInput {
  vit: number;              // 体力
  spr: number;              // 精神
  biasType: 'hp' | 'dp';   // 偏向类型
  enemyBorder: number;      // 敌方边界
  enemyPerc: number;        // 敌方伤害率 %
  skillMin: number;         // 技能最小强度
  skillMax: number;         // 技能最大强度
  skillDiff: number;        // 技能差值 a
  mark: boolean;            // 属性印记 (0.1)
  necklace: boolean;        // 加防项链 (0.1)
  passiveDef: number;       // 被动加防 (%, e.g. 15 = 15%)
}

export interface IncomingDamageResult {
  biasValue: number;        // 计算出的偏向值 x
  skillPower: number;       // 技能强度 (after interpolation)
  preTaxDmg: number;        // 税前伤害 = skillPower * perc
  defMultiplier: number;    // 加防乘区 = (1-mark) * (1-necklace) * (1-passive)
  avgDmg: number;           // 均伤
  minDmg: number;           // 0.9 下限
  maxDmg: number;           // 1.1 上限
}

export function calcIncomingDamage(input: IncomingDamageInput): IncomingDamageResult {
  const { vit, spr, biasType, enemyBorder, enemyPerc, skillMin, skillMax, skillDiff, mark, necklace, passiveDef } = input;

  // 1. Bias value
  const biasValue = biasType === 'hp'
    ? (vit * 2 + spr * 1) / 3
    : (vit * 1 + spr * 2) / 3;

  // 2. Skill power interpolation
  const diff = enemyBorder - biasValue;
  let skillPower: number;
  if (diff >= skillDiff) {
    skillPower = skillMax;
  } else if (diff >= 0) {
    skillPower = skillMin + (skillMax - skillMin) * (diff / skillDiff);
  } else if (diff >= -skillDiff) {
    skillPower = skillMin + (skillMin - 1) * (diff / skillDiff);
  } else {
    skillPower = 1;
  }

  // 3. Pre-tax damage
  const preTaxDmg = skillPower * enemyPerc;

  // 4. Defense multiplier (multiply sequentially)
  let defMultiplier = 1;
  if (mark) defMultiplier *= (1 - 0.1);
  if (necklace) defMultiplier *= (1 - 0.1);
  if (passiveDef > 0) defMultiplier *= (1 - passiveDef / 100);

  // 5. Average damage
  const avgDmg = preTaxDmg * defMultiplier;

  return {
    biasValue,
    skillPower,
    preTaxDmg,
    defMultiplier,
    avgDmg,
    minDmg: avgDmg * 0.9,
    maxDmg: avgDmg * 1.1,
  };
}

// ─── Reverse Score Calculator ─────────────────────────────────

export function reverseAttenuation(targetDamage: number): number | null {
  if (targetDamage <= ATTEN_THRESHOLD) return targetDamage;
  // Attenuation caps output at ATTEN_CAP; anything above is unreachable
  if (targetDamage >= ATTEN_CAP) return null;
  // Binary search for pre-attenuation value (monotonic in [ATTEN_THRESHOLD, ATTEN_CAP])
  let lo = ATTEN_THRESHOLD;
  let hi = ATTEN_CAP;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const attenuated = applyAttenuation(mid, 1);
    if (attenuated < targetDamage) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface ReverseScoreResult {
  requiredDamageScore: number;
  requiredDamage: number;
  requiredPreAttenuation: number | null;  // null if attenuation target is unreachable
  capped: boolean;  // true if required damage exceeds game cap
}

export function reverseCalcScore(
  targetScore: number,
  params: ScoreParams,
  bonusDmg = 0
): ReverseScoreResult | null {
  const { difficulty, turns, hasShield, damageCoeff, thresholdOverride, modifier, targets } = params;
  const scoreData = getScoreData(difficulty);
  const threshold = thresholdOverride || scoreData.threshold;
  const baseScore = params.baseScoreOverride || scoreData.base;
  const turnCoeff = getTurnCoeff(turns);
  const shieldScore = hasShield ? scoreData.shield : 0;
  const t = targets || 1;

  // totalScore = (baseScore + damageScore + shieldScore) * turnCoeff * modifier
  // => damageScore = totalScore / (turnCoeff * modifier) - baseScore - shieldScore
  const damageScore = targetScore / (turnCoeff * modifier) - baseScore - shieldScore;
  if (damageScore <= 0) return null;

  // damageScore = damageCoeff * (threshold * ln(totalDmg / threshold) + threshold)
  // totalDmg = damage * targets + bonusDmg
  // => damage = (threshold * exp(...) - bonusDmg) / targets
  const totalDmg = threshold * Math.exp((damageScore / damageCoeff - threshold) / threshold);
  let requiredDamage = (totalDmg - bonusDmg) / t;
  if (requiredDamage <= 0) return null;

  // Check against game damage cap
  const capped = requiredDamage > ATTEN_CAP;
  if (capped) requiredDamage = ATTEN_CAP;

  const requiredPreAttenuation = reverseAttenuation(requiredDamage);

  return {
    requiredDamageScore: damageScore,
    requiredDamage: Math.round(requiredDamage),
    requiredPreAttenuation: requiredPreAttenuation !== null ? Math.round(requiredPreAttenuation) : null,
    capped,
  };
}
