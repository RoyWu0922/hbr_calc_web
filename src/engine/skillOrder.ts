// ─── Skill Sort Order Persistence ───────────────────────────
// Stores per-category ordering of skill names in localStorage.
// New skills (not yet in the order list) automatically appear at the end.

export type SkillCategory = 'buff' | 'debuff' | 'weakness';

const ORDER_KEY_PREFIX = 'hbr-skill-order';

export function getSkillOrder(category: SkillCategory): string[] {
  try {
    const raw = localStorage.getItem(`${ORDER_KEY_PREFIX}-${category}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setSkillOrder(category: SkillCategory, order: string[]): void {
  try {
    localStorage.setItem(`${ORDER_KEY_PREFIX}-${category}`, JSON.stringify(order));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function removeFromOrder(category: SkillCategory, name: string): void {
  const order = getSkillOrder(category);
  const filtered = order.filter(n => n !== name);
  if (filtered.length !== order.length) {
    setSkillOrder(category, filtered);
  }
}

/**
 * Sort items by a custom order array.
 * Items found in `order` get their assigned position;
 * items not in `order` (e.g. newly added skills) go to the end,
 * preserving their relative order from the input array.
 * Returns items unchanged if `order` is empty.
 */
export function sortByOrder<T extends { name: string }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items;

  const indexMap = new Map<string, number>();
  order.forEach((name, i) => indexMap.set(name, i));

  return [...items].sort((a, b) => {
    const ai = indexMap.get(a.name);
    const bi = indexMap.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
}
