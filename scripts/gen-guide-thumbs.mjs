/**
 * Generate the guide-info character-skin manifest from public/Char_thumbnail/*.jpg.
 *
 * File naming: {enName}{SkinName}_R{n}[suffix]_Thumbnail.jpg
 *   - {enName}    roster enName (see src/data/medalData.json); a few files use a
 *                 given-name prefix (e.g. "Karen") that maps to a roster enName.
 *   - {SkinName}  "Default" or an event/collab skin name (Pure, Soldier, Swim2024…).
 *   - R{n}        R1 | R2 | R3
 *   - [suffix]    optional 'a' | 'b' (variant of the same skin).
 *
 * Output: src/data/guideThumbnails.json — { enName: [{id, file, label}, …] | null }
 *   - id  unique per character; Default skins → r1/r2/r2a/r2b/r3/r3a,
 *         alt skins → lowercased skin name (suffix appended on collision).
 *   - file  bare filename inside Char_thumbnail/.
 *   - label  a皮 / s皮 / s皮·a / 原皮 / alt skin name (with ·suffix).
 *
 * Run: npm run gen:thumbs  (committed output; re-run when thumbnails change)
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';

const SRC = 'public/Char_thumbnail';
const OUT = 'src/data/guideThumbnails.json';

// 文件名前缀 → 正式 enName（卡面文件夹用角色名而非 enName）
const ALIAS = { Karen: 'KAsakura' };

const medal = JSON.parse(await readFile('src/data/medalData.json', 'utf8'));
const roster = medal.characters; // [{id, name, enName, team}]
const enNames = new Set(roster.map(c => c.enName));
for (const t of Object.values(ALIAS)) enNames.add(t);

const files = (await readdir(SRC)).filter(f => f.endsWith('.jpg')).sort();

/** Parse one filename → { enName, skinName, r, suffix, namePart, viaAlias } | null */
function parseFile(f) {
  const m = f.match(/^(.*)_R([0-9])([ab]?)_Thumbnail\.jpg$/);
  if (!m) return null;
  const namePart = m[1];
  const r = m[2];
  const suffix = m[3] || '';
  // 别名前缀优先（Karen→KAsakura）
  for (const [prefix, target] of Object.entries(ALIAS)) {
    if (namePart.startsWith(prefix)) {
      return { enName: target, skinName: namePart.slice(prefix.length), r, suffix, namePart, viaAlias: true };
    }
  }
  // 最长 roster enName 前缀
  const hit = roster
    .map(c => c.enName)
    .filter(e => namePart.startsWith(e))
    .sort((a, b) => b.length - a.length)[0];
  if (!hit) return null;
  return { enName: hit, skinName: namePart.slice(hit.length), r, suffix, namePart, viaAlias: false };
}

/** 默认皮：r1→a皮, r2→s皮, r3→原皮；活动皮：皮肤名。 */
function baseLabel(skinName, r) {
  if (skinName === 'Default') return r === '1' ? 'a皮' : r === '2' ? 's皮' : '原皮';
  return skinName;
}

/** 默认皮 id：r1/r2/r2a/r2b/r3/r3a（后缀并入）；活动皮：小写皮肤名。 */
function baseId(skinName, r, suffix) {
  if (skinName === 'Default') return `r${r}${suffix}`;
  return skinName.toLowerCase();
}

// 按角色收集；同 (skinName,r,suffix) 去重，优先保留非别名（真 enName 前缀）文件
const byChar = new Map();
const orphans = [];
for (const f of files) {
  const p = parseFile(f);
  if (!p) { orphans.push(f); continue; }
  const key = `${p.skinName}_${p.r}${p.suffix}`;
  const list = byChar.get(p.enName) ?? [];
  const existing = list.find(x => x.key === key);
  if (!existing) {
    list.push({ ...p, key });
  } else if (existing.viaAlias && !p.viaAlias) {
    // 同 key 已存在：别名文件换入真 enName 文件
    list.splice(list.indexOf(existing), 1, { ...p, key });
  }
  byChar.set(p.enName, list);
}

const result = {};
const collisions = [];
for (const c of roster) {
  const list = byChar.get(c.enName) ?? [];
  // 排序：默认皮（a皮→s皮→原皮）在前，活动皮按名在后
  list.sort((a, b) => {
    const ka = a.skinName === 'Default' ? `0-${a.r}${a.suffix}` : `1-${a.skinName}`;
    const kb = b.skinName === 'Default' ? `0-${b.r}${b.suffix}` : `1-${b.skinName}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  // 分配 id（活动皮跨 R/后缀时去重）
  const used = new Set();
  const skins = [];
  for (const s of list) {
    let id = baseId(s.skinName, s.r, s.suffix);
    if (used.has(id)) {
      id = `${id}-r${s.r}${s.suffix}`;
      collisions.push(`${c.enName}: ${s.skinName} → ${id}`);
    }
    used.add(id);
    skins.push({
      id,
      file: `${s.namePart}_R${s.r}${s.suffix}_Thumbnail.jpg`,
      label: baseLabel(s.skinName, s.r) + (s.suffix ? `·${s.suffix}` : ''),
    });
  }
  result[c.enName] = skins.length ? skins : null;
}

await writeFile(OUT, JSON.stringify(result));

const totalSkins = Object.values(result).reduce((n, v) => n + (v ? v.length : 0), 0);
const noThumb = Object.entries(result).filter(([, v]) => v === null).map(([k]) => k);
console.log(`thumbs: ${files.length} files → ${Object.keys(result).length} characters, ${totalSkins} skins`);
console.log(`no thumbnails (${noThumb.length}): ${noThumb.join(', ')}`);
if (collisions.length) console.log(`id collisions resolved: ${collisions.join('; ')}`);
if (orphans.length) console.log(`unmatched files: ${orphans.join(', ')}`);
console.log(`→ ${OUT}`);
