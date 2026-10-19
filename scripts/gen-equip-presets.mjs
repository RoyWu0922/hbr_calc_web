/**
 * Regenerate EQUIP_PRESETS in src/engine/whiteStatsData.ts from maxStatsData.json.
 *
 * The 顶配 table's equip stats include 专武+5; the 白值 page adds that separately via
 * WEAPON_BONUS[5] = 25. So the 白值 preset value is the 顶配 value minus 25 — verified
 * on every preset against the previous hand-written table (Δ was exactly 25, or 28 on
 * one axis where the weapon's main stat is higher).
 *
 * Names come straight from the new sheet (they now say which 恒星吊饰 the preset
 * assumes). Rewrites only the EQUIP_PRESETS literal, leaving the rest of the file byte
 * identical.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WEAPON5 = 25;

const data = JSON.parse(readFileSync('src/data/maxStatsData.json', 'utf8'));
const FILE = 'src/engine/whiteStatsData.ts';
const src = readFileSync(FILE, 'utf8');

const rows = data.equips.map((e) => {
  const s = e.stats;
  const v = [s.pow, s.dex, s.tough, s.spr, s.wis, s.luck].map((n) => Math.max(0, n - WEAPON5));
  return `  { name: ${JSON.stringify(e.name)}, pow: ${v[0]}, dex: ${v[1]}, tough: ${v[2]}, spr: ${v[3]}, wis: ${v[4]}, luck: ${v[5]} },`;
});

const replacement =
  'export const EQUIP_PRESETS: EquipPreset[] = [\n' +
  '  // 不含专武：专武 +5 由 WEAPON_BONUS[weaponLevel] 单独计入（见 engine/whiteStats.ts）。\n' +
  '  // 数值 = 顶配计算器那份（含专武）减 25，由 scripts/gen-equip-presets.mjs 从同一张表生成。\n' +
  rows.join('\n') +
  '\n];';

const before = src.match(/export const EQUIP_PRESETS: EquipPreset\[\] = \[[\s\S]*?\n\];/);
if (!before) { console.error('找不到 EQUIP_PRESETS 块'); process.exit(1); }
const out = src.replace(before[0], replacement);
if (out === src) { console.log('无变化'); process.exit(0); }
writeFileSync(FILE, out);

const oldN = (before[0].match(/\{ name:/g) || []).length;
console.log(`EQUIP_PRESETS: ${oldN} 套 → ${data.equips.length} 套`);
for (const e of data.equips) {
  const s = e.stats;
  console.log('  ' + e.name.padEnd(30) + ' ' + [s.pow, s.dex, s.tough, s.spr, s.wis, s.luck].map((n) => Math.max(0, n - WEAPON5)).join(','));
}
