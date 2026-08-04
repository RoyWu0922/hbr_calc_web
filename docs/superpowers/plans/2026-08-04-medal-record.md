# 勋章&宝玉记录表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level 「勋章&宝玉记录表」 page tracking per-character HBR badge (勋章, 66 tiers across 9 categories → auto Rank 1–15) and jewel (宝玉, 19 types, mastery 0–100) progress, persisted to localStorage.

**Architecture:** A Node generator (`scripts/gen-medal-data.mjs`) parses `BadgeReward.xlsx`/`Character.xlsx` **grouping badges by the `GroupLabel` category** (not sheet row order — categories interleave in the sheet) and emits `src/data/medalData.json` + typed `medalData.ts`. A `useMedalRecord` hook (localStorage) holds per-char `done[]` tier indices + jewel masteries; pure helpers in `medalCalc.ts` compute Rank/rank-progress/jewel-progress. UI is a new `MedalRecord/` folder: page shell (overall progress + filter/sort bar) → `BadgeChecklist` (character card grid, expandable per-char checklist) and `JewelMatrix` (char × 19 matrix with checkbox+slider cells). Navigation added to `App.tsx` as a new primary tab with 勋章/宝玉 sub-tabs.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + `xlsx` (already a dependency). No test runner exists — verification is `npm run build` (tsc -b) + generator self-assertions + browser manual checks.

## Global Constraints

- **Badge→tier mapping is by GroupLabel category**, never by sheet row order. Sheet order is only used for `charOrder` (default sort).
- **Tier values & points come from BadgeReward.xlsx** (user confirmed xlsx wins). 打分 has **13** tiers incl. 120w; 战斗次数 = [1,10,100,500,1000,1500,2000]; 异时层 = 11 real boss names. Total 66 tiers.
- Rank thresholds (rank → cumulative points): 1:0, 2:500, 3:1500, 4:3000, 5:5000, 6:7500, 7:10500, 8:14000, 9:18000, 10:22500, 11:27500, 12:33000, 13:39000, 14:45500, 15:52500. Rank 15 = 「MAX」.
- All UI colors come from CSS variables (`--color-accent-r/g/b`, `--app-*`). No hardcoded hex in new components.
- Follow existing component idioms: `Toggle` (custom ✓ checkbox), `Field`/`.input-field`, `.card` glass, `InfoTip` where helpful. Do NOT restructure unrelated modules.
- **Never `git add -A`.** `BadgeReward.xlsx` / `Character.xlsx` are untracked personal data — do not commit them. Commit only the exact files listed in each task's commit step.
- Custom (user-added) characters get the default badge template = `badgesByChar[first char in characters]`; stored in localStorage, not in `medalData.json`.
- **Missing tiers:** 10 collab characters (AB联动/p5r联动) have NO 突破 category and only 4 等级 tiers; EAoi lacks 1 boss badge. In `badgesByChar` their missing tiers are `0`. No real badge has 0 points (min is 50), so `points[idx] === 0` reliably marks a missing tier. The UI renders all 66 slots, but missing ones show as an **empty/greyed non-clickable slot**; all completion denominators (per-char count, category sub-count, overall bar, progress filters) count **real badges only** (`points[idx] > 0`).

---

### Task 1: Regenerate data from xlsx — category-grouped badges

**Files:**
- Modify: `scripts/gen-medal-data.mjs`
- Modify: `tsconfig.app.json` (add `resolveJsonModule`)
- Create: `src/data/medalData.ts`
- Generate: `src/data/medalData.json` (script output)
- Test: `scripts/check-medal-data.mjs` (new, committed)

**Interfaces:**
- Consumes: `BadgeReward.xlsx` (columns: `[0]=Id, [3]=GroupLabel, [5]=Num, [6]=MasterLabel`), `Character.xlsx` (columns: `[0]=Id, [1]=name(中), [2]=enName(英)`).
- Produces: `medalData.json` shape → typed in `src/data/medalData.ts`:
  ```ts
  interface MedalCharacter { id: number; name: string; enName: string; team: string }
  interface ChecklistCat { key: string; label: string; tiers: Array<string | number> }
  interface MedalData {
    characters: MedalCharacter[];            // 61, id order
    teams: Record<string, number[]>;
    checklist: ChecklistCat[];               // 9 categories, fixed order
    tierOrder: string[];                     // 66 flattened "catKey:display"
    badgesByChar: Record<string, Record<string, number[]>>; // enName → catKey → points (aligned to checklist)
    charOrder: string[];                     // 61 enNames, BadgeReward.xlsx first-seen order
    jewels: string[];                        // 19
    rankThresholds: number[];                // 15 entries
    totalTiers: number;                      // 66
  }
  export const medalData: MedalData;
  ```

- [ ] **Step 1: Rewrite `scripts/gen-medal-data.mjs`**

