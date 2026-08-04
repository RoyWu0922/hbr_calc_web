/**
 * Generate medal record data from Character.xlsx + BadgeReward.xlsx.
 * Output: src/data/medalData.json
 *
 * - 61 characters (id, Chinese name, English ID) + team grouping
 * - checklist: 9 medal categories grouped by GroupLabel category (66 tiers)
 * - jewels: 19 jewel names
 * - badgesByChar: category-keyed points per character (aligned to checklist)
 * - rankThresholds: cumulative points for ranks 1..15
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ─── Teams (user-provided) ───────────────────────────────
const TEAMS = {
  '31A': [55, 61, 34, 32, 14, 13],
  '31B': [58, 39, 41, 42, 36, 48],
  '31C': [8, 23, 26, 40, 50, 60],
  '31D': [5, 7, 12, 24, 45, 49],
  '31E': [17, 18, 19, 20, 21, 22],
  '31F': [4, 35, 16, 37, 57, 63],
  '31X': [10, 15, 33, 46, 52, 53],
  '30G': [25, 31, 38, 47, 56, 59],
  '司令部': [3, 30],
  '19A': [29],
  'p5r联动': [0, 1, 2],
  'AB联动': [6, 9, 27, 44, 51, 54, 62],
};

const JEWELS = ['会心', '复活', '驱动', '防护罩', '强攻', '专注力', '充填', '治疗', '软化', '衰减',
  '火重力子', '雷重力子', '暗重力子', '光重力子', '冰重力子', '蓄力', '士气', '被动防御', '伤害限制'];

const JEWEL_GROUP_SIZES = [5, 5, 5, 4];
const JEWEL_GROUP_LABELS = ['1期宝玉', '2期宝玉', '3期宝玉', '4期宝玉&其它'];
const jewelGroups = [];
{
  let idx = 0;
  JEWEL_GROUP_SIZES.forEach((size, g) => {
    const indices = [];
    for (let k = 0; k < size; k++) indices.push(idx++);
    jewelGroups.push({ label: JEWEL_GROUP_LABELS[g], indices });
  });
}

const RANK_THRESHOLDS = [0, 500, 1500, 3000, 5000, 7500, 10500, 14000, 18000, 22500, 27500, 33000, 39000, 45500, 52500];

// ─── Category mapping from GroupLabel ─────────────────────
const CAT_MAP = {
  CLv: 'level', BreakStyleLimit: 'breakthrough', ReincarnationCount: 'reincarnation',
  LearnedGateBossSkillCount: 'jewel', ScoreAttackHighScore: 'score', BattleClearCount: 'battles',
  ExpeditionStartedCount: 'ruins', HardMode: 'hard', WaveBattleHighScore: 'encounter',
};
const CAT_LABEL = {
  level: '等级', breakthrough: '突破', reincarnation: '转生', jewel: '宝玉', score: '打分',
  battles: '战斗次数', ruins: '废域', hard: '异时层', encounter: '遭遇战',
};
const CAT_ORDER = ['level', 'breakthrough', 'reincarnation', 'jewel', 'score', 'battles', 'ruins', 'hard', 'encounter'];

// ─── Read Character.xlsx ─────────────────────────────────
const charWb = XLSX.readFile('Character.xlsx');
const charRows = XLSX.utils.sheet_to_json(charWb.Sheets[charWb.SheetNames[0]], { header: 1 });
const characters = [];
for (const r of charRows) {
  if (!r || r[0] === undefined || r[0] === '' || r[0] === 'Id') continue;
  const id = parseInt(r[0]);
  const name = String(r[1] || '').trim();
  const enName = String(r[2] || '').trim();
  if (!name || !enName) continue;
  characters.push({ id, name, enName });
}
// Assign team
const teamById = {};
for (const [team, ids] of Object.entries(TEAMS)) {
  for (const id of ids) teamById[id] = team;
}
characters.forEach(c => { c.team = teamById[c.id] || '其他'; });
characters.sort((a, b) => a.id - b.id);

// ─── Parse BadgeReward.xlsx grouped by GroupLabel category ─
const bWb = XLSX.readFile('BadgeReward.xlsx');
const bRows = XLSX.utils.sheet_to_json(bWb.Sheets[bWb.SheetNames[0]], { header: 1 });
const perChar = {};   // enName -> { catKey: [{ v, num }] }
const charOrder = [];
for (const r of bRows) {
  if (!r || r[0] === undefined || r[0] === 'Id') continue;
  const en = String(r[6] || '').trim();
  if (!en || typeof r[5] !== 'number') continue;
  if (!perChar[en]) { perChar[en] = {}; charOrder.push(en); }
  const g = String(r[3] || '').trim();
  const parts = g.split('.');
  const type = parts[parts.length - 2];
  const val = parts[parts.length - 1];
  const cat = CAT_MAP[type];
  if (!cat) continue; // skip unknown rows
  (perChar[en][cat] = perChar[en][cat] || []).push({ v: val, num: r[5] });
}

// order each category: numeric values ascending; HardMode keeps sheet order
for (const en of Object.keys(perChar)) {
  for (const cat of Object.keys(perChar[en])) {
    const arr = perChar[en][cat];
    if (cat === 'hard') continue;
    arr.sort((a, b) => (Number(a.v) || 0) - (Number(b.v) || 0));
  }
}

// build checklist from first character's categories (all chars share the 9 cats)
const first = charOrder[0];
const checklist = [];
for (const cat of CAT_ORDER) {
  const items = perChar[first][cat];
  const isW = cat === 'score' || cat === 'encounter';
  const tiers = items.map(it => {
    if (isW) return `${Number(it.v)}w`;
    const n = Number(it.v);
    return isNaN(n) ? it.v : n;
  });
  checklist.push({ key: cat, label: CAT_LABEL[cat], tiers });
}

// User-specified display labels for these categories (position-aligned with the xlsx badge points:
// tier i ↔ the i-th smallest badge of that category). Lengths must match the xlsx-derived counts.
const USER_TIERS = {
  battles: [10, 100, 1000, 5000, 10000, 15000, 20000],
  encounter: ['1w', '2w', '4w', '6w', '8w', '10w'],
};
for (const c of checklist) {
  if (USER_TIERS[c.key]) {
    if (USER_TIERS[c.key].length !== c.tiers.length) {
      throw new Error(`USER_TIERS.${c.key} length mismatch: ${USER_TIERS[c.key].length} vs ${c.tiers.length}`);
    }
    c.tiers = USER_TIERS[c.key];
  }
}

// badgesByChar: catKey -> ordered points array (aligned to checklist tiers by value)
const badgesByChar = {};
for (const en of charOrder) {
  badgesByChar[en] = {};
  for (const cat of CAT_ORDER) {
    const catChecklist = checklist.find(c => c.key === cat);
    const tiers = catChecklist.tiers;
    const items = perChar[en][cat] || [];
    // build map: tier display value -> points
    const isW = cat === 'score' || cat === 'encounter';
    const pointMap = new Map(items.map(it => {
      const display = isW ? `${Number(it.v)}w` : (isNaN(Number(it.v)) ? it.v : Number(it.v));
      return [display, it.num];
    }));
    // For categories with user-specified display labels (battles/encounter), align points BY POSITION
    // (tier i ↔ the i-th smallest badge of that category) since the labels differ from xlsx values.
    badgesByChar[en][cat] = USER_TIERS[cat]
      ? items.map(it => it.num)
      : tiers.map(t => pointMap.get(t) ?? 0);
  }
}

const tierOrder = [];
for (const c of checklist) for (const t of c.tiers) tierOrder.push(`${c.key}:${t}`);

const totalTiers = tierOrder.length;

// ─── Output ──────────────────────────────────────────────
const output = {
  characters, teams: TEAMS, checklist, tierOrder,
  badgesByChar, charOrder, jewels: JEWELS,
  jewelGroups,
  rankThresholds: RANK_THRESHOLDS, totalTiers,
};
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/medalData.json', JSON.stringify(output));
console.log(`medalData.json: ${characters.length} chars, ${totalTiers} tiers, ${charOrder.length} charOrder`);
for (const c of checklist) console.log(`  ${c.key}: ${c.tiers.length} tiers ${c.tiers.join(',')}`);
