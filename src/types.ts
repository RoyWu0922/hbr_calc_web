// ─── Damage Model ───────────────────────────────────────────
export interface SkillInput {
  sp: number;
  skillLevel: number;
  deviation: number; // 偏向
  token: number;
  special: number; // 特殊 (奏=1.25, 吹雪dp...)
  orb: number; // 宝珠
  maxPower: number; // 1级最大威力
  baseDiff: number; // 基础差值
  whiteBonus: number; // 白值加成
  currentWeighted: number; // 当前加权
  enemyAttr: number; // 敌方属性
  isCrit: boolean; // 暴击
  weaponWeak: number; // 武器弱点
  elementWeak: number; // 属性弱点
  hitCount: number; // 技能hit数
}

export interface Stats {
  str: number;  // 力
  spr: number;  // 灵
  int: number;  // 智
  luk: number;  // 运
}

export interface BuffSkill {
  name: string;
  maxPower: number;   // from LOOKUP
  border: number;      // from LOOKUP
  orb: number;
  currentAttr: number;
  moraleFighting: number; // 士气/斗志
  skillLevel: number;
  passive: number; // 被动 multiplier
  layers: number;
}

export interface DebuffSkill {
  name: string;
  maxPower: number;
  minPower: number;
  border: number;
  orb: number;
  currentAttr: number;
  moraleDebuffs: number; // 灵符/灾厄/黑客/士气/斗志
  skillLevel: number;
  passive: number;
  layers: number;
}

export interface WeaknessSkill {
  name: string;
  maxPower: number;
  minPower: number;
  border: number;
  orb: number;
  currentAttr: number;
  moraleDebuffs: number;
  skillLevel: number;
  passive: number;
  layers: number;
}

export interface BonusEntry {
  name: string;
  value: number;
}

export interface Equipment {
  ring: boolean;       // 戒指 +10
  hpEarring: boolean;  // HP耳环
  silverNecklace: boolean; // 银冰项链 +10
}

export interface BonusArea {
  passiveAtkEntries: BonusEntry[];   // 被动加攻区 逐个条目
  passiveDefEntries: BonusEntry[];   // 被动减防区 逐个条目
  critDmgBase: number;  // 爆伤基础 (通常是1)
  critDmgBonus: number; // 暴击额外 (通常是0.5)
  critDmgExtraEntries: BonusEntry[]; // 爆伤区额外条目
}

export interface ODParams {
  origHit: number;      // 原始hit
  addHit: number;       // 附加hit
  fixedOD: number;      // 固定od%
  earringCoeff: number; // 耳环系数
}

export interface BreakParams {
  skillDR: number;      // 技能破坏倍率 (DR)
  enemyDR: number;      // 敌人DR
  origHits: number;     // 技能原始Hit数
  earring: number;      // 破坏耳环 0/1
  necklace: number;     // 银冰项链 0/1
  otherDR: number;      // 其他破坏率增量
  superChain: number;   // 特大连击 50%
  bigChain: number;     // 大连击 25%
  midChain: number;     // 中连击 12%
  smallChain: number;   // 小连击 6%
  maxDR: number | undefined; // 敌人最大破坏率
  initDR: number | undefined; // 敌人初始破坏率
  dists: number[];      // 每本体hit的伤害分布 (长度=origHits)
}

// ─── Break Calculation Result ───────────────────────────────
export interface BreakHitDetail {
  hit: number;
  type: '本体' | '连击' | '无效';
  mult: number;
  drInc: number;
  cumDR: number;
  dmg: number;          // cumulative DR × mult
}

export interface BreakResult {
  theoreticalDRInc: number;    // 理论DR增量 (不含enemyDR, 无上限)
  theoreticalBreakInc: number; // 理论破坏率增量 (含enemyDR, 无上限)
  actualFinalDR: number;       // 实际最终破坏率 (含上限)
  averageDR: number;           // 平均破坏率 = SUM(cumDR×mult) / (1+ΣchainMult)
  weightedBreak: number;       // 加权破坏 = SUM(cumDR×mult)
  drMultiplier: number;        // DR乘数 (1+耳环+项链+其他)
  earringBonus: number;        // 耳环加成
  totalHits: number;
  totalChainMult: number;      // Σ(chainTypeCount × chainMult)
  hitDetails: BreakHitDetail[];
}

export interface ScoreParams {
  difficulty: number;
  turns: number;
  hasShield: boolean;
  damageCoeff: number; // 伤害系数 (0.018 for weighted, 0.18 for final)
  thresholdOverride?: number; // 阈值 override
  modifier: number; // 词条
  baseScoreOverride?: number;
  targets: number; // 目标数，默认1
}

// ─── Turn Planner ───────────────────────────────────────────
export interface TurnPlannerChar {
  name: string;
  sp: number;           // 当前SP（随回合推进而更新，存在idb里）
}

