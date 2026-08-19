import { medalData, type MedalCharacter } from './medalData';
import type { GuideAttribute, GuideTeamSlot } from '../types';
import thumbnails from './guideThumbnails.json';

export const GUIDE_ATTRIBUTES: GuideAttribute[] = ['火', '冰', '雷', '光', '暗', '无'];

// 队伍展示顺序（与 thumbnail/team 图标 slug 对应）
export const TEAM_ORDER = ['31A', '31B', '31C', '31D', '31E', '31F', '31X', '30G', '司令部', '19A', 'p5r联动', 'AB联动'];

const TEAM_ICON_SLUG: Record<string, string> = {
  '31A': '31a', '31B': '31b', '31C': '31c', '31D': '31d', '31E': '31e', '31F': '31f',
  '31X': '31x', '30G': '30g', 'p5r联动': 'p5r', 'AB联动': 'ab', '19A': '19a', '司令部': 'commander',
};

const ELEMENT_ICON_SLUG: Record<GuideAttribute, string> = {
  '火': 'fire', '冰': 'ice', '雷': 'thunder', '光': 'light', '暗': 'void', '无': 'none',
};

const BASE = import.meta.env.BASE_URL;
const CHAR_DIR = `${BASE}Char_thumbnail/`;

export function getTeamIcon(team: string): string {
  return `${CHAR_DIR}team/${TEAM_ICON_SLUG[team]}.jpg`;
}

export function hasTeamIcon(team: string): boolean {
  return !!TEAM_ICON_SLUG[team];
}

export function getElementIcon(attr: GuideAttribute): string {
  return `${CHAR_DIR}element/${ELEMENT_ICON_SLUG[attr]}.jpg`;
}

export interface GuideSkin { id: string; file: string; label: string }

/** 某角色的全部皮肤（a皮/s皮/原皮/活动换皮）；无卡面返回 null */
export function getCharSkins(enName: string): GuideSkin[] | null {
  return (thumbnails as Record<string, GuideSkin[] | null>)[enName] ?? null;
}

/** 默认皮肤 id：优先原皮(r3) → s皮(r2) → a皮(r1) → 第一个可用；无卡面返回 null */
export function getDefaultSkinId(enName: string): string | null {
  const skins = getCharSkins(enName);
  if (!skins?.length) return null;
  const pref = ['r3', 'r2', 'r1'];
  for (const p of pref) {
    const s = skins.find(x => x.id === p);
    if (s) return s.id;
  }
  return skins[0].id;
}

/** 指定皮肤缩略图 URL；皮肤不存在回退默认皮 */
export function getSkinThumbnail(enName: string, skinId?: string): string | null {
  const skins = getCharSkins(enName);
  if (!skins?.length) return null;
  const id = skinId && skins.some(s => s.id === skinId) ? skinId : getDefaultSkinId(enName);
  const s = skins.find(x => x.id === id);
  return s ? `${CHAR_DIR}${s.file}` : null;
}

/** 角色默认皮肤缩略图（向后兼容） */
export function getCharThumbnail(enName: string): string | null {
  return getSkinThumbnail(enName);
}

/** 队伍槽位实际生效的皮肤 id（旧数据无 skin → 默认皮） */
export function resolveSlotSkin(enName: string, skin?: string): string | null {
  const skins = getCharSkins(enName);
  if (!skins?.length) return null;
  return skin && skins.some(s => s.id === skin) ? skin : getDefaultSkinId(enName);
}

/** 队伍槽位缩略图 URL；无卡面返回 null（调用方用文字兜底） */
export function getSlotThumbnail(slot: GuideTeamSlot): string | null {
  const c = getCharById(slot.characterId);
  if (!c) return null;
  const id = resolveSlotSkin(c.enName, slot.skin);
  return id ? getSkinThumbnail(c.enName, id) : null;
}

export function getCharById(id: number): MedalCharacter | undefined {
  return medalData.characters.find(c => c.id === id);
}

export function teamCharacters(team: string): MedalCharacter[] {
  const ids = medalData.teams[team] || [];
  return ids.map(id => getCharById(id)).filter((c): c is MedalCharacter => !!c);
}

// 平均突破 = 6 槽突破数取平均后四舍五入（1~4）
export function getAvgBreak(team: GuideTeamSlot[]): number {
  if (!team.length) return 0;
  const sum = team.reduce((a, s) => a + (s.break || 0), 0);
  return Math.round(sum / team.length);
}
