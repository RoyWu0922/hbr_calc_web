# HBR Toolbox — 绯染天空 / Heaven Burns Red 伤害计算器

  
Web 版全能红烧天堂计算工具箱，支持伤害计算、白值计算、OD/破坏/打分、遭遇战出分、受击伤害等。

### 本项目绝大多数代码由deepseek-v4-pro编写, 且为作者第一个项目, 如有bug和建议请多多提issue



## 在线使用

  

**GitHub Pages(国内可能不稳定)**: [roywu0922.github.io/hbr_calc_web](https://roywu0922.github.io/hbr_calc_web)

**Vercel Pages(国内必须开科学)**: [https://hbrtoolbox.vercel.app/](https://hbrtoolbox.vercel.app/)


  

## 功能模块

  

### 伤害计算

- **技能参数**：最大/最小威力、技能等级、基础差值、Hit 数、白值加成、宝珠、Token、特殊、偏向、暴击、武器/属性弱点

- **自定义加攻/减防/弱点区**：技能数据库（可编辑、添加自定义技能），按层数/被动/宝珠/等级计算面板

- **被动 & 装备**：被动加攻/减防/爆伤区 + HP 耳环、戒指、项链

- **OD 计算**：原始 hit、附加 hit、耳环系数、OD 率、目标数

- **破坏计算**：技能 DR、敌人 DR、4 种连击、破坏耳环/项链、加权破坏率 + 逐 Hit 明细

- **打分预估**：难度/回合/词条/盾分，自动计算总分

- **浮动概率可视化**：SVG 正态分布曲线 + 连击 Hit 权重，悬停查看精确概率

- **属性记录/计算**（浮窗）：6 角色力/灵/智/运 → HP偏/DP偏/智偏/运偏，可拖拽、最小化

  

### 白值计算

- 62 名角色全数据(截止26.6.5)

- 三层输出：基础状态值 → 合计状态值（含偏向/配装/专武）→ 有效值 & 共鸣有效值

- 支持等级/徽章/转生/突破/偏向/配装预设/专武/缺失 SS 修正

  

### 额外功能

- **便捷 OD 计算**：原始 hit、附加 hit、固定 OD%、耳环系数（0/10/12/15）、OD 上升量

- **加权破坏计算**：敌人 DR/最大破坏率/初始破坏率、技能 DR/Hit 数、4 种连击、耳环/项链

- **便捷打分**：直接输入总伤害估算打分

- **遭遇战出分**：5 阶段伤害 × 分段线性打分 + 回合分衰减 × 词条

- **受击伤害计算**：体力/精神/偏向 → 技能强度插值 → 加防乘区（印记/项链/被动） → 均伤 & 浮动范围

### 排轴表

- **排轴详表**：6角色排轴，每回合前排 3 角色（角色选择 + 行动描述 + SP 消耗/获得 + OD 获得）、后排 3 角色（SP 获得）

- 回合类型：普通 / 追加 / 前置OD1-3 / 后置OD1-3，OD 自动扣减与封顶（支持 120/300 模式）

- **排轴简表**：回合轴视图，回合 × 行动轴 × 当前OD，角色名与行动名垂直对齐

- **轴表记录**：保存/加载/复制/删除/搜索，支持按分数、回合排序

- IndexedDB 自动保存 + 手动存档，刷新不丢失

  

### 技能数据库

- 支持编辑/删除内置技能、添加自定义技能


### 计算历史

- IndexedDB 本地持久化，支持标签编辑、加载、复制、删除

- **分享码**：导出当前配置为编码字符串，他人可粘贴导入

  

### 主题 & 体验

- 暗/亮双主题切换

- 毛玻璃（Glass-morphism）UI 风格

  

## 技术栈

  

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 存储 | IndexedDB (idb) + localStorage |
| 部署 | GitHub Pages |

  

## 本地开发

  

```bash

git clone https://github.com/RoyWu0922/hbr_calc_web.git

cd hbr_calc_web

npm install

npm run dev # http://localhost:5173

npm run build # 构建到 dist/

```

  

## 参考数据

  

项目根目录下的以下文件为参考的原始数据源：

- `Ori.xlsx` — 伤害计算器

- `Copy-OD.xlsx` — OD 计算器

- `dmg calc.xlsx` — 破坏计算器

- `stats calc.xlsx` — 白值计算器

- `encounter.xlsx` — 遭遇战分数计算器

- `float.txt` - 浮动计算器

  

## Dev

  
- Ac1dlc — [GitHub](https://github.com/RoyWu0922) | [B站](https://space.bilibili.com/511146986)

感谢：
- 数据库: [hbr.quest](https://hbr.quest)
- 伤害计算器&遭遇战分数计算器: [我的心情复杂(b站主页)](https://space.bilibili.com/252297123)
- od计算器: [不会打牌的qeit(b站主页)](https://space.bilibili.com/269335316)
- 白值计算器: [凛冬_(b站主页)](https://space.bilibili.com/73493230)
- 破坏计算器&浮动计算器: [ProSGrnium(b站主页)](https://space.bilibili.com/325104293)
- 额外支持: [Zjyium(b站主页)](https://space.bilibili.com/3546725866276984)
  

## License

  

MIT