Replace the body after the existing constants. Keep `TEAMS`, `JEWELS`, `RANK_THRESHOLDS`. Remove the hardcoded `CHECKLIST` (derive it from xlsx). New logic:

```js
const CAT_MAP = {
  CLv: 'level', BreakStyleLimit: 'breakthrough', ReincarnationCount: 'reincarnation',
  LearnedGateBossSkillCount: 'jewel', ScoreAttackHighScore: 'score', BattleClearCount: 'battles',
  ExpeditionStartedCount: 'ruins', HardMode: 'hard', WaveBattleHighScore: 'encounter',
};
const CAT_LABEL = {
  level: '等级', breakthrough: '突破', reincarnation: '转生', jewel: '宝玉', score: '打分',
  battles: '战斗次数', ruins: '废域', hard: '异时层', encounter: '遭遇战',
};
const CAT_ORDER = ['level','breakthrough','reincarnation','jewel','score','battles','ruins','hard','encounter'];

// parse badges grouped by MasterLabel then by GroupLabel category
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
  const tiers = items.map(it => isW ? `${Number(it.v)}w` : it.v);
  checklist.push({ key: cat, label: CAT_LABEL[cat], tiers });
}

// badgesByChar: catKey -> ordered points array
const badgesByChar = {};
const hardTiers = checklist.find(c => c.key === 'hard').tiers; // boss names
for (const en of charOrder) {
  badgesByChar[en] = {};
  for (const cat of CAT_ORDER) {
    badgesByChar[en][cat] = perChar[en][cat].map(it => it.num);
  }
  // align hard (boss) points to the checklist's boss order — sheet order may differ per char
  const bossMap = new Map(perChar[en].hard.map(it => [it.v, it.num]));
  badgesByChar[en].hard = hardTiers.map(name => bossMap.get(name));
}

const tierOrder = [];
for (const c of checklist) for (const t of c.tiers) tierOrder.push(`${c.key}:${t}`);

const totalTiers = tierOrder.length;
```

Keep the existing character/team parsing (characters from `Character.xlsx`, teams map, sort by id). Replace the output object with:

```js
const output = {
  characters, teams, checklist, tierOrder,
  badgesByChar, charOrder, jewels: JEWELS,
  rankThresholds: RANK_THRESHOLDS, totalTiers,
};
writeFileSync('src/data/medalData.json', JSON.stringify(output));
console.log(`medalData.json: ${characters.length} chars, ${totalTiers} tiers, ${charOrder.length} charOrder`);
for (const c of checklist) console.log(`  ${c.key}: ${c.tiers.length} tiers ${c.tiers.join(',')}`);
```

Run: `node scripts/gen-medal-data.mjs`
Expected: logs 61 chars, **66** tiers, each category count (7/4/5/6/13/7/7/11/6), charOrder length 61 (first `RKayamori`).

- [ ] **Step 2: Write assertion script `scripts/check-medal-data.mjs`**

```js
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('src/data/medalData.json', 'utf8'));
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
assert(d.characters.length === 61, '61 characters');
assert(d.totalTiers === 66, '66 tiers, got ' + d.totalTiers);
assert(d.charOrder.length === 61 && d.charOrder[0] === 'RKayamori', 'charOrder starts RKayamori');
assert(d.jewels.length === 19, '19 jewels');
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
// score category contains 120w, battles values are 1..2000
const score = d.checklist.find(c => c.key === 'score');
assert(score.tiers.includes('120w'), 'score includes 120w');
const battles = d.checklist.find(c => c.key === 'battles');
assert(JSON.stringify(battles.tiers) === JSON.stringify([1,10,100,500,1000,1500,2000]), 'battles values');
console.log('medal data OK: 61 chars, 66 tiers, category alignment verified');
```

Run: `node scripts/check-medal-data.mjs`
Expected: prints `medal data OK: ...` and exits 0.

- [ ] **Step 3: Add `resolveJsonModule` to `tsconfig.app.json`**

In `tsconfig.app.json` `compilerOptions`, add:
```json
"resolveJsonModule": true
```

- [ ] **Step 4: Create `src/data/medalData.ts`**

```ts
import raw from './medalData.json';

export interface MedalCharacter { id: number; name: string; enName: string; team: string }
export interface ChecklistCat { key: string; label: string; tiers: Array<string | number> }
export interface MedalData {
  characters: MedalCharacter[];
  teams: Record<string, number[]>;
  checklist: ChecklistCat[];
  tierOrder: string[];
  badgesByChar: Record<string, Record<string, number[]>>;
  charOrder: string[];
  jewels: string[];
  rankThresholds: number[];
  totalTiers: number;
}

export const medalData = raw as unknown as MedalData;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: compiles with no errors (`tsc -b` type-checks `medalData.ts`).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-medal-data.mjs scripts/check-medal-data.mjs src/data/medalData.json src/data/medalData.ts tsconfig.app.json
git commit -m "feat(medal): generate 66-tier badge data grouped by GroupLabel category"
```

