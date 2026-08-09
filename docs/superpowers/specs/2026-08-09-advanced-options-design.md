# 伤害计算器「进阶选项」设计

日期: 2026-08-09
状态: 已确认

## 概述

在伤害计算头部「保存为默认值」按钮左侧新增一个「进阶选项」下拉栏，内含两个勾选选项：

1. **隐藏全部白值加成填写框** — 勾选后隐藏所有标注为「白值加成」的输入框，计算按 0 处理。
2. **取消下拉框选择技能，改为手动写技能名** — 勾选后技能选择由下拉框改为文本输入，并新增「技能差值 / max / min」输入框（buff 区不需要 min）。

两个选项状态跨会话持久化（localStorage），与现有「保存/清除默认值」互不影响。

## 现状分析

### 白值加成填写框（共两处）
| 位置 | 字段 | 代码 |
|---|---|---|
| 技能参数区 | `skill.whiteBonus` | `DamageCalculator.tsx` SkillParamsSection |
| 加攻/减防/弱点区每条技能行 | `moraleFighting` / `moraleDebuffs` | `DamageCalculator.tsx` SkillListCard |

### 技能选择（SkillListCard）
当前每行用 `<select>` 下拉从 lookup 选技能，选中后自动填充 `maxPower`（found.max）、`minPower`（found.min，非buff）、`border`（found.border），并重置 `skillLevel=1 / passive=1 / layers=0`。

### 历史保存/加载现状（发现 bug）
- `handleSave` / `handleShare` 的 input **已包含** `chainMul / breakMul / odMul / floatVal / bonusDmg`。
- 但 `useEffect` 加载历史（initialData）时 **漏恢复** 这 5 个字段，导致从历史加载后连击/破坏/OD/浮动/垫刀被重置，重算结果与保存时不一致。

## 详细设计

### 1. 进阶选项下拉栏（UI）

放在头部第二排按钮组（`保存为默认值` / `清除默认值` 所在 `flex ml-auto`）中，`保存为默认值` 左侧。复用 TurnPlanner 的下拉面板模式（相对定位按钮 + 绝对定位复选框面板），复选框沿用蓝勾样式（`toggle-off` / `bg-accent border-accent`）。

按钮: `进阶选项 ▾`，点击展开/收起面板。面板内两个 label 复选框：
- 隐藏全部白值加成填写框
- 手动填写技能（取消下拉选择）

### 2. 状态与持久化

新增 `engine/advancedOptions.ts`：

```ts
export interface AdvancedOptions {
  hideWhiteBonus: boolean;   // 隐藏白值加成填写框
  manualSkill: boolean;      // 手动填写技能
}

loadAdvancedOptions(): AdvancedOptions   // 读 localStorage，缺省 { false, false }
saveAdvancedOptions(o: AdvancedOptions)  // 写 localStorage
```

独立 key（如 `hbr_calc_advanced_options`），不进入 UserDefaults，不受保存/清除默认值影响。进阶选项**不进分享码/历史 input**（隐藏时保存的是 zeroed 数值，接收方看到相同结果，无需传旗标）。

### 3. 功能一：隐藏全部白值加成填写框

- `SkillParamsSection`：隐藏 `whiteBonus` 字段。
- `SkillListCard`：隐藏每行「白值加成」字段。
- **计算按 0 处理**：UI 隐藏仅是显示层，底层 state 保留原值（取消勾选可恢复）。计算时构造 zeroed 副本传给 `calculateAll`：

```ts
const effSkill      = hideWhiteBonus ? { ...skill, whiteBonus: 0 } : skill;
const effBuffs      = hideWhiteBonus ? buffs.map(b => ({ ...b, moraleFighting: 0 })) : buffs;
const effDebuffs    = hideWhiteBonus ? debuffs.map(d => ({ ...d, moraleDebuffs: 0 })) : debuffs;
const effWeaknesses = hideWhiteBonus ? weaknesses.map(w => ({ ...w, moraleDebuffs: 0 })) : weaknesses;
```

- `runCalc`、`handleSave`、`handleShare` 全部使用 zeroed 副本 → 历史/分享中的 result 与当前显示一致（所见即所得）。
- `SkillListCard` 每行结果预览的内部计算同样用 zeroed 副本，保证行内显示与总结果一致。

### 4. 功能二：取消下拉框 → 手动填写技能

`SkillListCard` 每行在 `manualSkill` 模式下：

- 技能名：`<select>` 改为文本 `<input>`，手动输入 `skill.name`，不查库。
- 新增数字框（复用现有 `Num` 组件）：
  - **技能差值** → 绑定 `skill.border`
  - **max** → 绑定 `skill.maxPower`
  - **min** → 绑定 `skill.minPower`，**仅 buff 区外的行显示**（buff 类型无 minPower 字段，天然不显示）
- 原有字段（初始属性 currentAttr、宝珠 orb、等级 skillLevel、被动 passive、层数 layers）全部保留。
- 切换模式不丢数据：数据同构，只是输入方式变化。

**历史兼容**：手动填写的 `border / maxPower / minPower` 直接落在技能对象的这三个字段上，随 `buffs/debuffs/weaknesses` 序列化进历史 input，加载时自动还原 —— 与从技能库选的技能数据完全同构，天然兼容。

### 5. 历史保存/加载修复（bug fix）

`useEffect` 加载 initialData 时补恢复漏掉的字段，与保存一一对应：

```ts
setChainMul(d.chainMul ?? 1);
setBreakMul(d.breakMul < 50 ? d.breakMul * 100 : d.breakMul); // 沿用 % 迁移逻辑
setOdMul(d.odMul ?? 1);
setFloatVal(d.floatVal ?? 1);
setBonusDmg(d.bonusDmg ?? 0);
```

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/engine/advancedOptions.ts` | 新增，AdvancedOptions 类型 + load/save |
| `src/components/DamageCalc/DamageCalculator.tsx` | 状态、下拉栏 UI、zeroed 副本计算、历史加载补恢复、给 SkillParamsSection / SkillListCard 传 prop |

## 验证要点

1. 勾选「隐藏白值加成」→ 两处白值加成输入框消失，计算结果等同于白值加成=0。
2. 取消勾选 → 原填写的白值加成数值恢复，结果回到原值。
3. 勾选「手动填写技能」→ 技能下拉变文本框 + 技能差值/min/max 数字框（buff 行无 min）。
4. 手动填写技能并保存历史 → 重新加载历史，伤害结果与保存时一致（差值/min/max 已还原）。
5. 加载历史 → 连击/破坏/OD/浮动/垫刀 全部还原。
6. 进阶选项勾选状态刷新页面后保持。
