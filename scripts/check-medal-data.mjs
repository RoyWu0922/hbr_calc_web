import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('src/data/medalData.json', 'utf8'));
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
assert(d.characters.length === 61, '61 characters');
assert(d.totalTiers === 66, '66 tiers, got ' + d.totalTiers);
assert(d.charOrder.length === 61 && d.charOrder[0] === 'RKayamori', 'charOrder starts RKayamori');
assert(d.jewels.length === 19 && d.jewels[6] === '充填', '19 jewels, 充填 at idx 6');
assert(d.jewelGroups.length === 4, '4 jewel groups');
assert(JSON.stringify(d.jewelGroups.map(g => g.indices.length)) === JSON.stringify([5,5,5,4]), 'jewel group sizes 5,5,5,4');
assert(d.jewelGroups[0].label === '1期宝玉' && d.jewelGroups[3].label === '4期宝玉&其它', 'jewel group labels');
assert(d.rankThresholds.length === 15 && d.rankThresholds[14] === 52500, '15 rank thresholds');
assert(d.checklist.length === 9, '9 categories');
const counts = { level: 7, breakthrough: 4, reincarnation: 5, jewel: 6, score: 13, battles: 7, ruins: 7, hard: 11, encounter: 6 };
for (const c of d.checklist) assert(c.tiers.length === counts[c.key], `${c.key} has ${counts[c.key]} tiers`);
for (const en of d.charOrder) {
  let n = 0;
  for (const c of d.checklist) {
    const pts = d.badgesByChar[en][c.key];
    assert(Array.isArray(pts) && pts.length === c.tiers.length, `${en}.${c.key} length matches`);
    n += pts.length;
  }
  assert(n === 66, `${en} sums to 66`);
}
// battles/encounter use user-specified display labels, position-aligned — every tier must have points
for (const en of d.charOrder) {
  for (const catKey of ['battles', 'encounter']) {
    assert(d.badgesByChar[en][catKey].every(p => p > 0), `${en}.${catKey} all real (position-aligned)`);
  }
}
// score category contains 120w; battles/encounter use user-specified display labels
const score = d.checklist.find(c => c.key === 'score');
assert(score.tiers.includes('120w'), 'score includes 120w');
const battles = d.checklist.find(c => c.key === 'battles');
assert(JSON.stringify(battles.tiers) === JSON.stringify([10, 100, 1000, 5000, 10000, 15000, 20000]), 'battles values');
const encounter = d.checklist.find(c => c.key === 'encounter');
assert(JSON.stringify(encounter.tiers) === JSON.stringify(['1w', '2w', '4w', '6w', '8w', '10w']), 'encounter values');
console.log('medal data OK: 61 chars, 66 tiers, category alignment verified');
