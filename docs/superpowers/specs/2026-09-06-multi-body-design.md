# 多体（Multi-Body）伤害计算 — 设计文档

日期：2026-09-06
状态：待实现

## 1. 背景与目标

在「伤害计算」页面新增一个进阶选项 **多体**。开启后，减防区（dbf）和弱点区（weakness）变为每个「体」（敌人）独立输入，每个体的伤害独立计算，最终伤害为各体伤害的算术平均，并在结果区显示每个体的不同 dbf 与逐体伤害。

### 已确认的决策

| 决策点 | 结论 |
|---|---|
| 多体粒度 | 直接输入「区数值」（减防区乘数 / 弱点区乘数），跳过技能列表计算 |
| 其余乘区 | 所有体共享（技能倍率、加攻区、爆伤区、连击、破坏、OD、浮动） |
| 平均方式 | 简单算术平均（各体衰减后伤害求和 ÷ 体数） |
| 敌方属性 | 不做多体，保持单一共享值（仍用于技能威力 `calcSkillPower`） |
| 浮动概率分布 | 兼容多体：σ ÷ √体数（n 个独立体取平均） |

## 2. 数据模型（`src/types.ts`）

新增接口：

```ts
export interface MultiBodyConfig {
  enabled: boolean;
  bodies: { dbf: number; weakness: number }[]; // 每体「减防区」「弱点区」乘数，直接填数值
}
```

- `DamageInput` 新增 `multiBody?: MultiBodyConfig`。
- `DamageResultData` 新增：

```ts
multiBody?: {
  perBody: {
    dbf: number;
    weakness: number;
    preAttenuation: number;   // 该体衰减前伤害（含所有共享乘区 + 该体 dbf/weakness）
    postAttenuation: number;  // 该体衰减后伤害
  }[];
  averagePreAttenuation: number;
  averagePostAttenuation: number;
};
```

`src/engine/advancedOptions.ts` 的 `AdvancedOptions` 新增 `multiBody: boolean`（开关，跨会话持久化）。

## 3. 引擎改动（`src/engine/damage.ts` `calculateAll`）

`calculateAll` 中，多体开启（`input.multiBody?.enabled && bodies.length > 0`）时：

1. 按现有逻辑计算共享乘区（不含 dbf/weakness）：
   - `shared = skillResult.multiplier × atkFactor × critFactor × chainMul × breakMul × odMul × floatVal`
2. 对每个体 `i`：
   - `preAttenuation_i = shared × body_i.dbf × body_i.weakness`
   - `postAttenuation_i = applyAttenuation(preAttenuation_i, 1)`（或 `applyExAttenuation`，取决于 `exAttenuation`）
3. `averagePreAttenuation = mean(preAttenuation_i)`，`averagePostAttenuation = mean(postAttenuation_i)`。
4. `postAttenuation` 与 `preAttenuation`（返回值）用平均值；`defFactor` / `weaknessFactor`（返回值）用各体均值（仅为向后兼容的展示占位，多体 UI 不使用这两个单值）。
5. 打分 `calcScore(input.damageValueOverride || averagePostAttenuation, …)` 用平均后伤害。
6. `attenuationApplied` 以平均衰减前伤害是否超阈值为准（与单体的超阈值判定一致）。
7. 返回 `multiBody.perBody`、`averagePreAttenuation`、`averagePostAttenuation`。

关闭时走现有单体路径，行为完全不变。

**衰减在每个体上独立应用**（符合「独立计算」），平均发生在衰减之后。

## 4. UI 改动（`src/components/DamageCalc/DamageCalculator.tsx`）

### 4.1 进阶选项开关

在进阶选项下拉中新增「多体」开关，读写 `advanced.multiBody`（现有 `AdvancedOptions` 持久化模式）。

### 4.2 状态

- 新增本地状态 `multiBodyBodies: { dbf: number; weakness: number }[]`，默认 `[{ dbf: 1, weakness: 1 }, { dbf: 1, weakness: 1 }]`（默认 2 体）。
- `effInput` 组合 `multiBody: { enabled: advanced.multiBody, bodies: multiBodyBodies }`。
- 历史记录回填（`initialData` effect）与 `userDefaults` 保存/加载需带上 `multiBodyBodies`。

### 4.3 多体开启后的区块变化

- **隐藏**「主动减防区」「弱点加深区」两个 `CollapsibleSection`。
- **保留**「敌方属性」区（enemyAttr / 武器弱点 / 属性弱点 三个字段不动）。
- 新增「多体」区块（`CollapsibleSection`），标签页形式：
  - 顶部标签 `体1` `体2` … `+新增体`（可切换当前编辑的体）。
  - 当前体页面：两个数值输入「减防区」「弱点区」（默认 `1.0`，`step=0.01`）。
  - 体 2 及以后：**「复制体1的dbf」** 按钮，点击把体 1 的 `dbf` 复制到当前体（一次性复制，之后可独立改）。
  - 可删除体（最少保留 1 个）。

## 5. 结果展示改动

### 5.1 ResultHeaderRow（`DamageCalculator.tsx`）

多体开启时：
- 「减防区」「弱点区」列显示每体的值，如 `减防区 [1.05, 1.10]`（沿用现有 `.toFixed(3)`）。
- 大数字显示平均伤害 `Math.floor(result.postAttenuation)`。
- 大数字下方红字逐体列出各体伤害，如 `体1: 1,234,567 · 体2: 1,300,000`。

### 5.2 浮动概率分布（`src/components/DamageCalc/DamageResult.tsx`）

- 多体开启时，把 `hitWeights` 数组复制 `n` 份（`n = bodies.length`）后传给 `computeFloatDistribution`。
  - 数学依据：`computeFloatDistribution` 已按「总权重 T 归一化的平均浮动偏差」计算，把权重复制 n 份等价于「n 个独立体伤害取平均」的偏差分布，其 σ 精确等于单体 σ ÷ √n（特征函数法，非近似）。
- 图注（「N本体 + … = totalHits hits」行）追加 `· n体平均` 提示。
- 悬停伤害估算沿用现有 `preAtUp = (result.preAttenuation / floatVal) * (1 + best.up)`，`result.preAttenuation` 此时为平均衰减前伤害（含 floatVal），再 `applyAttenuation`——为平均伤害在该浮动偏差下的估算。

## 6. 边界与回归

- 体数为 0（或 `bodies` 为空）时不进入多体分支，回退单体逻辑。
- 单体内 `dbf` / `weakness` 为任意正数；`0` 或负值不额外拦截（与其余乘区输入一致，由用户保证）。
- 多体关闭时，所有 UI、引擎、结果展示与当前版本完全一致（无回归）。
- 历史记录（IndexedDB）与默认值（userDefaults）保存 `multiBodyBodies`，恢复后 UI 与结果一致。

## 7. 涉及的改动文件

| 文件 | 改动 |
|---|---|
| `src/types.ts` | 新增 `MultiBodyConfig`，`DamageInput.multiBody`，`DamageResultData.multiBody` |
| `src/engine/damage.ts` | `calculateAll` 多体分支 |
| `src/engine/advancedOptions.ts` | `AdvancedOptions.multiBody` |
| `src/components/DamageCalc/DamageCalculator.tsx` | 开关、多体区块、`effInput`、ResultHeaderRow、历史/默认值回填 |
| `src/components/DamageCalc/DamageResult.tsx` | 浮动分布权重复制 n 份 + 图注 |
