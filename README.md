# HBR Toolbox — 绯染天空 / Heaven Burns Red 伤害计算器

基于游戏电子表格还原的 Web 版全能计算工具箱，支持伤害计算、白值计算、OD/破坏/打分、遭遇战出分、受击伤害等。

> 数据来源: [hbr.quest](https://hbr.quest) | 凛冬\_ 白值计算器 | Ori.xlsx / Copy-OD.xlsx / dmg calc.xlsx / stats calc.xlsx / encounter.xlsx

## 在线使用

| 平台 | 地址 |
|------|------|
| **Vercel** | [hbr-calc-web.vercel.app](https://hbr-calc-web.vercel.app) |
| **GitHub Pages** | [roywu0922.github.io/hbr_calc_web](https://roywu0922.github.io/hbr_calc_web) |

## 功能模块

### 伤害计算
- **技能参数**：最大/最小威力、技能等级、基础差值、Hit 数、白值加成、宝珠、Token、特殊、偏向、暴击、武器/属性弱点
- **加攻/减防/弱点区**：技能数据库（hbr.quest 数据，可编辑、添加自定义技能），按层数/被动/宝珠/等级计算面板
- **被动 & 装备**：被动加攻/减防/爆伤区 + HP 耳环、戒指、项链
- **OD 计算**（Copy-OD 法）：原始 hit、附加 hit、耳环系数、OD 率、目标数
- **破坏计算**（dmg calc 法）：技能 DR、敌人 DR、4 种连击、破坏耳环/项链、加权破坏率 + 逐 Hit 明细
- **打分预估**：难度/回合/词条/盾分，自动计算总分
- **浮动概率可视化**：SVG 正态分布曲线 + 连击 Hit 权重，悬停查看精确概率

### 白值计算
- 62 名角色全数据（来源 stats calc.xlsx）
- 三层输出：基础状态值 → 合计状态值（含偏向/配装/专武）→ 有效值 & 共鸣有效值
- 支持等级/徽章/转生/突破/偏向/配装预设/专武/缺失 SS 修正

### 额外功能
- **便捷 OD 计算**：原始 hit、附加 hit、固定 OD%、耳环系数（0/10/12/15）、OD 上升量
- **加权破坏计算**：敌人 DR/最大破坏率/初始破坏率、技能 DR/Hit 数、4 种连击、耳环/项链
- **便捷打分**：直接输入总伤害估算打分
- **遭遇战出分**（encounter.xlsx）：5 阶段伤害 × 分段线性打分 + 回合分衰减 × 词条
- **受击伤害计算**：体力/精神/偏向 → 技能强度插值 → 加防乘区（印记/项链/被动） → 均伤 & 浮动范围
- **属性记录/计算**（浮窗）：6 角色力/灵/智/运 → HP偏/DP偏/智偏/运偏，可拖拽、最小化

### 技能数据库
- 内置 Buff/Debuff/弱点技能（来自 hbr.quest）
- 支持编辑/删除内置技能、添加自定义技能
- 修改自动保存至 localStorage

### 计算历史
- IndexedDB 持久化，支持标签编辑、加载、复制、删除
- **分享码**：导出当前配置为编码字符串，他人可粘贴导入

### 主题 & 体验
- 暗/亮双主题切换
- 毛玻璃（Glass-morphism）UI 风格
- 收起/展开折叠面板
- 图片参考弹窗（点击 `?` 图标）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 存储 | IndexedDB (idb) + localStorage |
| 部署 | Vercel / GitHub Pages |

## 本地开发

```bash
git clone https://github.com/RoyWu0922/hbr_calc_web.git
cd hbr_calc_web
npm install
npm run dev       # http://localhost:5173
npm run build     # 构建到 dist/
```

## 项目结构

```
src/
├── types.ts                    # TypeScript 类型定义
├── engine/
│   ├── damage.ts               # 核心引擎：伤害/OD/破坏/打分/遭遇战/受击
│   ├── skillDb.ts              # 内置技能数据库 + 分数表
│   ├── customSkills.ts         # 自定义技能 CRUD (localStorage)
│   ├── whiteStats.ts           # 白值计算引擎
│   ├── whiteStatsData.ts       # 62 角色成长数据 + 偏向/配装/徽章表
│   └── floatProb.ts            # 浮动概率（特征函数法）
├── components/
│   ├── DamageCalc/
│   │   ├── DamageCalculator.tsx # 伤害计算主界面
│   │   └── DamageResult.tsx    # 结果展示 + 浮动概率分布图
│   ├── ExtraFeatures/
│   │   └── ExtraFeatures.tsx   # OD/破坏/打分/遭遇战/受击计算
│   ├── WhiteStats/
│   │   └── WhiteStats.tsx      # 白值计算界面
│   ├── SkillDb/
│   │   └── SkillDatabase.tsx   # 技能数据库界面
│   ├── History/
│   │   └── HistoryPage.tsx     # 计算历史
│   ├── FloatingBiasCalc.tsx    # 浮窗：属性记录/偏向计算
│   ├── CollapsibleSection.tsx  # 折叠面板
│   └── ImageInfoTip.tsx        # 图片弹窗组件
├── utils/
│   ├── storage.ts              # IndexedDB 操作
│   ├── shareUrl.ts             # 分享码编解码
│   └── theme.tsx               # 暗/亮主题 Context
├── App.tsx                     # 主导航
├── index.css                   # 全局样式 + 主题变量
└── main.tsx                    # 入口
```

## 参考数据

项目根目录下的 `.xlsx` 文件为原始电子表格数据源：
- `Ori.xlsx` — 原始伤害计算器
- `Copy-OD.xlsx` — OD 计算器
- `dmg calc.xlsx` — 破坏计算器
- `stats calc.xlsx` — 白值计算器
- `encounter.xlsx` — 遭遇战出分

## 作者

- **RoyWu0922** — [GitHub](https://github.com/RoyWu0922) | [B站](https://space.bilibili.com/511146986)
- 数据贡献：[hbr.quest](https://hbr.quest) | 凛冬\_

## License

MIT