---

### Task 2: Pure calc helpers — `src/utils/medalCalc.ts`

**Files:**
- Create: `src/utils/medalCalc.ts`
- Test: verify via `npm run build` + browser (no test runner); logic mirrors Task 1 data.

**Interfaces:**
- Consumes: `MedalData` from `src/data/medalData`, `CharMedalRecord`/`MedalRecord` from `src/utils/medalStorage`.
- Produces:
  ```ts
  export interface RankInfo { rank: number; sum: number; isMax: boolean; into: number; span: number; toNext: number | null }
  export function calcRankInfo(sum: number, thresholds: number[]): RankInfo;
  export function tierPointsForChar(data: MedalData, enName: string): number[];   // 66 pts; falls back to data.characters[0]
  export function charBadgeSummary(done: number[], points: number[]): { sum: number; count: number; total: number };
  export function charJewelSummary(jewels: Record<string, number>, jewelCount: number): { learned: number; sum: number; total: number };
  ```

- [ ] **Step 1: Write `src/utils/medalCalc.ts`**

```ts
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

export function charBadgeSummary(done: number[], points: number[]) {
  const sum = done.reduce((s, i) => s + (points[i] ?? 0), 0);
  const count = done.filter(i => (points[i] ?? 0) > 0).length; // completed real badges
  const total = points.filter(p => p > 0).length;               // real badges this char has (missing tiers are 0)
  return { sum, count, total };
}

export function charJewelSummary(jewels: Record<string, number>, jewelCount: number) {
  let learned = 0, sum = 0;
  for (let i = 0; i < jewelCount; i++) {
    const v = jewels[String(i)] ?? 0;
    if (v >= 100) learned++;
    sum += v;
  }
  return { learned, sum, total: jewelCount };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/medalCalc.ts
git commit -m "feat(medal): pure helpers for rank, badge, and jewel summaries"
```

---

### Task 3: Extend storage — custom characters + record helpers

**Files:**
- Modify: `src/utils/medalStorage.ts`
- Test: `npm run build`.

**Interfaces:**
- Consumes: existing `CharMedalRecord`, `MedalRecord`, `useMedalRecord` (toggleTier/setJewel/setJewelsForChar/resetChar).
- Produces (additions):
  ```ts
  export interface MedalCharacter { id: number; name: string; enName: string; team: string }
  export function loadCustomChars(): MedalCharacter[];
  export function useMedalRecord(): {
    record: MedalRecord;
    toggleTier(charId: number, tierIdx: number): void;
    setJewel(charId: number, jewelIdx: number, value: number): void;
    setJewelsForChar(charId: number, jewels: Record<string, number>): void;
    resetChar(charId: number): void;
    customChars: MedalCharacter[];
    addCharacter(name: string, team: string): void;
    removeCharacter(charId: number): void;
  }
  ```

- [ ] **Step 1: Add custom-char storage + hook fields**

Append to `src/utils/medalStorage.ts` (import `MedalCharacter` from `../data/medalData` — do NOT redefine it):

```ts
import type { MedalCharacter } from '../data/medalData';
export type { MedalCharacter };

const CUSTOM_KEY = 'hbr_medal_custom_chars';

export function loadCustomChars(): MedalCharacter[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return JSON.parse(raw) as MedalCharacter[];
  } catch { /* ignore */ }
  return [];
}

function saveCustomChars(list: MedalCharacter[]) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
```

Update `useMedalRecord` to also manage `customChars`:

```ts
export function useMedalRecord() {
  const [record, setRecord] = useState<MedalRecord>(loadMedalRecord);
  const [customChars, setCustomChars] = useState<MedalCharacter[]>(loadCustomChars);
  // ... existing toggleTier / setJewel / setJewelsForChar / resetChar unchanged ...

  const addCharacter = useCallback((name: string, team: string) => {
    setCustomChars(prev => {
      const nextId = prev.length === 0 ? -1 : Math.min(...prev.map(c => c.id)) - 1;
      const next: MedalCharacter[] = [...prev, { id: nextId, name, enName: `Custom${nextId}`, team: team || '其他' }];
      saveCustomChars(next);
      return next;
    });
  }, []);

  const removeCharacter = useCallback((charId: number) => {
    setCustomChars(prev => {
      const next = prev.filter(c => c.id !== charId);
      saveCustomChars(next);
      return next;
    });
    setRecord(prev => {
      const next = { ...prev };
      delete next[String(charId)];
      save(next);
      return next;
    });
  }, []);

  return { record, toggleTier, setJewel, setJewelsForChar, resetChar, customChars, addCharacter, removeCharacter };
}
```

