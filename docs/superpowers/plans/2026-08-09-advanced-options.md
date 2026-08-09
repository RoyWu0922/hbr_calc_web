# 进阶选项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在伤害计算器「保存为默认值」左侧新增「进阶选项」下拉栏，支持隐藏全部白值加成填写框、手动填写技能（技能差值/min/max），并修复历史加载漏恢复连击/破坏/OD/浮动/垫刀的问题。

**Architecture:** 新增 `engine/advancedOptions.ts` 管理跨会话持久化的两个布尔选项；`DamageCalculator.tsx` 持有选项状态、渲染下拉栏、计算时构造 zeroed 副本（白值加成按 0 处理）；`SkillListCard`/`SkillParamsSection` 通过 props 接收 `hideWhiteBonus` 与 `manualSkill` 调整渲染与行内预览计算。

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind。无测试框架，验证手段为 `npm run build`（tsc 类型检查 + vite 构建）与 `npm run dev` 手动验证。

## Global Constraints

- 无新增依赖（不引入测试框架、不引入 UI 库）。
- 复用现有组件：`Num`（数字框）、`Toggle`/蓝勾复选框样式、TurnPlanner 下拉面板模式。
- 白值加成隐藏时**计算按 0**，但底层 state 保留原值（取消勾选恢复）。
- 进阶选项不进分享码、不进历史 input（保存的是 zeroed 数值）。
- 持久化 key：`hbr_calc_advanced_options`，独立于 `hbr_calc_user_defaults`。
- breakMul 状态为 %（如 300 = 300%），历史 input 存储 `breakMul / 100`；加载时 `d.breakMul < 50 ? d.breakMul * 100 : d.breakMul` 迁移。

---

### Task 1: 新增 advancedOptions.ts（状态类型 + 持久化）

**Files:**
- Create: `src/engine/advancedOptions.ts`

**Interfaces:**
- Produces:
  - `export interface AdvancedOptions { hideWhiteBonus: boolean; manualSkill: boolean }`
  - `export function loadAdvancedOptions(): AdvancedOptions`
  - `export function saveAdvancedOptions(opts: AdvancedOptions): void`

- [ ] **Step 1: 创建文件**

写入以下完整内容：

```ts
/** 伤害计算器进阶选项（跨会话持久化，独立于 userDefaults） */
export interface AdvancedOptions {
  hideWhiteBonus: boolean; // 隐藏全部白值加成填写框
  manualSkill: boolean;    // 取消下拉选技能，手动填写技能名 + 差值/min/max
}

const STORAGE_KEY = 'hbr_calc_advanced_options';
const DEFAULT_OPTIONS: AdvancedOptions = { hideWhiteBonus: false, manualSkill: false };

export function loadAdvancedOptions(): AdvancedOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw);
    return {
      hideWhiteBonus: parsed.hideWhiteBonus === true,
      manualSkill: parsed.manualSkill === true,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveAdvancedOptions(opts: AdvancedOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
  } catch {
    // localStorage full/unavailable — silently ignore
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 构建成功（tsc 无类型错误，vite 产出 dist/）。

- [ ] **Step 3: 提交**

```bash
git add src/engine/advancedOptions.ts
git commit -m "feat: 进阶选项持久化模块"
```

---

### Task 2: 接入状态 + 下拉栏 UI

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`

**Interfaces:**
- Consumes: `loadAdvancedOptions`, `saveAdvancedOptions`, `AdvancedOptions` from `../../engine/advancedOptions`
- Produces: 组件内 `advanced` state、`showAdvanced` state、持久化 effect；头部下拉栏 UI

- [ ] **Step 1: 引入模块与状态**

在 `DamageCalculator.tsx` 顶部 import 区（`saveUserDefaults` 那一行附近）加：

```ts
import { loadAdvancedOptions, saveAdvancedOptions } from '../../engine/advancedOptions';
```

在组件内 state 声明区（`const [loadedEntryId, ...]` 之后）加：

```tsx
const [advanced, setAdvanced] = useState(loadAdvancedOptions);
const [showAdvanced, setShowAdvanced] = useState(false);
```

并在已有的 `useEffect(() => { runCalc(); }, [runCalc]);` 之后加持久化 effect：

```tsx
useEffect(() => { saveAdvancedOptions(advanced); }, [advanced]);
```

- [ ] **Step 2: 添加下拉栏按钮**

找到头部第二排按钮组（当前为）：

