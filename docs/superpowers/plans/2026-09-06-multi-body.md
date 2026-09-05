# 多体（Multi-Body）伤害计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在伤害计算页面新增「多体」进阶选项——每个体独立输入减防区/弱点区乘数，独立计算并过衰减，最终伤害取算术平均，结果区显示逐体 dbf 与逐体伤害，浮动概率分布按 σ÷√体数 兼容多体。

**Architecture:** 复用现有 `calculateAll` 引擎，抽出一个「共享乘区」乘数，在多体开启时对每个体独立乘 dbf/weakness 并独立过衰减，再取平均。数据通过 `DamageInput.multiBody`（含 enabled + bodies）贯通引擎、历史记录、分享码、默认值。UI 用标签页编辑各体，关闭时隐藏减防/弱点两个技能列表区（敌方属性区保留）。

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind CSS。无测试框架——验证靠 `npm run build`（`tsc -b && vite build` 类型检查 + 编译）加手动浏览器验证。

**Spec:** `docs/superpowers/specs/2026-09-06-multi-body-design.md`

## Global Constraints

- 多体粒度：`bodies[].dbf` / `bodies[].weakness` 是**区乘数**（直接填数值，跳过技能列表），默认 `1.0`。
- 敌方属性（`skill.enemyAttr`）不做多体，UI 保留「敌方属性」区，仍用于 `calcSkillPower`。
- 其余乘区（技能倍率、加攻、爆伤、连击、破坏、OD、浮动）所有体共享。
- 最终伤害 = 各体**衰减后**伤害的简单算术平均。
- 浮动概率分布 σ ÷ √体数：hit 权重数组复制 n 份喂给 `computeFloatDistribution`。
- 默认 2 个体，`dbf`/`weakness` 各 `1.0`；体数下限 1，无上限。
- 多体关闭时行为与当前版本完全一致（无回归）。
- 所有副本文案用简体中文，文件内注释沿用中文。

---

### Task 1: 数据模型 + 进阶选项开关

**Files:**
- Modify: `src/types.ts`
- Modify: `src/engine/advancedOptions.ts`

**Interfaces:**
- Produces: `MultiBodyConfig`（`{ enabled: boolean; bodies: { dbf: number; weakness: number }[] }`）；`DamageInput.multiBody?: MultiBodyConfig`；`DamageResultData.multiBody?: { perBody: { dbf; weakness; preAttenuation; postAttenuation }[]; averagePreAttenuation; averagePostAttenuation }`；`AdvancedOptions.multiBody: boolean`。

- [ ] **Step 1: 在 types.ts 新增 MultiBodyConfig**

在 `src/types.ts` 顶部（`DamageInput` 定义之前，例如 `ScoreParams` 之后）新增接口：

```ts
// ─── 多体（Multi-Body）───────────────────────────────────
export interface MultiBodyConfig {
  enabled: boolean;
  bodies: { dbf: number; weakness: number }[]; // 每体「减防区」「弱点区」乘数，直接填数值
}
```

- [ ] **Step 2: 给 DamageInput 加 multiBody 字段**

在 `DamageInput`（约 304-328 行）末尾、`bodyWeightStr?` 之后加：

```ts
  bodyWeightStr?: string;
  multiBody?: MultiBodyConfig; // 多体：每体独立 dbf/weakness 乘数
}
```

- [ ] **Step 3: 给 DamageResultData 加 multiBody 字段**

在 `DamageResultData`（约 212-269 行）末尾、`score` 字段之后、右括号之前加：

```ts
  // 多体结果（多体开启时才有值）
  multiBody?: {
    perBody: {
      dbf: number;
      weakness: number;
      preAttenuation: number;   // 该体衰减前伤害
      postAttenuation: number;  // 该体衰减后伤害
    }[];
    averagePreAttenuation: number;
    averagePostAttenuation: number;
  };
}
```

- [ ] **Step 4: 给 AdvancedOptions 加 multiBody 开关**

修改 `src/engine/advancedOptions.ts`：

```ts
export interface AdvancedOptions {
  hideWhiteBonus: boolean;
  manualSkill: boolean;
  spModel: boolean;
  multiBody: boolean;      // 多体：每体独立 dbf/weakness
}

const DEFAULT_OPTIONS: AdvancedOptions = { hideWhiteBonus: false, manualSkill: false, spModel: false, multiBody: false };
```

并在 `loadAdvancedOptions` 的返回对象里加一行：