Note: `useState` is already imported; add `useCallback` to the import (`import { useState, useCallback } from 'react'`).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/medalStorage.ts
git commit -m "feat(medal): custom character add/remove in medal storage"
```

---

### Task 4: RankArc component (SVG progress arc)

**Files:**
- Create: `src/components/MedalRecord/RankArc.tsx`
- Test: `npm run build` + visual in browser later.

**Interfaces:**
- Consumes: nothing (pure presentational).
- Produces:
  ```tsx
  interface RankArcProps { rank: number; isMax: boolean; into: number; span: number; size?: number }
  export default function RankArc(props: RankArcProps): JSX.Element;
  ```

- [ ] **Step 1: Write `RankArc.tsx`**

```tsx
interface RankArcProps {
  rank: number;
  isMax: boolean;
  into: number;
  span: number;
  size?: number;
}

export default function RankArc({ rank, isMax, into, span, size = 64 }: RankArcProps) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = isMax ? 1 : Math.min(1, Math.max(0, into / span));
  return (
    <div className="rank-arc" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.15)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="rank-arc-label">
        <span className="rank-arc-rank">{isMax ? 'MAX' : `R${rank}`}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MedalRecord/RankArc.tsx
git commit -m "feat(medal): RankArc SVG progress component"
```

---

### Task 5: BadgeChecklist — character cards + expandable checklist

**Files:**
- Create: `src/components/MedalRecord/BadgeChecklist.tsx`
- Test: `npm run build` + browser.

**Interfaces:**
- Consumes: `MedalData` (`.characters`, `.checklist`), `MedalRecord`/`CharMedalRecord` from storage, `tierPointsForChar`, `calcRankInfo`, `charBadgeSummary`, `RankArc`. `useState` for expand state.
- Produces:
  ```tsx
  interface BadgeChecklistProps {
    data: MedalData;
    record: MedalRecord;
    visibleChars: MedalCharacter[];   // already filtered+sorted by shell
    toggleTier: (charId: number, tierIdx: number) => void;
    removeCharacter: (charId: number) => void;
  }
  export default function BadgeChecklist(props: BadgeChecklistProps): JSX.Element;
  ```

- [ ] **Step 1: Write `BadgeChecklist.tsx`**

Render a responsive grid (`grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) of character cards. Each card (collapsible via local `expanded` state, default collapsed):

```tsx
import { useState } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import type { MedalRecord } from '../../utils/medalStorage';
import { tierPointsForChar, calcRankInfo, charBadgeSummary } from '../../utils/medalCalc';
import RankArc from './RankArc';

interface BadgeChecklistProps {
  data: MedalData;
  record: MedalRecord;
  visibleChars: MedalCharacter[];
  toggleTier: (charId: number, tierIdx: number) => void;
  removeCharacter: (charId: number) => void;
}

function CharCard({ data, record, ch, toggleTier, removeCharacter }: {
  data: MedalData; record: MedalRecord; ch: MedalCharacter;
  toggleTier: (charId: number, tierIdx: number) => void; removeCharacter: (charId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rec = record[String(ch.id)] || { done: [], jewels: {} };
  const points = tierPointsForChar(data, ch.enName);
  const { sum, count, total } = charBadgeSummary(rec.done, points);
  const rank = calcRankInfo(sum, data.rankThresholds);
  const isCustom = ch.id < 0;
  return (
    <div className="card p-3">
      <button className="flex items-center gap-3 w-full text-left" onClick={() => setExpanded(e => !e)}>
        <RankArc rank={rank.rank} isMax={rank.isMax} into={rank.into} span={rank.span} size={56} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate" style={{ color: 'var(--app-text-primary)' }}>{ch.name}</div>
          <div className="text-xs text-text-muted">
            <span className="inline-block px-1.5 py-0.5 rounded bg-bg-card border border-white/10 mr-1.5">{ch.team}</span>
            {rank.isMax ? '已完成全部勋章' : `距 R${rank.rank + 1} 还差 ${rank.toNext} 分`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-accent">{count}/{total}</div>
          <div className="text-[10px] text-text-muted">{total ? Math.round(count / total * 100) : 0}%</div>
        </div>
        {isCustom && (
          <button className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); removeCharacter(ch.id); }}>删除</button>
        )}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          {data.checklist.map(cat => {
            const catOffset = data.tierOrder.findIndex(t => t.startsWith(`${cat.key}:`));
            const catTotal = cat.tiers.filter((_, j) => points[catOffset + j] > 0).length;
            const catDone = cat.tiers.filter((_, j) => points[catOffset + j] > 0 && rec.done.includes(catOffset + j)).length;
            return (
              <div key={cat.key} className="rounded-lg border border-white/10 p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--app-text-primary)' }}>{cat.label}</span>
                  <span className="text-[10px] text-text-muted">{catTotal ? `${catDone}/${catTotal}` : '—'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.tiers.map((t, j) => {
                    const idx = catOffset + j;
                    if (points[idx] <= 0) {
                      // missing tier for this character — empty/greyed slot
                      return <span key={String(t)} className="w-12 h-6 rounded-md border border-dashed border-white/10" />;
                    }
                    const on = rec.done.includes(idx);
                    return (
                      <button key={String(t)} onClick={() => toggleTier(ch.id, idx)}
                        className={`px-2 py-0.5 rounded-md text-xs border transition-all ${on
                          ? 'border-accent text-accent' : 'border-white/15 text-text-muted hover:border-white/30'}`}>
                        {String(t)}{on ? ` · ${points[idx]}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BadgeChecklist({ data, record, visibleChars, toggleTier, removeCharacter }: BadgeChecklistProps) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {visibleChars.map(ch => (
        <CharCard key={ch.id} data={data} record={record} ch={ch}
          toggleTier={toggleTier} removeCharacter={removeCharacter} />
      ))}
      {visibleChars.length === 0 && (
        <div className="card p-8 text-center text-text-muted col-span-full">没有符合筛选条件的角色</div>
      )}
    </div>
  );
}
```

Note: the design doc wanted each tier checkbox showing its point value; the pill shows `tier · points` only when checked to keep collapsed pills compact — checked state shows the earned points.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MedalRecord/BadgeChecklist.tsx
git commit -m "feat(medal): badge checklist character cards"
```

