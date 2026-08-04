# 勋章&宝玉记录表 — 设计文档

日期:2026-08-04 · 项目:hbr_calc_web · 状态:已获用户确认(xlsx 为档位/分数来源)

## 1. 背景与目标

新增一级菜单「勋章&宝玉记录表」,追踪每个角色的 HBR 勋章(称号)与宝玉进度,自动计算角色勋章 Rank。
数据源:`BadgeReward.xlsx`(称号分数)+ `Character.xlsx`(角色名/ID/队伍)。延续现有毛玻璃深色主题,兼容自定义强调色与壁纸。

两个子页:
- **勋章**:9 大类别共 66 个档位的勾选清单,自动计算 Rank + 距下一 Rank 进度
- **宝玉**:19 种宝玉的角色 × 宝玉精通度矩阵(0–100,100 即习得)

## 2. 数据模型(已修正 —— 按 GroupLabel 分类,而非按行序)

上一会话的 plan 假设「称号按行序 ↔ 清单档位一一映射」,经核查 **是错的**:BadgeReward.xlsx 每行有 `GroupLabel` 字段(如 `Reward.TitleBadge.RKayamori.CLv.100`),角色行内的类别是**交错**的(如「突破3」排在「等级100」前)。必须**按 GroupLabel 类别分组**再映射。

用户已确认:**档位与分数一律以 BadgeReward.xlsx 为准**(替代手打档位)。

### 2.1 九大类清单(共 66 档,与每角色 66 个称号一一对应)

| categoryKey | label | 档位(xlsx 实际) | 档数 | GroupLabel 前缀 |
|---|---|---|---|---|
| level | 等级 | 100,110,120,130,140,150,160 | 7 | `*.CLv.*` |
| breakthrough | 突破 | 1,2,3,4 | 4 | `*.BreakStyleLimit.*` |
| reincarnation | 转生 | 1,5,10,15,20 | 5 | `*.ReincarnationCount.*` |
| jewel | 宝玉 | 1,3,5,8,10,15 | 6 | `*.LearnedGateBossSkillCount.*` |
| score | 打分 | 10w..240w 每 20w 一档,**含 120w** | 13 | `*.ScoreAttackHighScore.*` |
| battles | 战斗次数 | 10,100,1000,5000,10000,15000,20000(用户指定展示值,位置对齐 xlsx 分数) | 7 | `*.BattleClearCount.*` |
| ruins | 废域 | 5,50,100,250,500,750,1000 | 7 | `*.ExpeditionStartedCount.*` |
| hard | 异时层 | 11 个真实 Boss 名(DeathSlug, RotalyMole, RedCrimson, Feeler, FlatHand, UltimateFeeler, UltimateFlatHand, DesertDendron, SkullFeatherHeadTail, SkullFeather2nd, BrackenKnot) | 11 | `*.HardMode.*` |
| encounter | 遭遇战 | 1w,2w,4w,6w,8w,10w(用户指定展示值,位置对齐 xlsx 分数) | 6 | `*.WaveBattleHighScore.*` |

合计 7+4+5+6+13+7+7+11+6 = **66**。

### 2.2 生成数据 `src/data/medalData.json`

```jsonc
{
  "characters": [{ "id": 55, "name": "茅森月歌", "enName": "RKayamori", "team": "31A" }, ...], // 61 人
  "teams": { "31A": [55, 61, 34, 32, 14, 13], ... },                      // 用户指定分组
  "checklist": [{ "key": "level", "label": "等级", "tiers": [100, 110, ...] }, ...], // 9 类 66 档
  "tierOrder": ["level:100", "level:110", ..., "hard:BrackenKnot", "encounter:10w"], // 66 项扁平序(分数索引)
  "badgesByChar": {
    // 按类别键 → 有序分数数组;与 checklist 同类别顺序对齐
    "RKayamori": { "level": [50,50,100,200,300,500,1000], "breakthrough": [200,200,300,300], ..., "hard": [...11], "encounter": [50,50,100,200,500,1000] }
  },
  "charOrder": ["RKayamori", "YIzumi", ...],   // BadgeReward.xlsx 行序 = 默认排序(注意非 id 序)
  "jewels": ["会心", "复活", ...],              // 19
  "rankThresholds": [0,500,1500,3000,5000,7500,10500,14000,18000,22500,27500,33000,39000,45500,52500]
}
```