```ts
      multiBody: parsed.multiBody === true,
```

- [ ] **Step 5: 验证类型通过**

Run: `npm run build`
Expected: PASS（无类型错误）。此时 `multiBody` 字段尚未被任何逻辑消费，纯类型扩展不影响行为。

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/engine/advancedOptions.ts
git commit -m "feat: 多体数据模型 + 进阶开关字段"
```

---

### Task 2: 引擎 calculateAll 多体分支

**Files:**
- Modify: `src/engine/damage.ts:525-611`

**Interfaces:**
- Consumes: `DamageInput.multiBody`（Task 1）、`applyAttenuation(damage, float=1)`、`applyExAttenuation(damage, float=1)`、`ATTEN_THRESHOLD`、`EX_ATTEN_THRESHOLD`、`calcScore(dmg, score, bonusDmg)`。
- Produces: `DamageResultData.multiBody`（`perBody` / `averagePreAttenuation` / `averagePostAttenuation`），供 Task 5、Task 6 消费。

- [ ] **Step 1: 将 defFactor / weaknessFactor 改为 let**

在 `calculateAll` 内（约 541、547 行）把两个 `const` 改为 `let`（多体分支会覆盖它们为各体均值）：

```ts
  let defFactor = (activeDef + passiveDef) / 100 + 1;
  // ...
  let weaknessFactor = weaponWeakFactor * elementFactor;
```

- [ ] **Step 2: 替换「合并→衰减→打分」块**

把当前从 `const preAttenuation = skillResult.multiplier ...`（约 555 行）到 `const scoreResult = calcScore(...)`（约 578 行）的整块，替换为：

```ts
  // ── 共享乘区（不含 dbf/weakness）────────────────────────────
  const shared = skillResult.multiplier
    * atkFactor
    * critFactor
    * chainMul
    * breakMul
    * odMul
    * floatVal;

  const exAtten = input.exAttenuation;
  const applyAtten = (dmg: number) => exAtten ? applyExAttenuation(dmg, 1) : applyAttenuation(dmg, 1);
  const isOver = (dmg: number) => exAtten ? dmg > EX_ATTEN_THRESHOLD : dmg > ATTEN_THRESHOLD;

  const bodies = input.multiBody?.enabled ? input.multiBody.bodies : null;
  const useMultiBody = !!bodies && bodies.length > 0;

  let preAttenuation: number;
  let postAttenuation: number;
  let attenuationApplied: boolean;
  let multiBody: DamageResultData['multiBody'];

  if (useMultiBody && bodies) {
    const perBody = bodies.map(b => {
      const pre = shared * b.dbf * b.weakness;
      const post = applyAtten(pre);
      return { dbf: b.dbf, weakness: b.weakness, preAttenuation: pre, postAttenuation: post };
    });
    const averagePreAttenuation = perBody.reduce((s, p) => s + p.preAttenuation, 0) / perBody.length;
    const averagePostAttenuation = perBody.reduce((s, p) => s + p.postAttenuation, 0) / perBody.length;
    preAttenuation = averagePreAttenuation;
    postAttenuation = averagePostAttenuation;
    attenuationApplied = isOver(averagePreAttenuation);
    defFactor = perBody.reduce((s, p) => s + p.dbf, 0) / perBody.length;
    weaknessFactor = perBody.reduce((s, p) => s + p.weakness, 0) / perBody.length;
    multiBody = { perBody, averagePreAttenuation, averagePostAttenuation };
  } else {
    preAttenuation = shared * defFactor * weaknessFactor;
    attenuationApplied = isOver(preAttenuation);
    postAttenuation = applyAtten(preAttenuation);
  }

  // ── OD / 破坏 / 打分 ────────────────────────────────────────
  const odResult = calcOD(od);
  const weightedBreak = calcWeightedBreak(break_);
  const scoreResult = calcScore(input.damageValueOverride || postAttenuation, score, bonusDmg);
```

- [ ] **Step 3: 在返回对象里加 multiBody**

在 `calculateAll` 的 `return { ... }` 里、`score: scoreResult,` 之前或之后加一行：

```ts
    score: scoreResult,
    multiBody,
  };