---

### Task 6: JewelMatrix — character × 19 jewel matrix

**Files:**
- Create: `src/components/MedalRecord/JewelMatrix.tsx`
- Test: `npm run build` + browser.

**Interfaces:**
- Consumes: `MedalData` (`.characters`, `.jewels`), `MedalRecord` from storage, `charJewelSummary`. `React.memo` for cell.
- Produces:
  ```tsx
  interface JewelMatrixProps {
    data: MedalData;
    record: MedalRecord;
    visibleChars: MedalCharacter[];
    setJewel: (charId: number, jewelIdx: number, value: number) => void;
  }
  export default function JewelMatrix(props: JewelMatrixProps): JSX.Element;
  ```

- [ ] **Step 1: Write `JewelMatrix.tsx`**

Sticky-header matrix inside a horizontal-scroll container (`overflow-x-auto`), left column = char name + learned x/19, then one column per jewel:

```tsx
import { memo } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import type { MedalRecord } from '../../utils/medalStorage';
import { charJewelSummary } from '../../utils/medalCalc';

interface JewelMatrixProps {
  data: MedalData;
  record: MedalRecord;
  visibleChars: MedalCharacter[];
  setJewel: (charId: number, jewelIdx: number, value: number) => void;
}

const JewelCell = memo(function JewelCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const learned = value >= 100;
  return (
    <td className="p-1.5 align-middle">
      <div className="flex flex-col items-center gap-0.5">
        <input type="checkbox" checked={learned}
          onChange={e => onChange(e.target.checked ? 100 : 0)}
          className="w-4 h-4" />
        <input type="range" min={0} max={100} step={1} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-16" style={{ accentColor: 'var(--color-accent)' }} />
        <span className={`text-[10px] leading-none ${learned ? 'text-accent' : 'text-text-muted'}`}>{value}</span>
      </div>
    </td>
  );
});

export default function JewelMatrix({ data, record, visibleChars, setJewel }: JewelMatrixProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="border-collapse min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-bg-card p-2 text-left text-xs text-text-muted border-r border-white/10">角色</th>
            {data.jewels.map(j => (
              <th key={j} className="p-2 text-xs font-medium text-text-muted whitespace-nowrap border-r border-white/10">{j}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleChars.map(ch => {
            const rec = record[String(ch.id)] || { done: [], jewels: {} };
            const { learned } = charJewelSummary(rec.jewels, data.jewels.length);
            return (
              <tr key={ch.id} className="border-t border-white/5">
                <td className="sticky left-0 z-10 bg-bg-card p-2 border-r border-white/10 whitespace-nowrap">
                  <span className="text-xs font-medium" style={{ color: 'var(--app-text-primary)' }}>{ch.name}</span>
                  <span className="text-[10px] text-text-muted ml-1.5">{learned}/{data.jewels.length}</span>
                </td>
                {data.jewels.map((_, j) => (
                  <JewelCell key={j} value={rec.jewels[String(j)] ?? 0}
                    onChange={v => setJewel(ch.id, j, v)} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {visibleChars.length === 0 && (
        <div className="p-8 text-center text-text-muted">没有符合筛选条件的角色</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MedalRecord/JewelMatrix.tsx
git commit -m "feat(medal): jewel mastery matrix"
```

---

### Task 7: Page shell — overall progress, filter/sort bar, add-character dialog

**Files:**
- Create: `src/components/MedalRecord/MedalRecord.tsx`
- Test: `npm run build` + browser.