要点:
- `tierOrder` 由 `checklist` 展开得到,`tierIdx`(0..65)即 localStorage 里 `done[]` 存的索引;分数 = `badgesByChar[en][checklist[tierIdx].key][checklist 内偏移]`。
- `charOrder` 保留 BadgeReward.xlsx 行首见序(RKayamori 在最前)——默认排序依据。
- 生成脚本输出校验日志:每角色 66 档、类别分数与 xlsx 一致、charOrder 长度 61。

### 2.3 角色模板差异

多数角色分数数组相同;AB 联动 / p5r 联动(共 10 人)与 `STezuka`、`HNaruse` 的分数略有差异。新增自定义角色时采用**最常见模板**(`RKayamori` 类)作为默认分数,存在 localStorage。

## 3. Rank 计算(核心)

- `sum = Σ done[] 对应档位的分数`
- `rank = max { r ∈ [1,15] : rankThresholds[r] ≤ sum }`,阈值索引即 Rank(1→0,2→500,…15→52500)
- 若 `rank < 15`:`距离下一Rank = rankThresholds[rank+1] − sum`;`rank == 15` 显示「MAX」
- 进度条:`(sum − 当前阈值) / (下一阈值 − 当前阈值)`

## 4. 存储 `src/utils/medalStorage.ts`(已有,小幅扩展)

localStorage key `hbr_medal_record`,结构(2026-08-04 重做:独立勾选 → 每类累积滑块):
```ts
interface CharMedalRecord {
  cats: Record<string, number>;       // catKey → 该类已完成档数(0..realCount,累积式)
  jewels: Record<string, number>;     // jewelIdx → 0..100
}
type MedalRecord = Record<string, CharMedalRecord>; // key = charId 字符串
```

「累积式」:某类滑块位置 N = 该类前 N 个真实档位完成(如打分=13 则 10w~240w 全完成)。`charBadgeSummary(cats, data, enName)` 由 cats 推导 sum/count/total。

已有 `useMedalRecord` hook(`setCat` / `setJewel` / `setJewelsForChar` / `resetChar`)。另含:
- `addCharacter(name, team)` —— 追加自定义角色(负 id,默认模板),写入 localStorage
- `removeCharacter(id)` —— 仅允许删除自定义角色;内置 61 人不可删(避免误删)

自定义角色列表单独存 key `hbr_medal_custom_chars`。**不引入云同步**(用户未要求;后续可加)。

## 5. UI 设计(延续玻璃拟态 · frontend-design)

**视觉签名(唯一锚点):角色卡片最显眼的是大号 Rank 数字 + 一条细进度弧/条**指向下一 Rank。其余保持安静,全部颜色取自 CSS 变量(`--color-accent-r/g/b`、`--app-*`),透明毛玻璃卡 → 自动兼容壁纸与自定义强调色,亮/暗色均生效。

### 5.1 导航(`src/App.tsx`)

- `PrimaryTab` 增加 `'medal'`;`PRIMARY_TABS` 增加一项:label「勋章」、fullLabel「勋章记录」、图标用勋章(奖牌+绶带)线性 SVG。
- 顶部与移动端子标签行(仿 planner):`勋章` / `宝玉` 两个 sub-tab。
- 移动端底部导航 `grid-cols-4` → `grid-cols-5`。
- `<MedalRecord mode="medal"|"jewel" />` 由 App 控制,用 `display:none` 保留状态(与现有模式一致)。

### 5.2 勋章页

- **顶部整体进度条**(glass 卡):所有可见角色 × 66 档的完成总数与百分比;分段显示 9 类完成数。
- **筛选/排序栏**:
  - 队伍下拉(全部 + 12 个队伍,按 charOrder 内首见序)
  - 进度筛选:全部 / 未开始(done=0)/ 进行中 / 已完成(66/66)/ 完成 ≥ N 项
  - 排序:默认(xlsx 行序)/ Rank 降序 / 完成数降序 / 队伍+名字
  - 名字搜索框(中文/英文名模糊)
