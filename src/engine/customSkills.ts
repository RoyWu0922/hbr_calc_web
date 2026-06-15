const STORAGE_KEY = 'hbr-custom-skills';

export interface CustomSkill {
  name: string;
  max: number;
  min?: number;
  border: number;
}

type SkillCategory = 'buff' | 'debuff' | 'weakness';

export function getCustomSkills(category: SkillCategory): CustomSkill[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${category}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addCustomSkill(category: SkillCategory, skill: CustomSkill): void {
  const skills = getCustomSkills(category);
  const idx = skills.findIndex(s => s.name === skill.name);
  if (idx >= 0) {
    skills[idx] = skill; // overwrite (for edits)
  } else {
    skills.push(skill);
  }
  localStorage.setItem(`${STORAGE_KEY}-${category}`, JSON.stringify(skills));
}

export function deleteCustomSkill(category: SkillCategory, name: string): void {
  const skills = getCustomSkills(category).filter(s => s.name !== name);
  localStorage.setItem(`${STORAGE_KEY}-${category}`, JSON.stringify(skills));
}

export function getAllCustomSkills(category: SkillCategory): CustomSkill[] {
  return getCustomSkills(category);
}

// ─── Built-in Skill Overrides ─────────────────────────────────
const OVERRIDE_KEY = 'hbr-builtin-overrides';

interface BuiltinOverride {
  name: string;
  max?: number;
  min?: number;
  border?: number;
  deleted?: boolean;
}

function getOverrides(category: SkillCategory): Record<string, BuiltinOverride> {
  try {
    const raw = localStorage.getItem(`${OVERRIDE_KEY}-${category}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOverrides(category: SkillCategory, overrides: Record<string, BuiltinOverride>) {
  localStorage.setItem(`${OVERRIDE_KEY}-${category}`, JSON.stringify(overrides));
}

export function getDeletedBuiltins(category: SkillCategory): Set<string> {
  const ov = getOverrides(category);
  return new Set(Object.keys(ov).filter(k => ov[k].deleted));
}

export function getBuiltinOverrides(category: SkillCategory): Record<string, BuiltinOverride> {
  return getOverrides(category);
}

export function overrideBuiltinSkill(category: SkillCategory, name: string, skill: { max?: number; min?: number; border?: number }): void {
  const ov = getOverrides(category);
  ov[name] = { ...ov[name], ...skill, deleted: false };
  saveOverrides(category, ov);
}

export function deleteBuiltinSkill(category: SkillCategory, name: string): void {
  const ov = getOverrides(category);
  ov[name] = { ...ov[name], deleted: true };
  saveOverrides(category, ov);
}

export function restoreBuiltinSkill(category: SkillCategory, name: string): void {
  const ov = getOverrides(category);
  delete ov[name];
  saveOverrides(category, ov);
}
