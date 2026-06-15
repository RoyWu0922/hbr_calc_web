// Skill database sourced from hbr.quest
// All values: max = 1级最大威力, border = 技能差值

export interface SkillDef {
  name: string;
  max: number;
  border: number;
}

export interface DebuffSkillDef {
  name: string;
  max: number;
  min: number;
  border: number;
}

// ─── Buff Skills (加攻区) ────────────────────────────────────
export const BUFF_SKILLS: SkillDef[] = [
  { name: '胜利之弧-加攻', max: 180, border: 143 },
  { name: '胜利之弧-心眼', max: 120, border: 143 },
  { name: '泪雨', max: 160, border: 256 },
  { name: '蓄力珠', max: 30, border: 200 },
  { name: '指挥', max: 15, border: 0 },
  { name: '圣女-加攻', max: 180, border: 147 },
  { name: '圣女-心眼', max: 120, border: 147 },
  { name: '加速', max: 90, border: 232 },
  { name: '彩蛋', max: 160, border: 200 },
  { name: '柳-蓄力', max: 30, border: 216 },
  { name: '伊甸园-加攻', max: 180, border: 304 },
  { name: '伊甸园-心眼', max: 120, border: 304 },
];

// ─── Debuff Skills (减防区) ──────────────────────────────────
export const DEBUFF_SKILLS: DebuffSkillDef[] = [
  { name: '光芒一闪', max: 30, min: 20, border: 138 },
  { name: '冰华-永减', max: 30, min: 20, border: 144 },
  { name: '冰华-冰减', max: 20, min: 10, border: 144 },
  { name: '美也单体脆弱', max: 60, min: 42, border: 120 },
  { name: '软化珠', max: 45, min: 30, border: 200 },
  { name: '鲱鱼闹钟', max: 45, min: 30, border: 126 },
  { name: '灵符-冰减', max: 45, min: 30, border: 141 },
  { name: '灵符-脆弱', max: 60, min: 42, border: 141 },
  { name: '惠 单减', max: 45, min: 30, border: 129 },
  { name: '惠 永属减', max: 30, min: 20, border: 150 },
  { name: '惠 脆弱', max: 60, min: 42, border: 132 },
  { name: '惠 永脆', max: 40, min: 30, border: 126 },
  { name: '重力子', max: 45, min: 30, border: 200 },
  { name: '国土-降防', max: 30, min: 20, border: 137 },
  { name: '追风', max: 45, min: 30, border: 143 },
  { name: '骇客-脆弱', max: 60, min: 42, border: 149 },
  { name: '光晕-永减', max: 30, min: 20, border: 143 },
  { name: '胭紅魔女-光减', max: 60, min: 45, border: 135 },
  { name: '胭紅魔女-脆弱', max: 60, min: 42, border: 135 },
  { name: '毁灭+', max: 55, min: 40, border: 147 },
];

// ─── Weakness Skills (弱点区) ────────────────────────────────
export const WEAKNESS_SKILLS: DebuffSkillDef[] = [
  { name: '今宵', max: 60, min: 45, border: 138 },
  { name: '放学', max: 60, min: 45, border: 140 },
  { name: '无限光晕', max: 60, min: 45, border: 143 },
  { name: '国土无双', max: 60, min: 45, border: 137 },
  { name: '纯洁之吻', max: 60, min: 45, border: 141 },
  { name: '再炸一波', max: 60, min: 45, border: 150 },
  { name: '混沌诡骗师', max: 60, min: 45, border: 153 },
];

// ─── Score Reference Tables ──────────────────────────────────
export const SCORE_TABLE: Record<number, { base: number; threshold: number; shield: number }> = {
  40: { base: 700000, threshold: 13888889, shield: 150000 },
  39: { base: 630000, threshold: 25000000, shield: 145000 },
  38: { base: 620000, threshold: 25000000, shield: 140000 },
  37: { base: 610000, threshold: 25000000, shield: 135000 },
  36: { base: 600000, threshold: 25000000, shield: 130000 },
  35: { base: 500000, threshold: 20000000, shield: 120000 },
  34: { base: 470000, threshold: 20000000, shield: 116000 },
  33: { base: 450000, threshold: 20000000, shield: 112000 },
  32: { base: 420000, threshold: 20000000, shield: 108000 },
  31: { base: 400000, threshold: 20000000, shield: 104000 },
  30: { base: 350000, threshold: 13000000, shield: 100000 },
};

export const TURN_COEFF: Record<number, number> = {
  1: 1.30, 2: 1.29, 3: 1.28, 4: 1.27, 5: 1.26,
  6: 1.24, 7: 1.23, 8: 1.22, 9: 1.21, 10: 1.20,
  11: 1.19, 12: 1.18, 13: 1.17, 14: 1.16, 15: 1.15,
  16: 1.14, 17: 1.13, 18: 1.12, 19: 1.11, 20: 1.10,
  21: 1.09, 22: 1.08, 23: 1.07, 24: 1.06,
};

export function getScoreData(difficulty: number) {
  return SCORE_TABLE[difficulty] || SCORE_TABLE[40];
}

export function getTurnCoeff(turns: number): number {
  return TURN_COEFF[turns] || 1.0;
}
