/**
 * Generate max-stats calculator data from max_stats_calc6.9.11.xlsx.
 * Output: src/data/maxStatsData.json
 *
 * - characters: 67 chars, each with their styles + level-200 max base stats
 *   (assumes 徽章13 / 满破满强化 / 专属潜在 / 转生+20 / 灵魂+5 / 开花 / 因子15)
 * - equips: 13 装备基础数据 presets (already include the +5 weapon bonus)
 *
 * 6.9.11 vs 6.9.0: added 专属潜在特性 + 因子全强化15 (base stats all raised),
 * added 2 styles (彌生·征服暑假餒！, 千惠·夏夜蝴蝶), added 2 luck equips.
 *
 * 组合计算页 formula: total = charBase(style) + ceil(0.1 × supportBase(style)) + equip
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('max_stats_calc6.9.11.xlsx');

// ─── 角色基础数据 (A=Element, B=Team, C=Character, D=Style, G..L=6 stats) ──
const ws = wb.Sheets['角色基础数据'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const charMap = new Map();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[2] || !r[3]) continue;
  const name = String(r[2]).trim();
  const entry = {
    style: String(r[3]).trim(),
    element: String(r[0] || '').trim(),
    team: String(r[1] || '').trim(),
    stats: { pow: r[6], dex: r[7], tough: r[8], spr: r[9], wis: r[10], luck: r[11] },
  };
  if (!charMap.has(name)) charMap.set(name, []);
  charMap.get(name).push(entry);
}
const characters = [...charMap.entries()]
  .map(([name, styles]) => ({ name, styles }))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

// ─── 装备基础数据 (name, then 6 stats — cached values include +5 weapon) ──
const ws2 = wb.Sheets['装备基础数据'];
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });
const equips = rows2
  .map(r => ({
    name: String(r[0] || '').trim(),
    stats: { pow: r[1], dex: r[2], tough: r[3], spr: r[4], wis: r[5], luck: r[6] },
  }))
  .filter(e => e.name);

const output = {
  characters,
  equips,
  note: '数据来源: 不会打牌的qeit (HBR V6.9.11, 徽章13 / 满破满强化 / 专属潜在 / 转生+20 / 灵魂+5 / 专武+5 / 开花 / 因子15)',
};
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/maxStatsData.json', JSON.stringify(output));
const styleCount = characters.reduce((s, c) => s + c.styles.length, 0);
console.log(`maxStatsData.json: ${characters.length} chars, ${styleCount} styles, ${equips.length} equips`);
