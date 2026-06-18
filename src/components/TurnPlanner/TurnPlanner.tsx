import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { TurnPlannerState, PlannerTurn, FrontAction, ODMode, ComputedTurnResult } from '../../types';
import { computeTurnPlanner, createDefaultState } from '../../engine/turnPlanner';
import { loadPlannerState, savePlannerState, saveAxle, getSavedAxles, updateAxleLabel, duplicateAxle, deleteAxle, type SavedAxle } from '../../utils/plannerStorage';

type PlannerSubTab = 'detail' | 'simple' | 'saved';

// ─── Floating OD Panel ────────────────────────────────────────
interface ODShared {
  targets: number;
  odRate: number;
  odRise: number;
}

interface ODRow {
  origHit: number;
  addHit: number;
  earring: boolean;
  fixedOD: number;
}

function calcODRow(row: ODRow, shared: ODShared) {
  const { origHit, addHit, earring, fixedOD } = row;
  const { targets, odRate, odRise } = shared;
  const earringVal = earring ? 15 : 0;

  // J: actual OD gain coefficient (Copy-OD method)
  let j: number;
  if (origHit > 9) j = earringVal;
  else if (origHit === 0) j = 0;
  else if (earringVal === 0) j = 0;
  else j = ((origHit - 1) / 9 * (earringVal - 5) + 5);
  j = j / 100 + 1 + odRise / 100;

  const part1 = Math.floor(fixedOD * j * 100) / 100;
  const j25 = Math.floor(j * 2.5 * 100) / 100;
  const part2 = (origHit + addHit) * Math.floor(j25 * odRate) / 100 * targets;
  const n = (part1 + part2) / 100;
  const actualHits = n * 40;
  return { n, actualHits };
}

const OD_NUM = 'bg-transparent border-0 text-center text-[10px] py-0.5 w-full';

