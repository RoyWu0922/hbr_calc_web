import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { TurnPlannerState, PlannerTurn, FrontAction, ODMode, ComputedTurnResult } from '../../types';
import { computeTurnPlanner, createDefaultState } from '../../engine/turnPlanner';
import { loadPlannerState, savePlannerState, saveAxle, getSavedAxles, updateAxleLabel, duplicateAxle, deleteAxle, type SavedAxle } from '../../utils/plannerStorage';

type PlannerSubTab = 'detail' | 'simple' | 'saved';

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
          {[1,2,3].map(n => <Fragment key={n}><col style={{ width: 45 }} /><col style={{ width: 30 }} /><col style={{ width: 30 }} /><col style={{ width: 30 }} /></Fragment>)}
          {[1,2,3].map(n => <Fragment key={`b${n}`}><col style={{ width: 36 }} /><col style={{ width: 30 }} /></Fragment>)}
          <col style={{ width: 42 }} /><col style={{ width: 32 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 bg-bg-card z-10">#</th>
            {[1, 2, 3].map(n => <th key={n} colSpan={4} className="text-center border-l border-white/10">前{n}</th>)}
            {[1, 2, 3].map(n => <th key={`b${n}`} colSpan={2} className="text-center border-l border-white/10">后{n}</th>)}
            <th className="border-l border-white/10">被动OD</th>
            <th className="border-l border-white/10">OD</th>
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
              <input className={TINY_NUM} type="number" step="0.1"
                value={state.defaultPassiveOD || ''} placeholder="被动" title="全局被动OD"
                onChange={e => setState({ ...state, defaultPassiveOD: parseFloat(e.target.value) || 0 })} />
            </td>
            <td></td>
          </tr>
          {/* Gap + column labels */}
          <tr style={{ height: 6 }}><td colSpan={99}></td></tr>
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
            const rowBgA = isOD ? 'rgba(239,68,68,0.08)' : isExtra ? 'rgba(34,197,94,0.06)' : '';
            const rowBgB = isOD ? 'rgba(239,68,68,0.04)' : isExtra ? 'rgba(34,197,94,0.03)' : '';
            const frontIdxSet = new Set(turn.frontActions.map(a => a.charIndex).filter(i => i >= 0));
            const backChars = [0, 1, 2, 3, 4, 5].filter(i => !frontIdxSet.has(i));

            return (
              <Fragment key={ti}>
                {/* Row A: 角色 + 行动 */}
                <tr style={{ background: rowBgA }}>
                  <td className={`text-center sticky left-0 z-10 font-bold text-[9px] ${isOD ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}
                    style={{ background: rowBgA || undefined }} rowSpan={2}>
                    <select className="input-field text-[8px] py-0.5 w-full"
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
                    <button className="text-red-400/60 hover:text-red-400 text-[9px] leading-none block mx-auto"
                      onClick={() => removeTurn(ti)} title="删除">X</button>
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
                          <input className={TINY_NUM} type="number" value={turn.backSPGain[bi] || ''} placeholder="0"
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
                    <input className={TINY_NUM} type="number" step="0.1"
                      value={(turn.jailOD + turn.passiveOD) || ''} placeholder="0" title="额外OD"
                      onChange={e => updateTurn(ti, t => ({ ...t, jailOD: parseFloat(e.target.value) || 0, passiveOD: 0 }))} />
                  </td>

                  {/* 当前OD (rowSpan=2) */}
                  <td className={`text-center font-mono font-bold text-xs ${(curResult?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`} rowSpan={2}>
                    {fmtFloat(curResult?.odCapped ?? 0, 2)}
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

  // Front/back team composition: scan all turns for characters that appear in front
  const frontSet = new Set<number>();
  for (const turn of turns) {
    for (const fa of turn.frontActions) {
      if (fa.charIndex >= 0) frontSet.add(fa.charIndex);
    }
  }
  // Default: chars 0-2 front, 3-5 back (matches detail table column layout)
  const frontIndices = frontSet.size > 0
    ? [...frontSet].sort((a, b) => a - b)
    : [0, 1, 2];
  const backIndices = [0,1,2,3,4,5].filter(i => !frontIndices.includes(i));
  const frontNames = frontIndices.map(i => characters[i].name || `C${i+1}`).join('  ');
  const backNames = backIndices.map(i => characters[i].name || `C${i+1}`).join('  ');

  return (
    <div className="space-y-4">
      {/* Meta card */}
      <div className="card space-y-1.5 text-sm">
        <div className="flex gap-6 items-center">
          <span>标题 <input className="input-field text-sm inline w-64" placeholder="第xx期打分 xx队 无限od流" value={title} onChange={e => setTitle(e.target.value)} /></span>
          <span>轴作者 <input className="input-field text-sm inline w-24" placeholder="作者" value={author} onChange={e => setAuthor(e.target.value)} /></span>
          <span>分数 <input className="input-field text-sm inline w-16" type="number" value={score || ''} placeholder="0" onChange={e => setScore(parseInt(e.target.value) || 0)} /></span>
          <span>回合 <input className="input-field text-sm inline w-14" type="number" value={turnsCount || ''} placeholder="0" onChange={e => setTurnsCount(parseInt(e.target.value) || 0)} /></span>
        </div>
        <div>
          队伍组成  前: <span className="font-bold">{frontNames || '—'}</span> | 后: <span className="font-bold">{backNames || '—'}</span>
        </div>
        <div>
          备注 <input className="input-field text-sm inline w-full" placeholder="耳环、突破要求等" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Timeline table */}
      <div className="card overflow-x-auto">
        <table className="planner-table">
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 68 }} />
          </colgroup>
          <thead>
            <tr>
              <th>回合</th>
              <th>行动轴</th>
              <th className="text-right pr-2">当前OD</th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn, ti) => {
              const isOD = isODRound(turn.roundLabel);
              const isExtra = isExtraRound(turn.roundLabel);
              const result = computed[ti];
              const rowBg = isOD ? 'rgba(239,68,68,0.06)' : isExtra ? 'rgba(34,197,94,0.04)' : '';

              // Build action cells with separate name/action for vertical alignment
              const actionPairs = turn.frontActions
                .filter(a => a.charIndex >= 0)
                .map(a => ({
                  name: characters[a.charIndex].name || `C${a.charIndex + 1}`,
                  act: a.action || '—',
                }));
              while (actionPairs.length < 3) actionPairs.push({ name: '', act: '' });

              return (
                <tr key={ti} style={{ background: rowBg }}>
                  <td className={`font-bold text-sm ${isOD ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}>
                    {turn.roundLabel}
                  </td>
                  <td className="text-base">
                    <div className="flex gap-5">
                      {actionPairs.map((pair, ai) => (
                        <span key={ai} className="flex gap-1.5 flex-1">
                          <span className="font-medium text-right" style={{ minWidth: 32 }}>{pair.name}</span>
                          <span className="text-text-muted">{pair.act}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`font-mono font-bold text-sm text-right pr-2 ${(result?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`}>
                    {fmtFloat(result?.odCapped ?? 0, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              <button className="btn btn-primary btn-xs ml-3" onClick={async () => {
                const label = new Date().toLocaleString('zh-CN');
                await saveAxle(label, state, axleScore, axleTurns);
                alert('已保存');
              }}>保存到记录</button>
            </div>
          </div>
          {subTab === 'detail' ? <DetailTable state={state} setState={setState} computed={computed} /> :
           <SimpleTable state={state} computed={computed} score={axleScore} setScore={setAxleScore} turnsCount={axleTurns} setTurnsCount={setAxleTurns} />}
        </>
      )}
    </div>
  );
}