**Interfaces:**
- Consumes: `medalData` from `../../data/medalData`, `useMedalRecord` from `../../utils/medalStorage`, `charBadgeSummary`/`charJewelSummary`/`tierPointsForChar`/`calcRankInfo`, `BadgeChecklist`, `JewelMatrix`.
- Produces:
  ```tsx
  export default function MedalRecord({ mode }: { mode: 'medal' | 'jewel' }): JSX.Element;
  ```

- [ ] **Step 1: Write `MedalRecord.tsx`**

Shell: overall progress card + filter/sort bar (team select, progress select, count min input, name search, sort select, 「+ 新增角色」button) + `BadgeChecklist` (mode==='medal') or `JewelMatrix` (mode==='jewel') + inline add-character mini-form.

```tsx
import { useMemo, useState } from 'react';
import { medalData } from '../../data/medalData';
import { useMedalRecord } from '../../utils/medalStorage';
import { tierPointsForChar, charBadgeSummary, charJewelSummary, calcRankInfo } from '../../utils/medalCalc';
import BadgeChecklist from './BadgeChecklist';
import JewelMatrix from './JewelMatrix';

type SortKey = 'default' | 'rank' | 'count' | 'team';
type ProgressKey = 'all' | 'none' | 'partial' | 'done' | 'min';

export default function MedalRecord({ mode }: { mode: 'medal' | 'jewel' }) {
  const { record, toggleTier, setJewel, customChars, addCharacter, removeCharacter } = useMedalRecord();
  const [team, setTeam] = useState('all');
  const [progress, setProgress] = useState<ProgressKey>('all');
  const [minCount, setMinCount] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('');

  const allChars = useMemo(() => [...medalData.characters, ...customChars], [customChars]);
  const orderBy = useMemo(() => new Map(medalData.charOrder.map((en, i) => [en, i])), []);

  const visibleChars = useMemo(() => {
    const ptsCache = new Map<number, number[]>();
    const pointsOf = (chId: number, enName: string) => {
      let p = ptsCache.get(chId);
      if (!p) { p = tierPointsForChar(medalData, enName); ptsCache.set(chId, p); }
      return p;
    };
    let list = allChars.filter(ch => {
      if (team !== 'all' && ch.team !== team) return false;
      if (query && !(ch.name.includes(query) || ch.enName.toLowerCase().includes(query.toLowerCase()))) return false;
      const rec = record[String(ch.id)] || { done: [], jewels: {} };
      const { count, total } = charBadgeSummary(rec.done, pointsOf(ch.id, ch.enName));
      if (progress === 'none' && count !== 0) return false;
      if (progress === 'partial' && (count === 0 || count === total)) return false;
      if (progress === 'done' && count !== total) return false;
      if (progress === 'min' && count < minCount) return false;
      return true;
    });
    const score = (ch: typeof allChars[number]) => {
      const rec = record[String(ch.id)] || { done: [], jewels: {} };
      if (mode === 'jewel') return charJewelSummary(rec.jewels, medalData.jewels.length).learned;
      return charBadgeSummary(rec.done, pointsOf(ch.id, ch.enName)).count;
    };
    if (sort === 'rank') {
      list = [...list].sort((a, b) => {
        const ra = calcRankInfo(charBadgeSummary(record[String(a.id)]?.done ?? [], pointsOf(a.id, a.enName)).sum, medalData.rankThresholds);
        const rb = calcRankInfo(charBadgeSummary(record[String(b.id)]?.done ?? [], pointsOf(b.id, b.enName)).sum, medalData.rankThresholds);
        return rb.rank - ra.rank;
      });
    } else if (sort === 'count') {
      list = [...list].sort((a, b) => score(b) - score(a));
    } else if (sort === 'team') {
      list = [...list].sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : a.name < b.name ? -1 : 1));
    } else {
      list = [...list].sort((a, b) => {
        const ai = orderBy.get(a.enName) ?? Number.MAX_SAFE_INTEGER;
        const bi = orderBy.get(b.enName) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }
    return list;
  }, [allChars, team, progress, minCount, query, sort, record, mode, orderBy]);

  const overall = useMemo(() => {
    let done = 0, totalValid = 0, learned = 0;
    for (const ch of allChars) {
      const rec = record[String(ch.id)] || { done: [], jewels: {} };
      const pts = tierPointsForChar(medalData, ch.enName);
      const bs = charBadgeSummary(rec.done, pts);
      done += bs.count; totalValid += bs.total;
      learned += charJewelSummary(rec.jewels, medalData.jewels.length).learned;
    }
    return {
      badgePct: totalValid ? Math.round(done / totalValid * 100) : 0,
      jewelPct: Math.round(learned / (allChars.length * medalData.jewels.length) * 100),
      done, totalValid, learned,
    };
  }, [allChars, record]);

  const teamOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const en of medalData.charOrder) {
      const ch = medalData.characters.find(c => c.enName === en);
      if (ch) seen.add(ch.team);
    }
    return Array.from(seen);
  }, []);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs text-text-muted mb-1">{mode === 'medal' ? '勋章完成度(整体)' : '宝玉习得度(整体)'}</div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.15)' }}>
              <div className="h-full rounded-full" style={{ width: `${mode === 'medal' ? overall.badgePct : overall.jewelPct}%`, background: 'var(--color-accent)' }} />
            </div>
            <div className="text-xs text-text-muted mt-1">
              {mode === 'medal' ? `${overall.done}/${overall.totalValid} 档完成` : `${overall.learned}/${allChars.length * medalData.jewels.length} 宝玉习得`}
            </div>
          </div>
          <button className="btn btn-accent btn-sm" onClick={() => setAdding(a => !a)}>+ 新增角色</button>
        </div>
        {adding && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="input-field flex-1 min-w-[160px]">
              <input placeholder="角色名(如:新角色)" value={newName} onChange={e => setNewName(e.target.value)} className="bg-transparent outline-none w-full" />
            </div>
            <select className="input-field" value={newTeam} onChange={e => setNewTeam(e.target.value)}>
              <option value="">队伍(可选)</option>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => { if (newName.trim()) { addCharacter(newName.trim(), newTeam); setNewName(''); setNewTeam(''); setAdding(false); } }}>添加</button>
          </div>
        )}
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <select className="input-field" value={team} onChange={e => setTeam(e.target.value)}>
          <option value="all">全部队伍</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input-field" value={progress} onChange={e => setProgress(e.target.value as ProgressKey)}>
          <option value="all">全部进度</option>
          <option value="none">未开始</option>
          <option value="partial">进行中</option>
          <option value="done">{mode === 'medal' ? '已满勋章' : '已全宝玉'}</option>
          <option value="min">完成 ≥ N 项</option>
        </select>
        {progress === 'min' && (
          <input type="number" min={0} className="input-field w-24" value={minCount}
            onChange={e => setMinCount(Number(e.target.value))} />
        )}
        <input className="input-field flex-1 min-w-[140px]" placeholder="搜索角色名" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="input-field" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="default">默认排序(BadgeReward)</option>
          <option value="rank">按 Rank 降序</option>
          <option value="count">{mode === 'medal' ? '按完成数降序' : '按习得数降序'}</option>
          <option value="team">按队伍+名字</option>
        </select>
      </div>

      {mode === 'medal'
        ? <BadgeChecklist data={medalData} record={record} visibleChars={visibleChars} toggleTier={toggleTier} removeCharacter={removeCharacter} />
        : <JewelMatrix data={medalData} record={record} visibleChars={visibleChars} setJewel={setJewel} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MedalRecord/MedalRecord.tsx
git commit -m "feat(medal): page shell with overall progress, filters, and add-character"
```

