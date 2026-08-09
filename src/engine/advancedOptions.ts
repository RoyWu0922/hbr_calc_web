/** 伤害计算器进阶选项（跨会话持久化，独立于 userDefaults） */
export interface AdvancedOptions {
  hideWhiteBonus: boolean; // 隐藏全部白值加成填写框
  manualSkill: boolean;    // 取消下拉选技能，手动填写技能名 + 差值/min/max
}

const STORAGE_KEY = 'hbr_calc_advanced_options';
const DEFAULT_OPTIONS: AdvancedOptions = { hideWhiteBonus: false, manualSkill: false };

export function loadAdvancedOptions(): AdvancedOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw);
    return {
      hideWhiteBonus: parsed.hideWhiteBonus === true,
      manualSkill: parsed.manualSkill === true,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveAdvancedOptions(opts: AdvancedOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // localStorage full/unavailable — silently ignore
  }
}
