# HBR Calc Web — Heaven Burns Red 伤害计算器

## Project Overview

A web-based damage calculator for the game **Heaven Burns Red (HBR)**, ported from Excel spreadsheets (Ori.xlsx, Copy-OD.xlsx, dmg calc.xlsx, stats calc.xlsx). Built with React + TypeScript + Vite + Tailwind CSS.

## Quick Start

```bash
cd /Users/nothing./VSCode/hbr_calc_web
npm run dev      # Dev server (auto-port if 5173 busy)
npm run build    # Production build to dist/
```

## Architecture

```
src/
├── types.ts                    # All TypeScript interfaces
├── engine/
│   ├── damage.ts               # Core damage/OD/break/score calculation engine
│   ├── skillDb.ts              # Built-in skill database (buff/debuff/weakness)
│   └── customSkills.ts         # localStorage-based custom skill CRUD + builtin overrides
├── components/
│   ├── DamageCalc/
│   │   ├── DamageCalculator.tsx # Main damage calculator (all inputs + sections)
│   │   └── DamageResult.tsx    # Results display + float probability viz (SVG)
│   ├── ExtraFeatures/
│   │   └── ExtraFeatures.tsx   # OD calc (Copy-OD method), Break calc (dmg calc method), Quick score
│   ├── WhiteStats/
│   │   └── WhiteStats.tsx      # Character base stat calculator (from stats calc.xlsx)
│   ├── SkillDb/
│   │   └── SkillDatabase.tsx   # Searchable skill database with inline editing
│   ├── History/
│   │   └── HistoryPage.tsx     # Calculation history (IndexedDB via idb)
│   └── (deleted) TurnPlanner/, Timeline/
├── utils/
│   └── storage.ts              # IndexedDB persistence layer
├── App.tsx                     # Navigation: 伤害计算/白值计算/额外功能
├── index.css                   # Global styles + iOS glass-morphism theme
└── main.tsx                    # Entry point
```

## Navigation Structure

Three primary tabs:
- **伤害计算** (sub: 伤害计算 | 技能库 | 计算历史)
- **白值计算** (character stat calculator)
- **额外功能** (OD calculator, Break calculator, Quick score)

## Key Design Decisions

### Glass-morphism UI
- All cards/inputs/buttons use `backdrop-filter: blur()` with translucent backgrounds
- Dark theme (`#0a0e1a` base)
- Custom checkbox toggles with blue ✓ checkmark (no native checkboxes)
- Toggle fix: uses `onClick={() => onChange(!value)}` on container div

### Calculation Engine (`engine/damage.ts`)
- **Skill power**: 3-zone interpolation based on stat differential (min/max power × skill level scaling)
- **Orb power**: Multi-zone formula with orb threshold
- **Over-diff power**: `currentPower × 25/10000 × excess`
- **Buff/Debuff/Weakness**: Per-skill calculations with base/orb/over-diff power × layers × passive
- **Attenuation**: `IF(dmg > 1e9, 2e9 - EXP(0.7 - 0.7×dmg/1e9) × 1e9, dmg)`
- **Score**: `coeff × (threshold × ln(dmg/threshold) + threshold)` + base + shield
- **OD** (Copy-OD method): Earring coefficient + target OD rate + targets + infant/resist/normal atk
- **Break** (dmg calc method): Per-hit DR calculation with chain hit distribution

### Float Probability Visualization
- SVG-based normal distribution PDF
- μ=1.0, σ=0.2/√(12×totalHits)
- Hover interaction with coordinate mapping via `getBoundingClientRect()`
- Chain hit inputs below chart (50%/25%/12%/6% multipliers matching break calc)

### Skill Database
- Built-in skills from hbr.quest (BUFF_SKILLS, DEBUFF_SKILLS, WEAKNESS_SKILLS)
- Custom skills stored in localStorage
- Built-in skill edits stored as overrides in localStorage
- Inline editing: clicking edit turns table row cells into input fields

### History
- IndexedDB via `idb` library
- Table display: label, difficulty, turns, damage, damage score, total score, time, actions

## Source Spreadsheets

- `Ori.xlsx` — Original damage calculator (4 sheets: 伤害计算, 技能lookup表, 排轴, 简轴)
- `Copy-OD.xlsx` — OD rate calculator (2 sheets, v2 has corrected formula)
- `dmg calc.xlsx` — Break/DR calculator with per-hit distribution
- `stats calc.xlsx` — Character stat calculator (全角色白值成长, AS/SS通用白值)

## CSS Classes Reference

| Class | Usage |
|---|---|
| `.card` | Glass card container |
| `.card-header` | Section title |
| `.input-field` | Glass input/select |
| `.input-label` | Field label |
| `.btn / .btn-primary / .btn-secondary / .btn-danger` | Buttons |
| `.btn-sm / .btn-xs` | Small button sizes |
| `.nav-tab / .nav-tab.active` | Navigation tabs |
| `.glass-row` | Skill row container |
| `.glass-header` | Sticky header |

## Common Patterns

### Adding a new section
Wrap in `CollapsibleSection` with title (can be JSX):
```tsx
<CollapsibleSection title={<span>标题 <InfoTip id="key" /></span>} defaultOpen>
  ...content...
</CollapsibleSection>
```

### Info tooltips
Use `InfoTip` with hover-triggered popup. Add text to `INFO_NOTES` map:
```tsx
<InfoTip id="buff" />  // shows buff reference info on hover
```

### Toggle (checkmark)
```tsx
<Toggle label="标签" value={bool} onChange={v => setter(v)} />
```

### Number field
```tsx
<Field label="标签" value={num} onChange={v => setter(v)} step={0.1} />
```

## Known Caveats

- Calculation auto-triggers via `useEffect` on any input change (no manual "calculate" button needed)
- Custom skill DB edits persist in localStorage only
- History entries are local (IndexedDB), no cloud sync
- The WhiteStats page uses a simplified growth formula with extracted character data from the spreadsheet
- Float probability assumes per-hit uniform [0.9, 1.1] distribution → normal approximation via CLT