---

### Task 8: Navigation + styles

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Test: `npm run build` + browser (desktop header + mobile bottom nav).

**Interfaces:**
- Consumes: `MedalRecord` (`mode` prop). Extends `PrimaryTab` and `PRIMARY_TABS`.

- [ ] **Step 1: Add `medal` primary tab + sub-tabs to `src/App.tsx`**

Changes:
1. Type: `type PrimaryTab = 'damage' | 'white' | 'extra' | 'planner' | 'medal';`
2. New sub-tab state: `const [medalSubTab, setMedalSubTab] = useState<'badges' | 'jewels'>('badges');`
3. `PRIMARY_TABS` — add entry (after `planner`):
   ```tsx
   { key: 'medal', label: '勋章', fullLabel: '勋章记录', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="5"/><path d="M9 13l-1 6 2-1.5L12 19l-1-6"/><path d="M15.5 5.5a5 5 0 0 1 0 5"/><path d="M16 3.2A7 7 0 0 1 18 9a7 7 0 0 1-1.4 4.2"/></svg> },
   ```
4. Desktop sub-tab row (after the planner sub-tab block):
   ```tsx
   {primaryTab === 'medal' && (
     <div className="hidden md:flex gap-1 ml-2 border-l border-white/10 pl-3">
       <button onClick={() => setMedalSubTab('badges')} className={`sub-tab text-xs ${medalSubTab === 'badges' ? 'active' : ''}`}>勋章</button>
       <button onClick={() => setMedalSubTab('jewels')} className={`sub-tab text-xs ${medalSubTab === 'jewels' ? 'active' : ''}`}>宝玉</button>
     </div>
   )}
   ```
