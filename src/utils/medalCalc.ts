import type { MedalData } from '../data/medalData';

export interface RankInfo {
  rank: number;
  sum: number;
  isMax: boolean;
  into: number;       // points into current rank
  span: number;       // width of current rank segment (1 if isMax)
  toNext: number | null; // points needed to next rank; null if isMax
}

export function calcRankInfo(sum: number, thresholds: number[]): RankInfo {
  let rank = 1;
  for (let i = 0; i < thresholds.length; i++) if (sum >= thresholds[i]) rank = i + 1;
  const isMax = rank >= thresholds.length;
  const cur = thresholds[rank - 1];
  const next = isMax ? null : thresholds[rank];
  const into = sum - cur;
  const span = next != null ? next - cur : 1;
  return { rank, sum, isMax, into, span, toNext: next != null ? next - sum : null };
}

export function tierPointsForChar(data: MedalData, enName: string): number[] {
  const per = data.badgesByChar[enName] ?? data.badgesByChar[data.characters[0].enName];
  const pts: number[] = [];
  for (const cat of data.checklist) {
    const arr = per[cat.key];
    if (arr) pts.push(...arr);
  }
  return pts;
}

export interface CatRange { offset: number; length: number }

export function catRange(data: MedalData, catKey: string): CatRange {
  let offset = 0;
  for (const c of data.checklist) {
    if (c.key === catKey) return { offset, length: c.tiers.length };
    offset += c.tiers.length;
  }
  return { offset: 0, length: 0 };
}

// cats: per-category completed real-tier counts (cumulative). total = real badges this char has.
export function charBadgeSummary(cats: Record<string, number> | undefined, data: MedalData, enName: string) {
  const c = cats ?? {};
  const points = tierPointsForChar(data, enName);
  const total = points.filter(p => p > 0).length;
  let count = 0, sum = 0;
  for (const cat of data.checklist) {
    const { offset } = catRange(data, cat.key);
    const real: Array<{ idx: number; p: number }> = [];
    for (let j = 0; j < cat.tiers.length; j++) {
      const p = points[offset + j];
      if (p > 0) real.push({ idx: offset + j, p });
    }
    const n = Math.max(0, Math.min(c[cat.key] ?? 0, real.length));
    count += n;
    for (let k = 0; k < n; k++) sum += real[k].p;
  }
  return { sum, count, total };
}

// completed REAL tier count within a single category (clamped to that category's real tiers)
export function charCatDone(cats: Record<string, number> | undefined, data: MedalData, enName: string, catKey: string): number {
  const c = cats ?? {};
  const points = tierPointsForChar(data, enName);
  const { offset } = catRange(data, catKey);
  const cat = data.checklist.find(x => x.key === catKey);
  if (!cat) return 0;
  const realCount = cat.tiers.filter((_, j) => points[offset + j] > 0).length;
  return Math.max(0, Math.min(c[catKey] ?? 0, realCount));
}

export function charJewelSummary(jewels: Record<string, number> | undefined, jewelCount: number) {
  const jw = jewels ?? {};
  let learned = 0, sum = 0;
  for (let i = 0; i < jewelCount; i++) {
    const v = jw[String(i)] ?? 0;
    if (v >= 100) learned++;
    sum += v;
  }
  return { learned, sum, total: jewelCount };
}
