import { useState, Fragment } from 'react';

const SLOTS = 6;
const MAX_TURNS = 20;
const OD_CAP = 300; // 百分比模式

function fmt(n: number): string { return Math.round(n).toLocaleString('zh-CN'); }

export default function TurnPlannerPage() {
  // Char names
  const [names, setNames] = useState<string[]>(Array(SLOTS).fill(''));
  // Base SP gain per char (row 4)
  const [baseSP, setBaseSP] = useState<number[]>(Array(SLOTS).fill(0));
  // Initial SP (row 5, before turn starts)
  const [initSP, setInitSP] = useState<number[]>(Array(SLOTS).fill(0));
  // Turn data — each turn has an "action row" and a computed "SP row"
  // Action inputs per turn: for each of 6 slots
  type TurnData = {
    label: string;          // action label for slot 1
    actions: { charIdx: number; cost: number; gain: number; od: number }[]; // front 3
    backGains: number[];    // back 3 SP gain
    extraOD: number;        // 额外OD this turn
  };
  const [turns, setTurns] = useState<TurnData[]>(
    Array.from({ length: MAX_TURNS }, () => ({
      label: '',
      actions: Array.from({ length: 3 }, () => ({ charIdx: -1, cost: 0, gain: 0, od: 0 })),
      backGains: Array(SLOTS - 3).fill(0),
      extraOD: 0,
    })),
  );

  const updateName = (i: number, v: string) => setNames(p => { const n = [...p]; n[i] = v; return n; });
  const updateBase = (i: number, v: number) => setBaseSP(p => { const n = [...p]; n[i] = v; return n; });
  const updateInit = (i: number, v: number) => setInitSP(p => { const n = [...p]; n[i] = v; return n; });

  const updateTurn = (ti: number, fn: (t: TurnData) => TurnData) => {
    setTurns(p => { const n = [...p]; n[ti] = fn(n[ti]); return n; });
  };

  // Compute SP and OD per turn
  const sp: number[] = [...initSP];
  const computed: { sp: number[]; od: number }[] = [];
  let currentOD = 0;

  for (let ti = 0; ti < MAX_TURNS; ti++) {
    const t = turns[ti];
    // Apply base SP
    for (let i = 0; i < SLOTS; i++) sp[i] += baseSP[i];
    // Apply actions
    for (let a = 0; a < 3; a++) {
      const ci = t.actions[a].charIdx;
      if (ci >= 0 && ci < SLOTS) {
        sp[ci] = sp[ci] - t.actions[a].cost + t.actions[a].gain;
      }
    }
    // Apply back gains
    for (let b = 0; b < 3; b++) {
      // back slots are indices 3,4,5 — but gain can go to any char?
      // Actually per the format, back slots are chars 4-6 (indices 3-5)
      sp[3 + b] += t.backGains[b];
    }
    // OD
    const turnOD = t.actions.reduce((s, a) => s + a.od, 0) + t.extraOD;
    currentOD = Math.min(currentOD + turnOD, OD_CAP);
    computed.push({ sp: [...sp], od: currentOD });
  }

  return (
    <div className="space-y-4 max-w-full">
      <div>
        <h2 className="text-xl font-bold">排轴</h2>
        <p className="text-sm text-text-muted">6 角色排轴表 — 每回合 3 个角色行动</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="text-[10px] w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            {/* Row 1: Group headers */}
            <tr>
              <th rowSpan={2} className="sticky left-0 bg-bg-card">回合</th>
              {[1, 2, 3].map(n => <th key={n} colSpan={4} className="border-b border-white/10">前{n}</th>)}
              {[4, 5, 6].map(n => <th key={n} colSpan={2} className="border-b border-white/10">后{n - 3}</th>)}
              <th rowSpan={2}>额外OD</th>
              <th rowSpan={2}>当前OD</th>
            </tr>
            {/* Row 2: Sub-headers */}
            <tr>
              {[1, 2, 3].map(n => <Fragment key={n}><th>当前SP</th><th>消耗</th><th>获得</th><th>OD</th></Fragment>)}
              {[1, 2, 3].map(n => <Fragment key={n}><th>当前SP</th><th>获得</th></Fragment>)}
            </tr>
          </thead>
          <tbody>
            {/* Row: 入场 (char names) */}
            <tr style={{ background: 'rgba(99,102,241,0.08)' }}>
              <td className="font-bold">入场</td>
              {names.map((n, i) => (
                <td key={i} colSpan={i < 3 ? 4 : 2}>
                  <input className="input-field text-[9px] py-1 w-full text-center" placeholder={['前1','前2','前3','后1','后2','后3'][i]}
                    value={n} onChange={e => updateName(i, e.target.value)} />
                </td>
              ))}
              <td></td><td></td>
            </tr>
            {/* Row: base SP */}
            <tr>
              <td className="text-text-muted text-right pr-1">基础SP</td>
              {baseSP.map((v, i) => (
                <Fragment key={i}>
                  <td colSpan={i < 3 ? 3 : 1}></td>
                  <td>
                    <input className="input-field text-[9px] py-0.5 w-full text-center" type="number" value={v || ''}
                      onChange={e => updateBase(i, parseFloat(e.target.value) || 0)} />
                  </td>
                  {i < 3 && <td></td>}
                </Fragment>
              ))}
              <td></td><td></td>
            </tr>
            {/* Row: initial SP */}
            <tr>
              <td className="text-text-muted text-right pr-1">初始SP</td>
              {initSP.map((v, i) => (
                <td key={i} colSpan={i < 3 ? 4 : 2}>
                  <input className="input-field text-[9px] py-0.5 w-full text-center" type="number" value={v || ''}
                    onChange={e => updateInit(i, parseFloat(e.target.value) || 0)} />
                </td>
              ))}
              <td></td><td></td>
            </tr>
            {/* Turns */}
            {turns.map((t, ti) => (
              <Fragment key={ti}>
                {/* Action row */}
                <tr className="hover:bg-white/5">
                  <td className="font-bold text-center">{ti + 1}</td>
                  {/* Front 3 */}
                  {t.actions.map((a, ai) => (
                    <Fragment key={ai}>
                      <td className="text-center font-mono text-text-muted">{fmt(computed[ti]?.sp[ai] ?? 0)}</td>
                      <td><input className="input-field text-[9px] py-0.5 w-full text-center" type="number" value={a.cost || ''}
                        onChange={e => updateTurn(ti, t => { const n = {...t}; n.actions[ai] = {...n.actions[ai], cost: parseFloat(e.target.value)||0}; return n; })} /></td>
                      <td><input className="input-field text-[9px] py-0.5 w-full text-center" type="number" value={a.gain || ''}
                        onChange={e => updateTurn(ti, t => { const n = {...t}; n.actions[ai] = {...n.actions[ai], gain: parseFloat(e.target.value)||0}; return n; })} /></td>
                      <td><input className="input-field text-[9px] py-0.5 w-full text-center" type="number" step={0.1} value={a.od || ''}
                        onChange={e => updateTurn(ti, t => { const n = {...t}; n.actions[ai] = {...n.actions[ai], od: parseFloat(e.target.value)||0}; return n; })} /></td>
                    </Fragment>
                  ))}
                  {/* Back 3 */}
                  {Array.from({ length: 3 }, (_, bi) => (
                    <Fragment key={bi}>
                      <td className="text-center font-mono text-text-muted">{fmt(computed[ti]?.sp[3 + bi] ?? 0)}</td>
                      <td><input className="input-field text-[9px] py-0.5 w-full text-center" type="number" value={t.backGains[bi] || ''}
                        onChange={e => updateTurn(ti, t => { const n = {...t}; const bg = [...n.backGains]; bg[bi] = parseFloat(e.target.value)||0; return {...n, backGains: bg}; })} /></td>
                    </Fragment>
                  ))}
                  <td><input className="input-field text-[9px] py-0.5 w-full text-center" type="number" step={0.1} value={t.extraOD || ''}
                    onChange={e => updateTurn(ti, t => ({...t, extraOD: parseFloat(e.target.value)||0}))} /></td>
                  <td className="text-center font-mono text-accent font-bold">{fmt(computed[ti]?.od ?? 0)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
