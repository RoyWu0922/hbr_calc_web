import raw from './maxStatsData.json';

export interface Stats6 { pow: number; dex: number; tough: number; spr: number; wis: number; luck: number }
export interface MaxStyle { style: string; element: string; team: string; stats: Stats6 }
export interface MaxCharacter { name: string; styles: MaxStyle[] }
export interface MaxEquip { name: string; stats: Stats6 }
export interface MaxStatsData {
  characters: MaxCharacter[];
  equips: MaxEquip[];
  note: string;
}

export const maxStatsData = raw as unknown as MaxStatsData;