- **角色卡片网格**(响应式:桌面多列,移动单列)。每卡:
  - 大号 Rank 数字(如 `R8`)+ 下一 Rank 进度弧
  - 角色名 + 队伍 chip
  - `完成 23/66 · 35%`
  - **点击卡片 → 弹出模态框**(`BadgeDialog.tsx`)填写勋章:9 类别每类一个滑块(0..realCount,累积式),滑块下方是档位阶梯(已完高亮、未完灰、缺失档位为空虚线槽不可点);点击阶梯上的某个档位即把该档及之前全设完成(如点「打分 240w」→ 10w~240w 全完成)
- **新增/删除角色**:顶部「+ 新增角色」内联表单(名字 + 可选队伍),用默认模板创建;自定义角色卡片有「删除」按钮。

### 5.3 宝玉页

- 同一套筛选/排序栏(按队伍/进度/学习数)。
- **矩阵视图**:行 = 角色,列 = 19 种宝玉;单元格 = 勾选框(置 100)+ 滑条(0–100,整数),当前值内联显示;列头宝玉名,行头角色名 + 该角色已习得 x/19。
  - 单元格操作:勾选 → 100;滑条微调 0–100(未勾选也允许,如 50)。
  - 移动端:矩阵横向滚动(19 列固定宽度滚动区)。
- 顶部整体:全部角色已习得宝玉数 / (角色数 × 19)。
- 排序「宝玉进度」按已习得数(==100 计 1)降序。

### 5.4 组件拆分

```
MedalRecord.tsx        页面壳:顶部进度 + 筛选栏 + 切换勋章/宝玉 内容
  └ BadgeChecklist.tsx   勋章:角色卡片网格 + 展开清单
  └ JewelMatrix.tsx      宝玉:角色 × 19 矩阵
  └ RankArc.tsx          大号 Rank + 进度弧(SVG)
```
- 61 角色 × 66 档 × 勾选框在展开时才渲染(卡片折叠默认收起),矩阵 1159 格用 React.memo 控制重渲染。
- 数据加载自 `medalData.json`(静态 import);编辑写入 localStorage。

## 6. 样式 `src/index.css` 新增

- `.rank-number`(大号 Rank 字)、`.rank-arc`(SVG 进度弧,stroke 用 accent)
- `.checklist-cat`(类别块)、`.checklist-grid`(档位网格)
- `.jewel-matrix`(sticky 行/列头、横向滚动)
- 全部基于现有 `--app-*` / `--color-accent-*` 变量,不写死颜色。

## 7. 文件清单

| 文件 | 动作 |
|---|---|
| `scripts/gen-medal-data.mjs` | 改:按 GroupLabel 分类映射、xlsx 档位、charOrder、66 档输出 |
| `src/data/medalData.json` | 重新生成 |
| `src/utils/medalStorage.ts` | 扩展:addCharacter / removeCharacter / 自定义角色存储 |
| `src/components/MedalRecord/MedalRecord.tsx` | 新建(含 5.4 拆分组件) |
| `src/App.tsx` | 改:导航 + sub-tab + 移动端 5 列 |
| `src/index.css` | 改:勋章/宝玉专用样式 |

不改动 `damage.ts`、`storage.ts`(IndexedDB)等现有模块。

## 8. 验证

1. `node scripts/gen-medal-data.mjs` → 输出校验:61 角色、66 档、每角色每类分数与 xlsx 一致、charOrder 61 项(首项 RKayamori)
2. `npm run build` → 无 TS 错误
3. 浏览器手测:
   - 勋章记录 tab 渲染,卡片 Rank 正确(全选 66 档 → R15 MAX)
   - 勾一个档 → Rank/进度实时更新;localStorage 刷新保留
   - 按队伍/进度筛选、默认排序与 xlsx 行序一致
   - 宝玉页勾选=100、滑条 0–100 可调,刷新保留;矩阵移动端可横滚
   - 新增自定义角色 → 可勾选 66 档算 Rank → 可删除;内置角色无删除按钮
   - 亮/暗色 + 自定义强调色 + 壁纸下样式正常

## 9. 明确不做(范围外)

- 不接入云同步/Supabase(用户未要求)
- 不做勋章与宝玉数据互相联动(清单里的「宝玉」类别与 19 宝玉精通度彼此独立)
- 不解析更多 xlsx 字段(Probability/ValueList 等不用)
