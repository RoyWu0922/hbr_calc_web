// 导入 JSON 的格式校验。
// 用于「伤害计算历史」和「排轴记录」的 JSON 文件导入，避免把错误文件
// （例如把排轴 JSON 导进历史、或任意无关 JSON）写进 IndexedDB，
// 导致历史页/排轴页因缺字段而崩溃。
//
// 返回 null 表示通过；否则返回可读的中文错误信息。

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 伤害计算历史：数组，每条需含 input(score+skill) 与 result。 */
export function validateHistoryImport(raw: unknown): string | null {
  if (!Array.isArray(raw)) return '文件格式无效：应为记录数组';
  if (raw.length === 0) return '文件中没有可导入的记录';

  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (!isObj(e)) return `第 ${i + 1} 条不是有效的对象`;
    if (!isObj(e.input)) return `第 ${i + 1} 条缺少 input 配置（这不是伤害计算历史文件）`;
    if (!isObj(e.input.score)) return `第 ${i + 1} 条的 input.score 缺失`;
    if (!isObj(e.input.skill)) return `第 ${i + 1} 条的 input.skill 缺失`;
    if (!isObj(e.result)) return `第 ${i + 1} 条缺少 result 结果（这不是伤害计算历史文件）`;
  }
  return null;
}

/** 排轴记录：数组，每条需含 state(turns+characters)。 */
export function validateAxleImport(raw: unknown): string | null {
  if (!Array.isArray(raw)) return '文件格式无效：应为数组';
  if (raw.length === 0) return '文件中没有可导入的轴';

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!isObj(a)) return `第 ${i + 1} 个轴不是有效的对象`;
    if (!isObj(a.state)) return `第 ${i + 1} 个轴缺少 state（这不是排轴文件）`;

    const st = a.state;
    if (!Array.isArray(st.characters)) return `第 ${i + 1} 个轴的 state.characters 缺失`;
    if (!Array.isArray(st.turns)) return `第 ${i + 1} 个轴的 state.turns 缺失`;

    for (let c = 0; c < st.characters.length; c++) {
      if (!isObj(st.characters[c])) return `第 ${i + 1} 个轴的第 ${c + 1} 个角色数据无效`;
    }
    for (let t = 0; t < st.turns.length; t++) {
      const turn = st.turns[t];
      if (!isObj(turn)) return `第 ${i + 1} 个轴的第 ${t + 1} 行回合数据无效`;
      if (typeof turn.roundLabel !== 'string') return `第 ${i + 1} 个轴的第 ${t + 1} 行缺少 roundLabel`;
      if (!Array.isArray(turn.frontActions)) return `第 ${i + 1} 个轴的第 ${t + 1} 行缺少 frontActions`;
    }
  }
  return null;
}
