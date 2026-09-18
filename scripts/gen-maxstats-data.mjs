/**
 * Generate max-stats calculator data from max_stats_calcv2.2.xlsx.
 * Output: src/data/maxStatsData.json
 *
 * - characters: 67 chars, each with their styles + level-200 max base stats
 *   (assumes 徽章13 / 满破满强化 / 专属潜在 / 转生+20 / 灵魂+5 / 开花 / 因子15)
 * - equips: 13 装备基础数据 presets (already include the +5 weapon bonus)
 * - urPotential: 专属潜在特性 (per-character, usually two +20)
 *
 * v2.2 vs 6.9.11: 数据更新至 HBR V6.10.10；修正 UR 体力/精神反的问题；
 * 新增 5 个 style、更新 31 个 style 白值。
 *
 * 组合计算页 formula: total = charBase(style) + ceil(0.1 × supportBase(style)) + equip
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('max_stats_calcv2.2.xlsx');

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

// ─── 专属潜在特性 UR (Cname, Power/Dex/Tough/Spirit/Wisdom/Luck) ──
const ws3 = wb.Sheets['UR潜在特性'];
const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1 });
const urPotential = {};
for (let i = 1; i < rows3.length; i++) {
  const r = rows3[i];
  if (!r || !r[0]) continue;
  urPotential[String(r[0]).trim()] = {
    pow: r[1] || 0, dex: r[2] || 0, tough: r[3] || 0,
    spr: r[4] || 0, wis: r[5] || 0, luck: r[6] || 0,
  };
}

const output = {
  characters,
  equips,
  urPotential,
  note: '数据来源: 不会打牌的qeit (HBR V6.10.10, 徽章13 / 满破满强化 / 专属潜在 / 转生+20 / 灵魂+5 / 专武+5 / 开花 / 因子15)',
};
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/maxStatsData.json', JSON.stringify(output));
const styleCount = characters.reduce((s, c) => s + c.styles.length, 0);
console.log(`maxStatsData.json: ${characters.length} chars, ${styleCount} styles, ${equips.length} equips, ${Object.keys(urPotential).length} urPotential`);
