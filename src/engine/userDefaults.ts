/**
 * User-customizable default values persisted in localStorage.
 * Users can save their current calculator inputs as defaults,
 * which will be loaded on next visit.
 */

import { SkillInput, Equipment, BonusArea, ScoreParams, BreakParams, ODParams } from '../types';

export interface UserDefaults {
  skill: Partial<SkillInput>;
  equipment: Partial<Equipment>;
  bonus: Partial<BonusArea>;
  od: Partial<ODParams>;
  break_: Partial<BreakParams>;
  score: Partial<ScoreParams>;
  chainMul: number;
  breakMul: number;
  odMul: number;
  floatVal: number;
  bonusDmg: number;
}

const STORAGE_KEY = 'hbr_calc_user_defaults';

export function saveUserDefaults(defaults: UserDefaults): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadUserDefaults(): UserDefaults | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic validation: must be an object
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as UserDefaults;
  } catch {
    return null;
  }
}

export function clearUserDefaults(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently ignore
  }
}

/**
 * Merge saved user defaults over hardcoded defaults.
 * Only non-undefined fields from saved are applied.
 */
export function mergeDefaults<T extends Record<string, unknown>>(
  hardcoded: T,
  saved: Partial<T> | undefined,
): T {
  if (!saved) return { ...hardcoded };
  const merged = { ...hardcoded };
  for (const key of Object.keys(saved) as (keyof T)[]) {
    const val = saved[key];
    if (val !== undefined && val !== null) {
      (merged as Record<string, unknown>)[key as string] = val;
    }
  }
  return merged;
}