function ODPanel() {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<ODShared>({ targets: 1, odRate: 100, odRise: 0 });
  const [rows, setRows] = useState<ODRow[]>([
    { origHit: 0, addHit: 0, earring: true, fixedOD: 0 },
  ]);
  const [showHit, setShowHit] = useState(false);
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 340,
    y: Math.max(0, window.innerHeight / 2 - 250),
  }));
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 340, dragStart.current.px + ev.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.py + ev.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleShowHit = () => setShowHit(prev => !prev);

  const addRow = () => setRows(prev => [...prev, { origHit: 0, addHit: 0, earring: true, fixedOD: 0 }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const updateRow = (i: number, fn: (r: ODRow) => ODRow) => {
    setRows(prev => prev.map((r, idx) => idx === i ? fn(r) : r));
  };

  const [sharedOpen, setSharedOpen] = useState(true);

  return (
    <>
      {/* Always-visible tab at right edge */}
      <div
        className="fixed z-50 flex"
        style={{ right: 0, top: '40%' }}
      >
        {!open ? (
          <button
            className="bg-bg-card border border-white/10 border-r-0 rounded-l-lg px-1.5 py-3 text-[11px] text-text-muted hover:text-text-primary transition-colors"
            style={{ writingMode: 'vertical-rl' }}
            onClick={() => setOpen(true)}
          >
            OD计算
          </button>
        ) : (
          <button
            className="bg-bg-card border border-white/10 rounded-l-lg px-1 py-3 text-[10px] text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        )}
      </div>

      {/* Draggable panel */}
      {open && (
      <div
        ref={panelRef}
        className="fixed z-40 w-[320px] max-h-[80vh] overflow-y-auto glass rounded-xl shadow-2xl"
        style={{ left: pos.x, top: pos.y }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing border-b border-white/10 select-none"
          onMouseDown={onMouseDown}
        >
          <span className="text-xs font-bold">OD 计算</span>
          <button className="text-text-muted hover:text-text-primary text-xs" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="p-2.5 space-y-2">
          {/* Shared properties — collapsible */}
          <div className="glass-strong rounded-lg !p-2 space-y-1.5">
            <div className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setSharedOpen(o => !o)}>
              <span className="text-[10px] font-medium text-text-muted">全局属性</span>
              <span className="text-sm text-text-muted">{sharedOpen ? '▾' : '▸'}</span>
            </div>
            {sharedOpen && (
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <div className="text-[9px] text-text-muted">目标数</div>
                  <input className={OD_NUM} type="number" value={shared.targets || ''}
                    onChange={e => setShared(s => ({ ...s, targets: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <div className="text-[9px] text-text-muted">目标OD率%</div>
                  <input className={OD_NUM} type="number" step="0.5" value={shared.odRate || ''}
                    onChange={e => setShared(s => ({ ...s, odRate: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <div className="text-[9px] text-text-muted">OD上升量%</div>
                  <input className={OD_NUM} type="number" step="0.01" value={shared.odRise || ''}
                    onChange={e => setShared(s => ({ ...s, odRise: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            )}
          </div>

          {/* Column header row */}
          <div className="flex items-center gap-1 px-1 text-[9px] text-text-muted text-center">
            <span className="w-4 flex-shrink-0"></span>
            <span className="flex-1 grid grid-cols-[1fr_1fr_1fr_2fr]">
              <span>技能hit</span>
              <span>附加hit</span>
              <span>固定OD</span>
              <span className="flex justify-between whitespace-nowrap pl-2">
                <span>耳环</span>
                <span className="cursor-pointer hover:text-text-primary" onClick={toggleShowHit}>
                  {showHit ? 'hit数' : '百分比%'}
                </span>
              </span>
            </span>
            <span className="flex-shrink-0" style={{ width: 16 }}></span>
          </div>

          {/* OD rows */}
          <div className="space-y-1">
            {rows.map((row, i) => {
              const r = calcODRow(row, shared);
              return (
                <div key={i} className="glass-strong rounded-lg !p-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted w-4 flex-shrink-0">#{i + 1}</span>
                    <div className="flex-1 grid grid-cols-[1fr_1fr_1fr_2fr]">
                      <input className={OD_NUM} type="number" value={row.origHit || ''}
                        onChange={e => updateRow(i, r => ({ ...r, origHit: parseInt(e.target.value) || 0 }))} />
                      <input className={OD_NUM} type="number" value={row.addHit || ''}
                        onChange={e => updateRow(i, r => ({ ...r, addHit: parseInt(e.target.value) || 0 }))} />
                      <input className={OD_NUM} type="number" step="0.1" value={row.fixedOD || ''}
                        onChange={e => updateRow(i, r => ({ ...r, fixedOD: parseFloat(e.target.value) || 0 }))} />
                      <div className="flex items-center">
                        <label className="cursor-pointer select-none pl-1">
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${row.earring ? 'bg-accent border-accent' : 'toggle-off'}`}
                            onClick={() => updateRow(i, r => ({ ...r, earring: !r.earring }))}>
                            {row.earring && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </label>
                        <span className="text-accent font-bold cursor-pointer select-none text-[10px] border border-white/10 rounded px-1.5 py-0.5 text-center min-w-[48px] ml-auto"
                          onClick={toggleShowHit}>
                          {showHit
                            ? `${r.actualHits.toFixed(3)}`
                            : `${(r.n * 100).toFixed(2)}%`}
                        </span>
                      </div>
                    </div>
                    <button className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0"
                      onClick={() => removeRow(i)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-secondary btn-xs w-full" onClick={addRow}>+ 添加行</button>
        </div>
      </div>
      )}
    </>
  );
}

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}

function fmtFloat(n: number, decimals = 1): string {
  if (!isFinite(n)) return '—';
  return Number(n.toFixed(decimals)).toLocaleString('zh-CN');
}

const OD_MODE_OPTIONS = [
  { value: '300', label: '百分比(300%)' },
  { value: '120', label: 'Hit数(120)' },
] as const;

function isODRound(label: string): boolean { return label.includes('OD'); }
function isExtraRound(label: string): boolean { return label.includes('追加'); }

function getODLevel(label: string): number {
  if (label.includes('OD3')) return 3;
  if (label.includes('OD2')) return 2;
  if (label.includes('OD1')) return 1;
  return 0;
}

function getTurnTypeKey(turn: PlannerTurn): string {
  if (turn.turnType === 'extra') return 'extra';
  if (isODRound(turn.roundLabel)) {
    const prefix = turn.roundLabel.startsWith('后置') ? 'post' : 'pre';
    return `od${getODLevel(turn.roundLabel)}${prefix}`;
  }
  return 'normal';
}

function turnTypeToLabel(type: string, normalNum: number): string {
  switch (type) {
    case 'normal': return String(normalNum);
    case 'extra': return '追加';
    case 'od1pre': return '前置OD1';
    case 'od2pre': return '前置OD2';
    case 'od3pre': return '前置OD3';
    case 'od1post': return '后置OD1';
    case 'od2post': return '后置OD2';
    case 'od3post': return '后置OD3';
    default: return String(normalNum);
  }
}

function emptyFA(): FrontAction {
  return { charIndex: -1, action: '', spCost: 0, spGain: 0, odGain: 0, dr: 0 };
}

function syncNormalLabels(turns: PlannerTurn[]): PlannerTurn[] {
  let counter = 0;
  return turns.map(t => {
    if (!isODRound(t.roundLabel) && !isExtraRound(t.roundLabel)) {
      counter++;
      const expected = String(counter);
      if (t.roundLabel !== expected) return { ...t, roundLabel: expected };
    }
    return t;
  });
}

// ─── Shared tiny input style ──────────────────────────────────
const TINY = 'input-field text-[8px] py-px px-0.5 w-full text-center';
const TINY_NUM = 'input-field text-[8px] py-px px-0 text-center';

// ─── Detail Table ─────────────────────────────────────────────

function DetailTable({
  state, setState, computed,
}: {
  state: TurnPlannerState;
  setState: (s: TurnPlannerState) => void;
  computed: ComputedTurnResult[];
}) {
  const { characters, turns, odMode } = state;

  const updateChar = (i: number, fn: (c: typeof characters[number]) => typeof characters[number]) => {
    const next = [...characters] as typeof characters;
    next[i] = fn(next[i]);
    setState({ ...state, characters: next });
  };

  const updateTurn = (ti: number, fn: (t: PlannerTurn) => PlannerTurn) => {
    let next = turns.map((t, i) => i === ti ? fn(t) : t);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  const updateTurnType = (ti: number, typeKey: string, normalNum: number) => {
    const newLabel = turnTypeToLabel(typeKey, normalNum);
    const newTurnType = typeKey === 'extra' ? 'extra' as const : 'normal' as const;
    let next = turns.map((t, i) => i === ti ? { ...t, roundLabel: newLabel, turnType: newTurnType } : t);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  const addTurn = () => {
    const newTurn: PlannerTurn = {
      roundLabel: '', turnType: 'normal',
      frontActions: [emptyFA(), emptyFA(), emptyFA()],
      backSPGain: [0, 0, 0],
      jailOD: 0, passiveOD: 0, bossDR: 0,
    };
    const next = syncNormalLabels([...turns, newTurn]);
    setState({ ...state, turns: next });
  };

  const removeTurn = (ti: number) => {
    if (turns.length <= 1) return;
    let next = turns.filter((_, i) => i !== ti);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  let normalCounter = 0;

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold">排轴详表</h3>
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] text-text-muted">OD</span>
          <select className="input-field text-[10px] py-0.5 w-28"
            value={String(odMode)} onChange={e => setState({ ...state, odMode: parseInt(e.target.value) as ODMode })}>
            {OD_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <table className="planner-table">
        <colgroup>
          <col style={{ width: 52 }} />
          {[1,2,3].map(n => <Fragment key={n}>
            <col className="planner-col-front planner-col-group-start" style={{ width: 45 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
          </Fragment>)}
          {[1,2,3].map(n => <Fragment key={`b${n}`}>
            <col className="planner-col-back planner-col-group-start" style={{ width: 36 }} />
            <col className="planner-col-back" style={{ width: 30 }} />
          </Fragment>)}
          <col className="planner-col-od planner-col-group-start" style={{ width: 42 }} />
          <col className="planner-col-od" style={{ width: 32 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 bg-bg-card z-10">#</th>
            {[1, 2, 3].map(n => <th key={n} colSpan={4} className="text-center">前{n}</th>)}
            {[1, 2, 3].map(n => <th key={`b${n}`} colSpan={2} className="text-center">后{n}</th>)}
            <th>被动OD</th>
            <th>OD</th>
          </tr>
        </thead>
        <tbody>
          {/* 入场: name + SP side by side */}
          <tr className="bg-indigo-500/8">
            <td className="font-bold sticky left-0 bg-indigo-500/8 z-10 text-[9px]">入场</td>
            {characters.map((c, i) => (
              <td key={i} colSpan={i < 3 ? 4 : 2}>
                <div className="flex gap-0.5">
                  <input className={TINY} style={{ flex: 1 }} placeholder={`C${i + 1}`} value={c.name}
                    onChange={e => updateChar(i, ch => ({ ...ch, name: e.target.value }))} />
                  <input className={TINY} style={{ width: i < 3 ? '28%' : '45%' }} type="number" placeholder="SP"
                    value={c.sp || ''}
                    onChange={e => updateChar(i, ch => ({ ...ch, sp: parseFloat(e.target.value) || 0 }))} />
                </div>
              </td>
            ))}
            <td>
              <input className={TINY_NUM} style={{ border: 'none' }} type="number" step="0.1"
                value={state.defaultPassiveOD || ''} placeholder="被动" title="全局被动OD"
                onChange={e => setState({ ...state, defaultPassiveOD: parseFloat(e.target.value) || 0 })} />
            </td>
            <td></td>
          </tr>
          {/* Gap + column labels */}
          <tr className="planner-spacer"><td colSpan={99}></td></tr>
          <tr className="text-text-muted">
            <td className="text-[8px] text-center sticky left-0 bg-bg-card z-10"></td>
            {[1, 2, 3].map(n => <Fragment key={n}>
              <td className="text-[8px] text-center">角色</td>
              <td className="text-[8px] text-center">消耗SP</td>
              <td className="text-[8px] text-center">获得SP</td>
              <td className="text-[8px] text-center">OD</td>
            </Fragment>)}
            {[1, 2, 3].map(n => <Fragment key={`b${n}`}>
              <td className="text-[8px] text-center">角色</td>
              <td className="text-[8px] text-center">变化SP</td>
            </Fragment>)}
            <td></td><td></td>
          </tr>

          {/* Turns */}
          {turns.map((turn, ti) => {
            const isOD = isODRound(turn.roundLabel);
            const isExtra = isExtraRound(turn.roundLabel);
            const prevResult = ti > 0 ? computed[ti - 1] : null;
            const curResult = computed[ti];
            if (!isOD && !isExtra) normalCounter++;
            const typeKey = getTurnTypeKey(turn);
            const rowBgA = isOD ? 'rgba(239,68,68,0.06)' : isExtra ? 'rgba(34,197,94,0.04)' : '';
            const rowBgB = isOD ? 'rgba(239,68,68,0.03)' : isExtra ? 'rgba(34,197,94,0.02)' : '';
            const frontIdxSet = new Set(turn.frontActions.map(a => a.charIndex).filter(i => i >= 0));
            const backChars = [0, 1, 2, 3, 4, 5].filter(i => !frontIdxSet.has(i));

            return (
              <Fragment key={ti}>
                {/* Row A: 角色 + 行动 */}
                <tr style={{ background: rowBgA }}>
                  <td className={`text-center sticky left-0 z-10 font-bold text-[12px] bg-bg-card ${isOD ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}
                    style={{ background: rowBgA || undefined }} rowSpan={2}>
                    <select className="w-full h-full border-0 bg-transparent text-center font-bold appearance-none cursor-pointer"
                      style={{ color: 'inherit', fontSize: 'inherit' }}
                      value={typeKey} onChange={e => updateTurnType(ti, e.target.value, normalCounter)}>
                      <option value="normal">普通</option>
                      <option value="extra">追加</option>
                      <option value="od1pre">前OD1</option>
                      <option value="od2pre">前OD2</option>
                      <option value="od3pre">前OD3</option>
                      <option value="od1post">后OD1</option>
                      <option value="od2post">后OD2</option>
                      <option value="od3post">后OD3</option>
                    </select>
                  </td>

                  {/* Front 3 — Row A */}
                  {turn.frontActions.map((fa, ai) => (
                    <Fragment key={ai}>
                      <td>
                        <select className="input-field text-[8px] py-0.5 w-full text-center" value={fa.charIndex}
                          onChange={e => {
                            const ci = parseInt(e.target.value);
                            updateTurn(ti, t => {
                              const fns = [...t.frontActions] as typeof t.frontActions;
                              fns[ai] = { ...fns[ai], charIndex: ci };
                              return { ...t, frontActions: fns };
                            });
                          }}>
                          <option value={-1}>—</option>
                          {characters.map((c, ci) => c.name ? <option key={ci} value={ci}>{c.name}</option> : null)}
                        </select>
                      </td>
                      <td colSpan={3}>
                        <input className={TINY} type="text" value={fa.action} placeholder="行动"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], action: e.target.value };
                            return { ...t, frontActions: fns };
                          })} />
                      </td>
                    </Fragment>
                  ))}

                  {/* Back 3 */}
                  {[0, 1, 2].map(bi => {
                    const ci = backChars[bi] ?? -1;
                    return (
                      <Fragment key={bi}>
                        <td className="text-center text-[10px] text-text-muted">
                          {ci >= 0 ? characters[ci].name || ci + 1 : null}
                        </td>
                        <td rowSpan={2}>
                          <input className={TINY_NUM} style={{ border: 'none' }} type="number" value={turn.backSPGain[bi] || ''} placeholder="0"
                            onChange={e => updateTurn(ti, t => {
                              const bg = [...t.backSPGain] as typeof t.backSPGain;
                              bg[bi] = parseFloat(e.target.value) || 0;
                              return { ...t, backSPGain: bg };
                            })} />
                        </td>
                      </Fragment>
                    );
                  })}

                  {/* ±OD (rowSpan=2) */}
                  <td rowSpan={2}>
                    <input className={TINY_NUM} style={{ border: 'none' }} type="number" step="0.1"
                      value={(turn.jailOD + turn.passiveOD) || ''} placeholder="0" title="额外OD"
                      onChange={e => updateTurn(ti, t => ({ ...t, jailOD: parseFloat(e.target.value) || 0, passiveOD: 0 }))} />
                  </td>

                  {/* 当前OD (rowSpan=2) */}
                  <td className={`text-center font-mono font-bold text-xs relative ${(curResult?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`} rowSpan={2}>
                    {fmtFloat(curResult?.odCapped ?? 0, 2)}
                    <button className="absolute -right-5 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-400 text-sm leading-none"
                      onClick={() => removeTurn(ti)} title="删除">✕</button>
                  </td>
                </tr>

                {/* Row B: SP | 消耗 | 获得 | OD */}
                <tr style={{ background: rowBgB }}>
                  {turn.frontActions.map((fa, ai) => {
                    const curSP = prevResult?.sp[fa.charIndex] ?? (fa.charIndex >= 0 ? characters[fa.charIndex].sp : 0);
                    return (
                      <Fragment key={ai}>
                        <td className="text-center font-mono text-xs text-text-muted">{fmt(curSP)}</td>
                        <td><input className={TINY_NUM} type="number" value={fa.spCost || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], spCost: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                        <td><input className={TINY_NUM} type="number" value={fa.spGain || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], spGain: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                        <td><input className={TINY_NUM} type="number" step="0.1" value={fa.odGain || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], odGain: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                      </Fragment>
                    );
                  })}
                  {/* Back 3 — Row B: SP values */}
                  {[0, 1, 2].map(bi => {
                    const ci = backChars[bi] ?? -1;
                    const curSP = ci >= 0 ? (prevResult?.sp[ci] ?? characters[ci].sp) : 0;
                    return (
                      <td key={bi} className="text-center font-mono text-xs text-text-muted">{fmt(curSP)}</td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <button className="btn btn-secondary btn-xs mt-2" onClick={addTurn}>+ 添加回合</button>
    </div>
  );
}

// ─── Simple Table ─────────────────────────────────────────────

const SIMPLE_SLOT_COLORS = [
  'var(--simple-slot1)',
  'var(--simple-slot2)',
  'var(--simple-slot3)',
] as const;

function SimpleTable({
  state, computed, score, setScore, turnsCount, setTurnsCount,
}: {
  state: TurnPlannerState;
  computed: ComputedTurnResult[];
  score: number; setScore: (v: number) => void;
  turnsCount: number; setTurnsCount: (v: number) => void;
}) {
  const { characters, turns } = state;
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [notes, setNotes] = useState('');

  const shareAxle = () => {
    const data = { title, author, score, turns: turnsCount, notes, state };
    const json = JSON.stringify(data);
    const binary = Array.from(new TextEncoder().encode(json)).map(b => String.fromCharCode(b)).join('');
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    navigator.clipboard.writeText(encoded).then(() => alert('分享码已复制到剪贴板')).catch(() => alert('复制失败'));
  };

  const importAxle = () => {
    const encoded = prompt('粘贴分享码:');
    if (!encoded) return;
    try {
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const json = new TextDecoder().decode(bytes);
      const data = JSON.parse(json);
      if (data.title !== undefined) setTitle(data.title);
      if (data.author !== undefined) setAuthor(data.author);
      if (data.turns !== undefined) setTurnsCount(data.turns);
      if (data.notes !== undefined) setNotes(data.notes);
      if (data.score !== undefined) setScore(data.score);
      alert('导入成功！注意：队伍数据需在详表中编辑');
    } catch {
      alert('分享码无效');
    }
  };

  // Front/back team composition: scan all turns for characters that appear in front
  const frontSet = new Set<number>();
  for (const turn of turns) {
    for (const fa of turn.frontActions) {
      if (fa.charIndex >= 0) frontSet.add(fa.charIndex);
    }
  }
  const frontIndices = frontSet.size > 0
    ? [...frontSet].sort((a, b) => a - b)
    : [0, 1, 2];
  const backIndices = [0,1,2,3,4,5].filter(i => !frontIndices.includes(i));
  const frontNames = frontIndices.map(i => characters[i].name || `C${i+1}`).join('  ');
  const backNames = backIndices.map(i => characters[i].name || `C${i+1}`).join('  ');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">排轴简表</span>
        <button className="btn btn-secondary btn-xs px-2" onClick={shareAxle} title="分享">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button className="btn btn-secondary btn-xs px-2" onClick={importAxle} title="导入">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
      <div className="flex gap-4 items-start">
        {/* Left: Meta inputs */}
        <div className="card space-y-2 text-sm flex-shrink-0" style={{ width: 400 }}>
          <div>
            <div className="input-label">标题</div>
            <input className="input-field text-xs py-1.5" placeholder="第xx期打分 xx队 无限od流" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <div className="input-label">轴作者</div>
            <input className="input-field text-xs py-1.5" placeholder="作者" value={author} onChange={e => setAuthor(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="input-label">分数</div>
              <input className="input-field text-xs py-1.5" type="number" value={score || ''} placeholder="0" onChange={e => setScore(parseInt(e.target.value) || 0)} />
            </div>
            <div className="flex-1">
              <div className="input-label">回合</div>
              <input className="input-field text-xs py-1.5" type="number" value={turnsCount || ''} placeholder="0" onChange={e => setTurnsCount(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <div className="input-label">队伍组成</div>
            <div className="text-xs">
              前: <span className="font-bold">{frontNames || '—'}</span><br/>
              后: <span className="font-bold">{backNames || '—'}</span>
            </div>
          </div>
          <div>
            <div className="input-label">备注</div>
            <textarea className="input-field text-xs py-1.5 w-full" rows={3} placeholder="耳环、突破要求等" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Right: Timeline table */}
        <div className="card overflow-x-auto !p-0" style={{ width: '60%' }}>
          <table className="planner-table simple-timeline">
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 64, background: SIMPLE_SLOT_COLORS[0] }} />
              <col style={{ background: SIMPLE_SLOT_COLORS[0] }} />
              <col style={{ width: 64, background: SIMPLE_SLOT_COLORS[1] }} />
              <col style={{ background: SIMPLE_SLOT_COLORS[1] }} />
              <col style={{ width: 64, background: SIMPLE_SLOT_COLORS[2] }} />
              <col style={{ background: SIMPLE_SLOT_COLORS[2] }} />
              <col style={{ width: 72 }} />
            </colgroup>
            {/* Meta header rows */}
            <thead>
              <tr>
                <td colSpan={8} className="font-bold text-xs text-center px-2" style={{ borderBottom: 'none' }}>【{title || '标题'}】 — 作者: {author || '—'}</td>
              </tr>
              <tr>
                <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none' }}>
                  前: <span className="font-bold">{frontNames || '—'}</span> | 后: <span className="font-bold">{backNames || '—'}</span>
                </td>
              </tr>
              {notes && (
                <tr>
                  <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}> {notes}</td>
                </tr>
              )}
              <tr>
                <th>回合</th>
                <th colSpan={2} className="text-center">行动槽1</th>
                <th colSpan={2} className="text-center">行动槽2</th>
                <th colSpan={2} className="text-center">行动槽3</th>
                <th>当前OD</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((turn, ti) => {
                const isOD = isODRound(turn.roundLabel);
                const isExtra = isExtraRound(turn.roundLabel);
                const result = computed[ti];
                const rowBg = isOD ? 'rgba(239,68,68,0.06)' : isExtra ? 'rgba(34,197,94,0.04)' : '';

                const actionPairs = turn.frontActions.map(a => ({
                  name: a.charIndex >= 0 ? (characters[a.charIndex].name || `C${a.charIndex + 1}`) : '',
                  act: a.action || '',
                }));

                return (
                  <tr key={ti} style={{ background: rowBg }}>
                    <td className={`font-bold text-xs ${isOD ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}>
                      {turn.roundLabel}
                    </td>
                    {actionPairs.map((pair, ai) => (
                      <Fragment key={ai}>
                        <td className="font-medium text-xs text-right pr-1">{pair.name}</td>
                        <td className="text-xs text-left pl-1 text-text-muted">{pair.act}</td>
                      </Fragment>
                    ))}
                    <td className={`font-mono font-bold text-xs text-center ${(result?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`}>
                      {fmtFloat(result?.odCapped ?? 0, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Axles ──────────────────────────────────────────────

function SavedAxles({
  onLoad,
}: {
  state: TurnPlannerState;
  onLoad: (s: TurnPlannerState) => void;
}) {
  const [entries, setEntries] = useState<SavedAxle[]>([]);
  const [allEntries, setAllEntries] = useState<SavedAxle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'score' | 'turns'>('time');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const load = async () => {
    setLoading(true);
    const all = await getSavedAxles();
    setAllEntries(all);
    setEntries(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let list = [...allEntries];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.label.toLowerCase().includes(q));
    if (sortBy === 'score') list.sort((a, b) => b.score - a.score);
    else if (sortBy === 'turns') list.sort((a, b) => a.turns - b.turns);
    // default 'time' — already sorted by timestamp from getSavedAxles
    setEntries(list);
  }, [search, allEntries, sortBy]);

  const handleCopy = async (id: number) => {
    await duplicateAxle(id);
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await deleteAxle(id);
    await load();
  };

  const startEdit = (id: number, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    await updateAxleLabel(editingId, editLabel.trim());
    setEditingId(null);
    await load();
  };

  if (loading) return <div className="text-text-muted p-4 text-center">加载中...</div>;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="card">
        <div className="flex gap-2">
          <input className="input-field text-sm flex-1" placeholder="搜索轴…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Saved list */}
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-bold">已保存的轴 ({entries.length})</h3>
          <div className="flex gap-0 text-[10px]">
            <button onClick={() => setSortBy('time')} className={`px-1.5 py-0.5 rounded ${sortBy === 'time' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>时间</button>
            <button onClick={() => setSortBy('score')} className={`px-1.5 py-0.5 rounded ${sortBy === 'score' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>分数</button>
            <button onClick={() => setSortBy('turns')} className={`px-1.5 py-0.5 rounded ${sortBy === 'turns' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>回合</button>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="text-text-muted text-sm text-center py-8">暂无保存</div>
        ) : (
          <div className="space-y-1.5">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 glass-row p-2">
                <div className="flex-1 min-w-0">
                  {editingId === entry.id ? (
                    <input className="input-field text-xs py-0.5 w-full" value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                      autoFocus />
                  ) : (
                    <span className="text-sm cursor-pointer hover:text-accent"
                      onClick={() => entry.id != null && startEdit(entry.id, entry.label)}
                      title="点击编辑名称">
                      {entry.label}
                    </span>
                  )}
                  <div className="text-[10px] text-text-muted">
                    {new Date(entry.timestamp).toLocaleString('zh-CN')}
                    {entry.score > 0 && <span className="ml-3">分数 {entry.score.toLocaleString()}</span>}
                    {entry.turns > 0 && <span className="ml-3">回合 {entry.turns}</span>}
                  </div>
                </div>
                <button className="btn btn-primary btn-xs" onClick={() => onLoad(entry.state)}>加载</button>
                <button className="btn btn-secondary btn-xs" onClick={() => entry.id != null && handleCopy(entry.id)}>复制</button>
                <button className="btn btn-danger btn-xs" onClick={() => entry.id != null && handleDelete(entry.id)}>删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function TurnPlanner({ mode, onSwitchToEditor }: { mode: 'editor' | 'saved'; onSwitchToEditor: () => void }) {
  const [subTab, setSubTab] = useState<PlannerSubTab>('detail');
  const [axleScore, setAxleScore] = useState(0);
  const [axleTurns, setAxleTurns] = useState(0);
  const [state, setState] = useState<TurnPlannerState>(() => {
    const s = createDefaultState();
    return { ...s, turns: syncNormalLabels(s.turns) };
  });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadPlannerState();
      if (saved && saved.turns.length > 0) {
        setState({ ...saved, turns: syncNormalLabels(saved.turns) });
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePlannerState(state), 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, loaded]);

  const computed = useMemo(() => computeTurnPlanner(state), [state]);

  if (!loaded) return <div className="text-text-muted p-8 text-center">加载中...</div>;

  return (
    <div className="space-y-4">
      {mode === 'saved' ? (
        <SavedAxles state={state} onLoad={s => { setState(s); onSwitchToEditor(); }} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">排轴</h2>
            <div className="flex gap-0 items-center">
              <button onClick={() => setSubTab('detail')} className={`sub-tab text-xs ${subTab === 'detail' ? 'active' : ''}`}>排轴详表</button>
              <button onClick={() => setSubTab('simple')} className={`sub-tab text-xs ${subTab === 'simple' ? 'active' : ''}`}>排轴简表</button>
              <button className="btn btn-secondary btn-xs ml-1 px-2" title="重置" onClick={() => {
                if (confirm('确定重置排轴？所有未保存的内容将丢失。')) {
                  setState({ ...createDefaultState(), turns: syncNormalLabels(createDefaultState().turns) });
                }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
              <button className="btn btn-primary btn-xs ml-1 px-2" title="保存到记录" onClick={async () => {
                const label = new Date().toLocaleString('zh-CN');
                await saveAxle(label, state, axleScore, axleTurns);
                alert('已保存');
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </button>
            </div>
          </div>
          {subTab === 'detail' ? <DetailTable state={state} setState={setState} computed={computed} /> :
           <SimpleTable state={state} computed={computed} score={axleScore} setScore={setAxleScore} turnsCount={axleTurns} setTurnsCount={setAxleTurns} />}
        </>
      )}
      <ODPanel />
    </div>
  );
}