```

- [ ] **Step 4: 验证类型通过**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 5: 手动验证引擎**

`npm run dev` 后打开伤害计算页面：多体字段尚未接入 UI，`input.multiBody` 为 `undefined`，引擎走单体分支，页面伤害数字与改动前一致（无回归）。

- [ ] **Step 6: Commit**

```bash
git add src/engine/damage.ts
git commit -m "feat: 引擎 calculateAll 支持多体独立衰减取平均"
```

---

### Task 3: UI 状态 + 开关 + effInput + 持久化/回填

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`
- Modify: `src/engine/userDefaults.ts`

**Interfaces:**
- Consumes: `AdvancedOptions.multiBody`（Task 1）、`DamageInput.multiBody`（Task 1）。
- Produces: 本地状态 `multiBodyBodies` / `activeBodyIndex`；`effInput` 带 `multiBody`；供 Task 4 UI 与 Task 5/6 结果消费。

- [ ] **Step 1: 加本地状态**

在 `const [advanced, setAdvanced] = useState(loadAdvancedOptions);`（约 116 行）之后加：

```ts
  const [multiBodyBodies, setMultiBodyBodies] = useState<{ dbf: number; weakness: number }[]>(
    init?.multiBodyBodies?.length ? init.multiBodyBodies : [{ dbf: 1, weakness: 1 }, { dbf: 1, weakness: 1 }]
  );
  const [activeBodyIndex, setActiveBodyIndex] = useState(0);
```

- [ ] **Step 2: effInput 带上 multiBody**

在 `effInput` 的 `base` 对象（约 143-147 行）里加一行 `multiBody`：

```ts
    const base = {
      stats, equipment, bonus, od, break_: breakParams, score,
      chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg, exAttenuation: exAtten,
      superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr,
      multiBody: { enabled: advanced.multiBody, bodies: multiBodyBodies },
    };
```

并在该 `useMemo` 的依赖数组（约 158-160 行）末尾加 `, advanced.multiBody, multiBodyBodies`。

- [ ] **Step 3: 进阶选项下拉加「多体」开关**

在进阶选项下拉（约 348-378 行）里、`SP模型` 的 `<label>` 之后加：