5. Mobile sub-tab scroll row: change condition to `(primaryTab === 'damage' || primaryTab === 'planner' || primaryTab === 'medal')`, and extend the ternary so `medal` renders its two buttons:
   ```tsx
   {primaryTab === 'damage' ? SUB_TABS.map(...) : primaryTab === 'planner' ? (
     <>...existing planner buttons...</>
   ) : (
     <>
       <button onClick={() => setMedalSubTab('badges')} className={`sub-tab text-xs ${medalSubTab === 'badges' ? 'active' : ''}`}>勋章</button>
       <button onClick={() => setMedalSubTab('jewels')} className={`sub-tab text-xs ${medalSubTab === 'jewels' ? 'active' : ''}`}>宝玉</button>
     </>
   )}
   ```
6. Content render (after planner block in `<main>`):
   ```tsx
   <div style={{ display: primaryTab === 'medal' && medalSubTab === 'badges' ? 'block' : 'none' }}>
     <MedalRecord mode="medal" />
   </div>
   <div style={{ display: primaryTab === 'medal' && medalSubTab === 'jewels' ? 'block' : 'none' }}>
     <MedalRecord mode="jewel" />
   </div>
   ```
7. Import: `import MedalRecord from './components/MedalRecord/MedalRecord';`
8. Mobile bottom nav: change `grid-cols-4` → `grid-cols-5`.

- [ ] **Step 2: Add styles to `src/index.css`**

Append (reuse existing vars; no hardcoded hues):

```css
/* ── MedalRecord ───────────────────────────── */
.rank-arc { position: relative; flex-shrink: 0; }
.rank-arc-label {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.rank-arc-rank { font-size: 16px; font-weight: 800; line-height: 1;
  color: var(--app-text-primary); letter-spacing: 0.02em; }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat(medal): wire 勋章记录 primary tab with 勋章/宝玉 sub-tabs"
```

---

### Task 9: End-to-end browser verification

**Files:**
- No code changes. Manual checklist (documented in spec §8).

- [ ] **Step 1: Run the app and verify**

```bash
npm run dev
```

Verify in browser (both desktop and mobile-width):
1. New 「勋章记录」 primary tab appears in the header (desktop) and bottom nav (mobile, 5 columns).
2. 勋章 sub-tab: overall progress bar shows 0%; character cards show `R1`, `0/66`, `0%`; first card is 茅森月歌 (RKayamori) under default sort.
3. Expand a card → 9 categories render with correct tier counts (7/4/5/6/13/7/7/11/6). Toggle a 等级 tier → the card's count/% and Rank update live; check the pill shows `100 · 50` etc.
4. Select all 66 tiers for one character → Rank shows `MAX`, arc full.
5. Filters: pick team 31A → only 31A chars; pick 未开始 → all shown (nothing checked); search `月歌` → 茅森月歌 only; sort 按 Rank 降序 reorders by rank.
6. 宝玉 sub-tab: matrix renders 19 columns; checking a cell → value 100 & learned count increments; dragging a slider to 55 → value 55; per-row `x/19` updates.
7. Reload page → all toggles/sliders persist (localStorage).
8. 新增角色: click + 新增角色, type a name, add → new card appears at end (default sort), can toggle its tiers and compute Rank; its card shows 删除 button; delete removes it and its record.
9. Theme: toggle 亮/暗色 + change accent color in settings → RankArc/checkboxes/progress use the new accent; wallpaper background still visible through glass cards.
10. `console` has no errors.

- [ ] **Step 2: Final verification**

Run: `node scripts/check-medal-data.mjs && npm run build`
Expected: both pass.

---

## Self-Review

**Spec coverage:**
- §2 data model (GroupLabel grouping, 66 tiers, xlsx tiers) → Task 1 ✅
- §3 Rank calc (thresholds, MAX, distance) → Task 2 `calcRankInfo` + Task 5 render ✅
- §4 storage incl. add/remove custom chars → Task 3 ✅
- §5.1 navigation (primary tab, sub-tabs, 5-col mobile) → Task 8 ✅
- §5.2 badge checklist (overall bar, filters/sort, cards, expandable cats, add/remove) → Tasks 5 & 7 ✅
- §5.3 jewel matrix (checkbox→100, slider 0–100, per-char learned, mobile scroll) → Tasks 6 & 7 ✅
- §6 styles via CSS vars → Tasks 4 & 8 ✅
- §8 verification → Tasks 1, 9 ✅

**Type consistency:** `MedalCharacter` defined in `medalData.ts` (Task 1) and re-exported by `medalStorage.ts` (Task 3) — both use the same 4-field shape; components import from `../../data/medalData`. `RankInfo` fields (`rank/isMax/into/span/toNext`) produced in Task 2, consumed in Tasks 4 & 5 identically. `useMedalRecord` return shape extended in Task 3, consumed in Tasks 5–7 matching.

**Placeholder scan:** every step has concrete code; no "TODO/implement later"; all function signatures referenced are defined in prior tasks.

**Known deviation from spec doc (intentional):** tier pills show the point value only when checked (compact collapsed cards); the add-character dialog is an inline expandable form rather than a modal — simpler, no new overlay component, same behavior.