export interface FrontAction {
  charIndex: number;    // 0-5, which character is acting
  action: string;       // action label (e.g. "增强", "大招")
  spCost: number;
  spGain: number;
  odGain: number;
  dr: number;
}

export type TurnType = 'normal' | 'extra';
export type ODMode = 120 | 300;

export interface PlannerTurn {
  roundLabel: string;               // "1", "2", "前置OD1", "后置OD2", "追加" etc.
  turnType: TurnType;
  frontActions: [FrontAction, FrontAction, FrontAction];
  backSPGain: [number, number, number];
  jailOD: number;        // 牢房 (column W in TL.xlsx)
  passiveOD: number;     // 被动OD (column X)
  bossDR: number;        // BOSS DR this turn (column AB)
}

export interface TurnPlannerState {
  odMode: ODMode;
  defaultPassiveOD: number;  // 全局被动OD（每回合固定附加）
  showBreak: boolean;         // 是否显示破坏输入
  characters: [TurnPlannerChar, TurnPlannerChar, TurnPlannerChar, TurnPlannerChar, TurnPlannerChar, TurnPlannerChar];
  turns: PlannerTurn[];
}

export interface ComputedTurnResult {
  sp: number[];           // SP for each of 6 chars after this turn
  odAssist: number;       // Raw OD before cap (column Y)
  odCapped: number;       // Capped OD (column Z)
  cumulativeDR: number;   // Cumulative DR applied to boss
  remainingDR: number;    // Remaining boss DR
}

// Legacy types kept for backward compatibility
export interface TurnAction {
  charIndex: number;
  charName: string;
  spCost: number;
  spGain: number;
  odGain: number;
  drContribution: number;
}

export interface TurnRow {
  turnNumber: number;
  actions: (TurnAction | null)[];
  passiveOD: number;
  label?: string;
}

// ─── Calculation Result ─────────────────────────────────────
export interface DamageResultData {
  // Skill power
  minPower: number;
  maxPower: number;
  currentPower: number;
  orbPower: number;
  overDiffPower: number;
  skillPower: number;
  multiplier: number;

  // Stats
  stats: Stats;
  hpDeviation: number;
  dpDeviation: number;
  intDeviation: number;
  lukDeviation: number;

  // Buff/Debuff/Weakness totals
  buffTotal: number;
  debuffTotal: number;
  weaknessTotal: number;

  // Equipment
  equipmentBonus: number;

  // Crit damage
  critDamage: number;

  // Computed factors (各乘区因子，供 UI 展示，无需重算)
  passiveAtkSum: number;
  passiveDefSum: number;
  atkFactor: number;       // 加攻区 = (buffTotal + passiveAtkSum + equipmentBonus)/100 + 1
  defFactor: number;       // 降防区 = (debuffTotal + passiveDefSum)/100 + 1
  weaknessFactor: number;  // 弱点区 = (weaponWeak+1) * (elementWeak + weaknessTotal/100 + 1)
  critFactor: number;      // 爆伤区 = critDamage

  // Final damage
  preAttenuation: number;
  postAttenuation: number;
  attenuationApplied: boolean;

  // OD
  odPercent: number;
  odHit: number;

  // Break
  weightedBreak: number;

  // Score
  score: {
    baseScore: number;
    threshold: number;
    damageScore: number;
    shieldScore: number;
    turnCoeff: number;
    totalScore: number;
  } | null;
}

// ─── History ─────────────────────────────────────────────────
export interface CalcHistoryEntry {
  id?: number;
  timestamp: number;
  label: string;
  input: DamageInput;
  result: DamageResultData;
  notes?: string;
  folderId?: number;
}

export interface Folder {
  id?: number;
  name: string;
  type: 'calc' | 'planner';
  timestamp: number;
  sortOrder: number;
}

export interface PresetTemplate {
  id?: number;
  name: string;
  timestamp: number;
  buffs: BuffSkill[];
  debuffs: DebuffSkill[];
  weaknesses: WeaknessSkill[];
  equipment: Equipment;
  bonus: BonusArea;
}

export interface DamageInput {
  skill: SkillInput;
  stats: Stats;
  buffs: BuffSkill[];
  debuffs: DebuffSkill[];
  weaknesses: WeaknessSkill[];
  equipment: Equipment;
  bonus: BonusArea;
  od: ODParams;
  break_: BreakParams;
  score: ScoreParams;
  chainMul: number;
  breakMul: number;
  odMul: number;
  floatVal: number;
  bonusDmg: number;
  damageValueOverride?: number;
  // Float probability distribution settings
  superChainHits?: number;
  bigChainHits?: number;
  midChainHits?: number;
  smallChainHits?: number;
  bodyWeightStr?: string;
}