```tsx
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-text-muted"
                  onClick={() => setAdvanced(a => ({ ...a, multiBody: !a.multiBody }))}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${advanced.multiBody ? 'bg-accent border-accent' : 'toggle-off'}`}>
                    {advanced.multiBody && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  多体
                </label>
```

- [ ] **Step 4: 历史记录回填多体**

在 `useEffect`（约 119-135 行，`if (initialData)` 块内）加：

```ts
      if (d.multiBody?.bodies?.length) setMultiBodyBodies(d.multiBody.bodies);
      if (d.multiBody?.enabled) setAdvanced(a => ({ ...a, multiBody: true }));
```

- [ ] **Step 5: 导入分享码回填多体**

在 `handleImport`（约 208-228 行）末尾 `setCalcLabel('导入');` 之前加：

```ts
    if (decoded.multiBody?.bodies?.length) setMultiBodyBodies(decoded.multiBody.bodies);
    if (decoded.multiBody?.enabled) setAdvanced(a => ({ ...a, multiBody: true }));
```

- [ ] **Step 6: 保存默认值带上多体**

修改 `src/engine/userDefaults.ts` 的 `UserDefaults` 接口，在 `bodyWeightStr?: string;` 之后加：

```ts
  multiBodyBodies?: { dbf: number; weakness: number }[];
```

修改 `handleSaveDefaults`（约 232-253 行）的 `defaults` 对象，在 `bodyWeightStr,` 之后加：

```ts
      bodyWeightStr,
      multiBodyBodies,
```

- [ ] **Step 7: 验证类型通过**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx src/engine/userDefaults.ts
git commit -m "feat: 多体状态/开关/持久化接线"
```

---

### Task 4: 多体标签页 UI + 隐藏减防/弱点区

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`

**Interfaces:**
- Consumes: `multiBodyBodies` / `setMultiBodyBodies` / `activeBodyIndex` / `setActiveBodyIndex`（Task 3）、`advanced.multiBody`、`Field`（同文件 917 行）、`CollapsibleSection`（`../CollapsibleSection`）。

- [ ] **Step 1: 新增 MultiBodySection 组件**

在文件末尾（`ScoreSection` 或 `Field` 定义附近，与其它子组件并列）加：

```tsx
function MultiBodySection({ bodies, setBodies, activeIndex, setActiveIndex }: {
  bodies: { dbf: number; weakness: number }[];
  setBodies: (b: { dbf: number; weakness: number }[]) => void;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  const update = (i: number, k: 'dbf' | 'weakness', v: number) => {
    const n = [...bodies];
    n[i] = { ...n[i], [k]: v };
    setBodies(n);
  };
  const copyFirstDbf = (i: number) => {
    const n = [...bodies];
    n[i] = { ...n[i], dbf: bodies[0].dbf };
    setBodies(n);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {bodies.map((_, i) => (
          <button key={i} type="button"
            className={`btn btn-xs px-2.5 ${i === activeIndex ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveIndex(i)}>
            体{i + 1}
          </button>
        ))}
        <button type="button" className="btn btn-xs btn-secondary"
          onClick={() => { setBodies([...bodies, { dbf: 1, weakness: 1 }]); setActiveIndex(bodies.length); }}>
          +新增体
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`体${activeIndex + 1} 减防区`} value={bodies[activeIndex].dbf} onChange={v => update(activeIndex, 'dbf', v)} step={0.01} />
        <Field label={`体${activeIndex + 1} 弱点区`} value={bodies[activeIndex].weakness} onChange={v => update(activeIndex, 'weakness', v)} step={0.01} />
      </div>
      <div className="flex items-center gap-2">
        {activeIndex > 0 && (
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => copyFirstDbf(activeIndex)}>
            复制体1的dbf
          </button>
        )}
        {bodies.length > 1 && (
          <button type="button" className="btn btn-xs btn-danger" onClick={() => {
            const n = bodies.filter((_, j) => j !== activeIndex);
            setBodies(n);
            setActiveIndex(Math.min(activeIndex, n.length - 1));
          }}>
            删除此体
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 隐藏减防/弱点两个区**

给「主动减防区」（约 408-413 行）和「弱点加深区」（约 415-420 行）两个 `CollapsibleSection` 分别包上 `{!advanced.multiBody && (...)}`：

```tsx
      {!advanced.multiBody && (
        <CollapsibleSection title={<span>主动减防区 <InfoTip id="debuff" /></span>} defaultOpen>
          ...原内容...
        </CollapsibleSection>
      )}

      {!advanced.multiBody && (
        <CollapsibleSection title={<span>弱点加深区 <InfoTip id="weakness" /></span>} defaultOpen>
          ...原内容...
        </CollapsibleSection>
      )}
```

- [ ] **Step 3: 渲染多体区块**

在「敌方属性」`CollapsibleSection`（约 391-397 行）之后、`<SkillParamsSection ... />` 之前插入：

```tsx
      {advanced.multiBody && (
        <CollapsibleSection title="多体" defaultOpen>
          <MultiBodySection
            bodies={multiBodyBodies}
            setBodies={setMultiBodyBodies}
            activeIndex={activeBodyIndex}
            setActiveIndex={setActiveBodyIndex}
          />
        </CollapsibleSection>
      )}
```

- [ ] **Step 4: 验证类型通过**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 5: 手动验证 UI**

`npm run dev`：开启「多体」后，减防/弱点两区消失，「敌方属性」区仍在，出现「多体」区块；可新增体、切换标签、改各体数值、「复制体1的dbf」、删除体（最少剩 1 个）。

- [ ] **Step 6: Commit**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "feat: 多体标签页 UI（新增/复制/删除体）"
```

---

### Task 5: 结果头部显示逐体 dbf + 平均伤害 + 红字逐体伤害

**Files:**
- Modify: `src/components/DamageCalc/DamageCalculator.tsx`（`ResultHeaderRow`，约 498-539 行）

**Interfaces:**
- Consumes: `DamageResultData.multiBody`（Task 2）。

- [ ] **Step 1: ResultHeaderRow 多体分支**

在 `ResultHeaderRow` 组件开头、`return (` 之前加：

```tsx
  const mb = result.multiBody;
  const isMulti = !!mb && mb.perBody.length > 0;
```

把「减防区」列（约 515 行）替换为：

```tsx
          {isMulti && mb
            ? <div>减防区 <span className="text-text-primary font-mono">[{mb.perBody.map(b => b.dbf.toFixed(3)).join(', ')}]</span></div>
            : <div>减防区 <span className="text-text-primary font-mono">{result.defFactor.toFixed(3)}</span>{copyBtn(result.defFactor.toFixed(3))}</div>}
```

把「弱点区」列（约 517 行）替换为：

```tsx
          {isMulti && mb
            ? <div>弱点区 <span className="text-text-primary font-mono">[{mb.perBody.map(b => b.weakness.toFixed(3)).join(', ')}]</span></div>
            : <div>弱点区 <span className="text-text-primary font-mono">{result.weaknessFactor.toFixed(3)}</span>{copyBtn(result.weaknessFactor.toFixed(3))}</div>}
```

在大数字 `{Math.floor(result.postAttenuation).toLocaleString('zh-CN')}`（约 530 行）之后、`{result.attenuationApplied && (...)}` 之前加红字逐体伤害：

```tsx
          {isMulti && mb && (
            <div className="text-[11px] text-danger mt-1 font-mono">
              {mb.perBody.map((b, i) => `体${i + 1}: ${Math.floor(b.postAttenuation).toLocaleString('zh-CN')}`).join(' · ')}
            </div>
          )}
```

- [ ] **Step 2: 验证类型通过**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 3: 手动验证结果**

多体开启、改不同 dbf/弱点后：头部减防区/弱点区显示 `[a, b, …]` 各体值；大数字为平均伤害；下方红字逐体列出各体伤害。单体（多体关闭）时头部与改动前一致。

- [ ] **Step 4: Commit**

```bash
git add src/components/DamageCalc/DamageCalculator.tsx
git commit -m "feat: 结果头部逐体 dbf + 平均伤害 + 红字逐体伤害"
```

---

### Task 6: 浮动概率分布兼容多体（σ ÷ √体数）

**Files:**
- Modify: `src/components/DamageCalc/DamageResult.tsx`

**Interfaces:**
- Consumes: `DamageResultData.multiBody`（Task 2）、`computeFloatDistribution` / `buildHitWeights`（`../../engine/floatProb`）。

- [ ] **Step 1: 计算多体分布权重**

在 `DamageResult` 组件内、`hitWeights` 的 `useMemo`（约 35-38 行）之后加：

```ts
  // 多体：最终伤害为各体平均 → 浮动偏差分布等价于把单体的 hit 权重复制 n 份（σ ÷ √n，特征函数法精确）
  const bodyCount = result.multiBody?.perBody.length ?? 1;
  const isMultiBody = bodyCount > 1;
  const distWeights = useMemo(() => {
    if (!isMultiBody) return hitWeights;
    const out: number[] = [];
    for (let i = 0; i < bodyCount; i++) out.push(...hitWeights);
    return out;
  }, [hitWeights, bodyCount, isMultiBody]);
```

- [ ] **Step 2: 用 distWeights 计算分布**

把分布计算中所有引用 `hitWeights` 的位置换成 `distWeights`：
- `computeFloat` 回调（约 42-45 行）里的 `computeFloatDistribution(hitWeights, 200)` 改为 `computeFloatDistribution(distWeights, 200)`，依赖数组 `[hitWeights]` 改为 `[distWeights]`。
- `useEffect(() => { setFloatDirty(true); }, [hitWeights]);`（约 47 行）依赖改为 `[distWeights]`。
- 初始 `useState`（约 40 行）保持用 `buildHitWeights(skill.hitCount || 1, 0, 0, 0, 0, null)`，不变。

- [ ] **Step 3: 图注加「n体平均」**

在命中数说明行（约 127 行，`= {totalHits} hits`）之后加：

```tsx
            {isMultiBody && <span className="ml-1 text-amber-300/80">· {bodyCount}体平均</span>}
```

- [ ] **Step 4: 验证类型通过**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 5: 手动验证浮动**

多体开启（如 2 体、每体同 hit 配置）后点「计算」：浮动概率分布曲线比单体更窄（σ 变小）；图注出现 `· 2体平均`。多体关闭时分布与改动前一致。

- [ ] **Step 6: Commit**

```bash
git add src/components/DamageCalc/DamageResult.tsx
git commit -m "feat: 浮动概率分布兼容多体（σ÷√n）"
```

---

## 自检记录

- **Spec 覆盖**：数据模型（Task 1）→ 引擎（Task 2）→ UI 开关/状态/持久化（Task 3）→ 标签页 UI + 隐藏区（Task 4）→ 结果头部（Task 5）→ 浮动（Task 6），全部 7 个 spec 章节有对应任务。
- **占位符扫描**：无 TBD/TODO/「类似 Task N」；每个代码步骤给出完整代码块。
- **类型一致**：`MultiBodyConfig`、`bodies[].dbf/weakness`、`multiBody.perBody`、`averagePostAttenuation` 等命名在 Task 1/2/5/6 间一致。