```tsx
<div className="flex gap-1.5 items-center ml-auto">
  <button className="btn btn-primary btn-xs" onClick={handleSaveDefaults} ...>
```

在 `保存为默认值` 按钮**之前**插入下拉栏（`ml-auto` 容器内、最左侧）：

```tsx
<div className="relative">
  <button className={`btn btn-xs px-2 ${showAdvanced ? 'btn-primary' : 'btn-secondary'}`}
    onClick={() => setShowAdvanced(o => !o)} title="进阶选项">
    进阶选项
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><path d="M6 9l6 6 6-6"/></svg>
  </button>
  {showAdvanced && (
    <div className="absolute right-0 top-full mt-1 z-30 rounded-lg border p-2 flex flex-col gap-1.5 min-w-[150px] shadow-lg"
      style={{ background: 'var(--app-bg)', borderColor: 'var(--app-glass-border)' }}>
      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-text-muted"
        onClick={() => setAdvanced(a => ({ ...a, hideWhiteBonus: !a.hideWhiteBonus }))}>
        <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${advanced.hideWhiteBonus ? 'bg-accent border-accent' : 'toggle-off'}`}>
          {advanced.hideWhiteBonus && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        隐藏全部白值加成填写框
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-text-muted"
        onClick={() => setAdvanced(a => ({ ...a, manualSkill: !a.manualSkill }))}>
        <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${advanced.manualSkill ? 'bg-accent border-accent' : 'toggle-off'}`}>
          {advanced.manualSkill && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        手动填写技能
      </label>
    </div>
  )}
</div>
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证（dev server）**

Run: `npm run dev`
Expected: 头部「保存为默认值」左侧出现「进阶选项」按钮；点击展开两个复选框；勾选/取消后刷新页面状态保持；点击按钮可收起面板。

- [ ] **Step 5: 提交**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "feat: 进阶选项下拉栏UI"
```

---

### Task 3: 功能一 — 隐藏全部白值加成填写框（计算按 0）

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`

**Interfaces:**
- Consumes: `advanced.hideWhiteBonus`
- Produces: 组件内 `effInput`（zeroed 副本，类型 `DamageInput`），供 runCalc/handleSave/handleShare 使用；向 `SkillParamsSection`/`SkillListCard` 传 `hideWhiteBonus` prop

- [ ] **Step 1: 构造 zeroed 副本 effInput**

在 `updateSkill` 定义之后（`const updateScore = ...` 附近）加 `useMemo`：

```tsx
const effInput: DamageInput = useMemo(() => {
  const base = {
    stats, equipment, bonus, od, break_: breakParams, score,
    chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg,
    superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr,
  };
  if (!advanced.hideWhiteBonus) {
    return { ...base, skill, buffs, debuffs, weaknesses };
  }
  return {
    ...base,
    skill: { ...skill, whiteBonus: 0 },
    buffs: buffs.map(b => ({ ...b, moraleFighting: 0 })),
    debuffs: debuffs.map(d => ({ ...d, moraleDebuffs: 0 })),
    weaknesses: weaknesses.map(w => ({ ...w, moraleDebuffs: 0 })),
  };
}, [advanced.hideWhiteBonus, skill, stats, buffs, debuffs, weaknesses,
    equipment, bonus, od, breakParams, score, chainMul, breakMul, odMul, floatVal, bonusDmg,
    superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr]);
```

确认 `DamageInput` 已在文件顶部 import（当前第 5 行已有）。如果 `stats`/`equipment` 等在 useMemo 中没有 setter，仍保留在依赖里（类型上是 state）。

- [ ] **Step 2: runCalc / handleSave / handleShare 改用 effInput**

将 `runCalc` 改为：

```tsx
const runCalc = useCallback(() => {
  const r = calculateAll(effInput);
  setResult(r);
}, [effInput]);
```

将 `handleSave` 内的 input 构造行：

```tsx
const input = { skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, break_: breakParams, score, chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg, superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr };
```

替换为：

```tsx
const input = effInput;
```

`handleShare` 内的同名 input 构造行做同样替换（`const input = effInput;`）。`handleShare` 中 `encodeShareData(input)` 保持不变。

- [ ] **Step 3: SkillParamsSection 隐藏 whiteBonus 字段**

`SkillParamsSection` 组件签名（当前第 452-454 行）加 prop：

```tsx
function SkillParamsSection({ skill, updateSkill, result, hideWhiteBonus }: {
  skill: SkillInput; updateSkill: (k: keyof SkillInput, v: unknown) => void;
  result: DamageResultData | null; hideWhiteBonus?: boolean;
}) {
```

将白值加成 `Field`（当前第 460 行）包上条件：

```tsx
{!hideWhiteBonus && (
  <Field label="白值加成(包括士气, 灾厄等)（有-100的话请在这+50）" value={skill.whiteBonus} onChange={v => updateSkill('whiteBonus', v)} />
)}
```

- [ ] **Step 4: 调用处传 hideWhiteBonus prop**

`SkillParamsSection` 调用处（当前第 313 行）：

```tsx
<SkillParamsSection skill={skill} updateSkill={updateSkill} result={result} hideWhiteBonus={advanced.hideWhiteBonus} />
```

`SkillListCard` 三个调用处（当前第 316-334 行）都加 prop：

```tsx
<SkillListCard ... hideWhiteBonus={advanced.hideWhiteBonus} />
```

（`...` 为现有各段参数，逐一追加 `hideWhiteBonus={advanced.hideWhiteBonus}`。）

- [ ] **Step 5: SkillListCard 内部 — 行内预览用 zeroed 副本 + 隐藏白值加成输入**

`SkillListCard` 组件签名（当前第 498-502 行）加 props：

```tsx
function SkillListCard({ skills, lookup, onUpdate, onAdd, onRemove, type, enemyAttr, hideWhiteBonus = false, manualSkill = false }: {
  skills: any[]; lookup: any[]; onUpdate: (i: number, s: any) => void;
  onAdd: () => void; onRemove: (i: number) => void; type: 'buff' | 'debuff' | 'weakness';
  enemyAttr: number; hideWhiteBonus?: boolean; manualSkill?: boolean;
}) {
```

将 `calcPower` / `calcDetail`（当前第 506-513 行）改为先构造 zeroed 副本再计算：

```tsx
const calcSkill = (sk: any) => hideWhiteBonus
  ? (isBuff ? { ...sk, moraleFighting: 0 } : { ...sk, moraleDebuffs: 0 })
  : sk;

const calcPower = (sk: any) => {
  const cs = calcSkill(sk);
  if (!cs.name || !cs.maxPower) return 0;
  return isBuff ? calcBuffPower(cs) : calcDebuffPower(cs, enemyAttr);
};
const calcDetail = (sk: any) => {
  const cs = calcSkill(sk);
  if (!cs.name || !cs.maxPower) return null;
  return isBuff ? calcBuffPowerDetail(cs) : calcDebuffPowerDetail(cs, enemyAttr);
};
```

将白值加成 `Num`（当前第 543-544 行）包上条件隐藏：

```tsx
{!hideWhiteBonus && (
  <Num label={isBuff ? '白值加成' : '白值加成(包括士气, 灾厄等)'} value={isBuff ? skill.moraleFighting : skill.moraleDebuffs}
    onChange={v => { const u: any = { ...skill }; if (isBuff) u.moraleFighting = v; else u.moraleDebuffs = v; onUpdate(i, u); }} />
)}
```

- [ ] **Step 6: 验证编译**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 7: 手动验证（dev server）**

Run: `npm run dev`
Expected:
- 勾选「隐藏全部白值加成填写框」→ 技能参数区的白值加成输入框、每条技能的「白值加成」输入框全部消失。
- 填入白值加成数值后勾选隐藏 → 行内「结果」与最终伤害变为按 0 计算的值；取消勾选 → 数值与结果恢复原值。
- 保存到历史后加载 → 伤害结果与隐藏时看到的一致。

- [ ] **Step 8: 提交**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "feat: 隐藏白值加成填写框(计算按0)"
```

---

### Task 4: 功能二 — 取消下拉选技能，手动填写技能名 + 差值/min/max

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`

**Interfaces:**
- Consumes: `advanced.manualSkill`
- Produces: SkillListCard 内手动技能行（文本框 + 技能差值/min/max 数字框），buff 区不显示 min

- [ ] **Step 1: 技能名 select → 条件切换 text input**

找到 `SkillListCard` 中技能名 `<select>`（当前第 530-540 行）。将其替换为条件渲染 —— `manualSkill` 为真时用文本输入框：

```tsx
{manualSkill ? (
  <input className="input-field text-xs py-1.5" style={{ width: 133, flexShrink: 0 }}
    value={skill.name} spellCheck={false} placeholder="技能名"
    onChange={e => onUpdate(i, { ...skill, name: e.target.value })} />
) : (
  <select className="input-field text-xs py-1.5" style={{ width: 133, flexShrink: 0 }} value={skill.name}
    onChange={e => {
      const found = lookup.find(s => s.name === e.target.value);
      if (found) {
        const u: any = { ...skill, name: found.name, maxPower: found.max, border: found.border, passive: 1, layers: 0, skillLevel: 1 };
        if (!isBuff) u.minPower = found.min; onUpdate(i, u);
      } else onUpdate(i, { ...skill, name: e.target.value });
    }}>
    <option value="">— 技能 —</option>
    {lookup.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
  </select>
)}
```

- [ ] **Step 2: manualSkill 模式下新增 技能差值/min/max 数字框**

在技能名输入框之后、`初始属性` Num 之前，插入：

```tsx
{manualSkill && (
  <>
    <Num label="技能差值" value={skill.border || 0} onChange={v => onUpdate(i, { ...skill, border: v })} />
    <Num label="max" value={skill.maxPower || 0} onChange={v => onUpdate(i, { ...skill, maxPower: v })} />
    {!isBuff && <Num label="min" value={skill.minPower || 0} onChange={v => onUpdate(i, { ...skill, minPower: v })} />}
  </>
)}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证（dev server）**

Run: `npm run dev`
Expected:
- 勾选「手动填写技能」→ 三条技能区（加攻/减防/弱点）的技能名下拉都变文本框，并新增「技能差值 / max / min」数字框；加攻（buff）区**无** min 框。
- 手动输入技能名 + 差值/min/max → 行内「结果」按输入值实时计算；最终伤害正确。
- 切换回下拉模式 → 数据保留，下拉恢复原样。
- 手动填写的技能保存到历史 → 重新加载历史，伤害结果与保存时一致。

- [ ] **Step 5: 提交**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "feat: 手动填写技能(技能差值/min/max)"
```

---

### Task 5: 修复历史加载漏恢复连击/破坏/OD/浮动/垫刀

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`

**Interfaces:**
- Consumes: `initialData.input`（含 `chainMul / breakMul / odMul / floatVal / bonusDmg`）
- Produces: 加载历史后上述字段正确恢复

- [ ] **Step 1: 补恢复字段**

找到加载历史的 `useEffect`（当前第 107-118 行），在 `setBodyWeightStr(d.bodyWeightStr ?? '');` 之后、`setResult(...)` 之前加：

```tsx
setChainMul(d.chainMul ?? 1);
setBreakMul(d.breakMul < 50 ? d.breakMul * 100 : d.breakMul);
setOdMul(d.odMul ?? 1);
setFloatVal(d.floatVal ?? 1);
setBonusDmg(d.bonusDmg ?? 0);
```

注意：`setBonusDmg` 的 setter 存在（第 99 行 `const [bonusDmg, setBonusDmg]`）。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: 手动验证（dev server）**

Run: `npm run dev`
Expected: 设置连击=2.5、破坏率=300%、OD=1OD、浮动=1.1、垫刀=100000，保存到历史，清空页面，从历史加载 → 五项全部还原，最终伤害与保存时一致。

- [ ] **Step 4: 提交**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "fix: 历史加载补恢复连击/破坏/OD/浮动/垫刀"
```

---

## Self-Review

**1. Spec coverage:**
- 进阶选项下拉栏 → Task 2 ✓
- 隐藏白值加成（两处输入框 + 计算按0）→ Task 3 ✓
- 手动填写技能（文本名 + 差值/min/max，buff 无 min）→ Task 4 ✓
- 历史保存手动差值/min/max 兼容 → Task 4 数据落在技能对象字段上，天然随 buffs/debuffs/weaknesses 序列化 ✓（无需额外代码）
- 历史加载补恢复 5 字段 → Task 5 ✓
- 持久化（localStorage 跨会话）→ Task 1 + Task 2 ✓
- 进阶选项不进分享码/历史 → effInput 仅用于计算/保存/分享，旗标不入 input ✓

**2. Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码块。✓

**3. Type consistency:** `AdvancedOptions` 在两个文件一致；`effInput: DamageInput` 与 `calculateAll(input: DamageInput)` 匹配；`hideWhiteBonus`/`manualSkill` prop 名称在 Task 3/4 与 Task 2 调用处一致；`breakMul` 迁移逻辑与 `handleImport` 现有逻辑一致。✓
