import raw from './medalData.json';

export interface MedalCharacter { id: number; name: string; enName: string; team: string }
export interface ChecklistCat { key: string; label: string; tiers: Array<string | number> }
export interface MedalData {
  characters: MedalCharacter[];
  teams: Record<string, number[]>;
  checklist: ChecklistCat[];
  tierOrder: string[];
  badgesByChar: Record<string, Record<string, number[]>>;
  charOrder: string[];
  jewels: string[];
  jewelGroups: Array<{ label: string; indices: number[] }>;
  rankThresholds: number[];
  totalTiers: number;
}

export const medalData = raw as unknown as MedalData;
