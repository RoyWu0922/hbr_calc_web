import { useState, useEffect, useMemo } from 'react';
import { CalcHistoryEntry, DamageResultData } from '../../types';
import { getHistory, deleteHistoryEntry, deleteHistoryEntries, clearHistory, duplicateHistoryEntry, updateHistoryLabel, updateHistoryNotes, getAllHistory, importHistoryEntries, createFolder, getFolders, updateFolder, deleteFolder, setHistoryFolder } from '../../utils/storage';
import { decodeShareData } from '../../utils/shareUrl';
import type { Folder } from '../../types';

type SortKey = 'time' | 'label' | 'score' | 'turns';

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-CN');
}

function getEntryScore(entry: CalcHistoryEntry): number {
  return entry.result?.score?.totalScore ?? 0;
}

function getEntryTurns(entry: CalcHistoryEntry): number {
  return entry.input?.score?.turns ?? 0;
}

export default function HistoryPage({ onLoad }: { onLoad: (entry: CalcHistoryEntry) => void }) {
  const [allEntries, setAllEntries] = useState<CalcHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [importCode, setImportCode] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderFilter, setFolderFilter] = useState<number | 'all' | 'uncategorized'>('all');

  const loadHistory = async () => {
    setLoading(true);
    try {
      setAllEntries(await getHistory());
      setFolders(await getFolders('calc'));
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const entries = useMemo(() => {
    let list = [...allEntries];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.label.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    }
    if (folderFilter === 'uncategorized') {
      list = list.filter(e => e.folderId == null);
    } else if (folderFilter !== 'all') {
      list = list.filter(e => e.folderId === folderFilter);
    }
    switch (sortBy) {
      case 'label':
        list.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
        break;
      case 'score':
        list.sort((a, b) => getEntryScore(b) - getEntryScore(a));
        break;
      case 'turns':
        list.sort((a, b) => getEntryTurns(a) - getEntryTurns(b));
        break;
    }
    return list;
  }, [allEntries, search, sortBy]);

  const handleDelete = async (id: number) => {
    await deleteHistoryEntry(id);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await loadHistory();
  };

  const handleBatchDelete = async () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条记录？`)) return;
    await deleteHistoryEntries([...selectedIds]);
    setSelectedIds(new Set());
    await loadHistory();
  };

  const handleClear = async () => {
    if (confirm('确定要清除所有历史记录吗？')) { await clearHistory(); await loadHistory(); }
  };

  const handleCopy = async (id: number) => {
    try {
      await duplicateHistoryEntry(id);
      await loadHistory();
    } catch { alert('复制失败'); }
  };

  const startEdit = (id: number, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const startEditNotes = (id: number, notes: string) => {
    setEditingNotesId(id);
    setEditNotes(notes || '');
  };

  const handleImport = () => {
    const code = importCode.trim();
    if (!code) return;
    const decoded = decodeShareData(code);
    if (!decoded) { alert('无效的分享码'); return; }
    const entry: CalcHistoryEntry = {
      timestamp: Date.now(),
      label: '分享导入',
      input: decoded,
      result: null as unknown as DamageResultData,
    };
    onLoad(entry);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    try {
      await updateHistoryLabel(editingId, editLabel.trim());
      setAllEntries(prev => prev.map(e => e.id === editingId ? { ...e, label: editLabel.trim() } : e));
    } catch { /* */ }
    setEditingId(null);
  };

  const saveNotesEdit = async () => {
    if (editingNotesId == null) return;
    try {
      await updateHistoryNotes(editingNotesId, editNotes.trim());
      setAllEntries(prev => prev.map(e => e.id === editingNotesId ? { ...e, notes: editNotes.trim() } : e));
    } catch { /* */ }
    setEditingNotesId(null);
  };

  // ─── Export / Import ──────────────────────────────────────

  const handleExport = async () => {
    const all = await getAllHistory();
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hbr-calc-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('格式无效');
        if (!confirm(`将导入 ${parsed.length} 条记录，确定？`)) return;
        await importHistoryEntries(parsed);
        await loadHistory();
        alert('导入成功');
      } catch (err) {
        alert('导入失败: ' + (err instanceof Error ? err.message : '无效的JSON文件'));
      }
    };
    input.click();
  };

  // ─── Compare ──────────────────────────────────────────────

  const toggleCompare = (id: number) => {
    if (!compareMode) {
      setCompareMode(true);
      setCompareIds([id]);
    } else if (compareIds.includes(id)) {
      setCompareIds(compareIds.filter(i => i !== id));
    } else if (compareIds.length < 2) {
      setCompareIds([...compareIds, id]);
    }
  };

  const doCompare = () => {
    if (compareIds.length !== 2) return;
    const e1 = allEntries.find(e => e.id === compareIds[0]);
    const e2 = allEntries.find(e => e.id === compareIds[1]);
    if (!e1 || !e2) return;
    setCompareMode(false);
    setCompareIds([]);
    setCompareEntries([e1, e2]);
  };

  const [compareEntries, setCompareEntries] = useState<[CalcHistoryEntry, CalcHistoryEntry] | null>(null);

  // ─── Loading / Empty ──────────────────────────────────────

  if (loading) return <div className="text-text-muted p-8 text-center">加载中...</div>;

  if (allEntries.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-text-muted text-lg mb-2">暂无计算历史</div>
        <div className="text-text-muted text-sm">进行伤害计算并保存后，历史记录会出现在这里</div>
        <div className="mt-4 flex justify-center gap-1.5">
          <input className="input-field w-64 text-xs py-1.5" placeholder="粘贴分享码导入…"
            value={importCode} onChange={e => setImportCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleImport(); }} />
          <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!importCode.trim()}>导入</button>
          <button className="btn btn-secondary btn-sm" onClick={handleImportFile}>导入JSON</button>
        </div>
      </div>
    );
  }

  // ─── Select all handler ───────────────────────────────────
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(e => e.id!)));
  };

  return (
    <div className="space-y-4">
      {/* Compare modal */}
      {compareEntries && (
        <CompareModal entries={compareEntries} onClose={() => setCompareEntries(null)} />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">计算历史 ({entries.length}{search ? '/' + allEntries.length : ''})</h2>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1.5">
            <input className="input-field w-64 text-xs py-1.5" placeholder="分享码导入（回车确认）"
              value={importCode} onChange={e => setImportCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleImport(); }} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>导出JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={handleImportFile}>导入JSON</button>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>删除选中 ({selectedIds.size})</button>
          )}
          <button className="btn btn-danger" onClick={handleClear}>清除全部</button>
        </div>
      </div>

      {/* Search + Sort + Compare */}
      <div className="card">
        <div className="flex gap-3 items-center">
          <input className="input-field text-sm flex-1" placeholder="搜索标签或备注…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex gap-0 text-[10px] flex-shrink-0">
            {(['time', 'label', 'score', 'turns'] as SortKey[]).map(k => (
              <button key={k} onClick={() => setSortBy(k)}
                className={`px-2 py-0.5 rounded ${sortBy === k ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
                {{ time: '时间', label: '标签', score: '分数', turns: '回合' }[k]}
              </button>
            ))}
          </div>
          <button className={`btn btn-xs ${compareMode ? 'bg-accent/20 text-accent' : 'btn-secondary'}`}
            onClick={() => { setCompareMode(!compareMode); setCompareIds([]); }}>
            对比{compareMode ? ` (${compareIds.length}/2)` : ''}
          </button>
          {compareMode && compareIds.length === 2 && (
            <button className="btn btn-primary btn-xs" onClick={doCompare}>开始对比</button>
          )}
        </div>
      </div>

      {/* Folder filter */}
      <div className="card">
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-[10px] text-text-muted mr-1">分组:</span>
          {(['all', 'uncategorized'] as const).map(k => (
            <button key={k} onClick={() => setFolderFilter(k)}
              className={`px-2 py-0.5 rounded text-xs ${folderFilter === k ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
              {{ all: '全部', uncategorized: '未分类' }[k]}
            </button>
          ))}
          {folders.map(f => (
            <button key={f.id} onClick={() => setFolderFilter(f.id!)}
              className={`px-2 py-0.5 rounded text-xs ${folderFilter === f.id ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
              {f.name}
            </button>
          ))}
          <button className="btn btn-xs px-1.5 text-text-muted hover:text-text-primary" title="新建分组"
            onClick={async () => {
              const name = prompt('新建分组名称:');
              if (!name?.trim()) return;
              await createFolder(name.trim(), 'calc');
              setFolders(await getFolders('calc'));
            }}>+</button>
          {folderFilter !== 'all' && folderFilter !== 'uncategorized' && (
            <>
              <button className="btn btn-xs px-1.5 text-text-muted hover:text-text-primary" title="重命名"
                onClick={async () => {
                  const f = folders.find(f => f.id === folderFilter);
                  if (!f) return;
                  const name = prompt('重命名:', f.name);
                  if (!name?.trim()) return;
                  await updateFolder(f.id!, { name: name.trim() });
                  setFolders(await getFolders('calc'));
                }}>✎</button>
              <button className="btn btn-xs px-1.5 text-red-400/60 hover:text-red-400" title="删除分组"
                onClick={async () => {
                  const f = folders.find(f => f.id === folderFilter);
                  if (!f || !confirm(`删除分组 "${f.name}"？条目将移至未分类。`)) return;
                  await deleteFolder(f.id!);
                  setFolderFilter('all');
                  setFolders(await getFolders('calc'));
                  await loadHistory();
                }}>✕</button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <span className="inline-flex cursor-pointer select-none" onClick={toggleSelectAll}>
                  <span className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${allSelected ? 'bg-accent border-accent' : 'toggle-off'}`}>
                    {allSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                </span>
              </th>
              {compareMode && <th style={{ width: 32 }}></th>}
              <th>标签</th>
              <th>备注</th>
              <th>难度</th>
              <th>回合</th>
              <th>衰减后伤害</th>
              <th>伤害分</th>
              <th>总分</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const r = entry.result;
              const s = entry.input.score;
              return (
                <tr key={entry.id} className={`hover:bg-bg-input/30 ${compareMode && compareIds.includes(entry.id!) ? 'bg-accent/10' : ''}`}>
                  <td>
                    <span className="inline-flex cursor-pointer select-none"
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (next.has(entry.id!)) next.delete(entry.id!);
                        else next.add(entry.id!);
                        setSelectedIds(next);
                      }}>
                      <span className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${selectedIds.has(entry.id!) ? 'bg-accent border-accent' : 'toggle-off'}`}>
                        {selectedIds.has(entry.id!) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                    </span>
                  </td>
                  {compareMode && (
                    <td>
                      <span className="inline-flex cursor-pointer select-none" onClick={() => toggleCompare(entry.id!)}>
                        <span className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${compareIds.includes(entry.id!) ? 'bg-accent border-accent' : 'toggle-off'}`}>
                          {compareIds.includes(entry.id!) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </span>
                      </span>
                    </td>
                  )}
                  <td className="font-medium" style={{ minWidth: 120 }}>
                    {editingId === entry.id ? (
                      <input className="input-field text-xs py-1 w-full" value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                        autoFocus />
                    ) : (
                      <span className="cursor-pointer hover:text-accent border-b border-dotted" style={{ borderColor: 'var(--app-toggle-border)' }}
                        onClick={() => entry.id && startEdit(entry.id, entry.label)} title="点击编辑标签">
                        {entry.label || '(无标签)'}
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: 160 }}>
                    {editingNotesId === entry.id ? (
                      <input className="input-field text-xs py-1 w-full" value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        onBlur={saveNotesEdit}
                        onKeyDown={e => { if (e.key === 'Enter') saveNotesEdit(); }}
                        autoFocus />
                    ) : (
                      <span className="text-xs text-text-muted cursor-pointer hover:text-text-secondary truncate block"
                        style={{ maxWidth: 160 }}
                        onClick={() => entry.id && startEditNotes(entry.id, entry.notes || '')}
                        title={entry.notes || '点击添加备注'}>
                        {entry.notes || '—'}
                      </span>
                    )}
                  </td>
                  <td>{s.difficulty}</td>
                  <td>{s.turns}</td>
                  <td className="font-mono text-gold">{fmt(r.postAttenuation)}</td>
                  <td className="font-mono">{r.score ? fmt(r.score.damageScore) : '—'}</td>
                  <td className="font-mono text-gold font-bold">{r.score ? fmt(r.score.totalScore) : '—'}</td>
                  <td className="text-text-muted text-xs">{new Date(entry.timestamp).toLocaleString('zh-CN')}</td>
                  <td>
                    <div className="flex gap-1.5 items-center">
                      <select className="input-field text-[10px] py-0 w-16" value={entry.folderId ?? ''}
                        onChange={async e => {
                          const v = e.target.value;
                          const fid = v === '' ? undefined : v === '__new__' ? null : parseInt(v);
                          if (fid === null) {
                            const name = prompt('新建分组:');
                            if (!name?.trim()) return;
                            const id = await createFolder(name.trim(), 'calc');
                            await setHistoryFolder(entry.id!, id);
                            setFolders(await getFolders('calc'));
                          } else {
                            await setHistoryFolder(entry.id!, fid);
                          }
                          await loadHistory();
                        }}>
                        <option value="">—</option>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        <option value="__new__">+ 新建</option>
                      </select>
                      <button className="btn btn-primary btn-xs px-2" onClick={() => onLoad(entry)} title="加载">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="btn btn-secondary btn-xs px-2" onClick={() => entry.id && handleCopy(entry.id)} title="复制">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                      <button className="btn btn-danger btn-xs px-2" onClick={() => entry.id && handleDelete(entry.id)} title="删除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
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

// ─── Compare Modal ──────────────────────────────────────────

function CompareModal({ entries, onClose }: { entries: [CalcHistoryEntry, CalcHistoryEntry]; onClose: () => void }) {
  const [e1, e2] = entries;

  function diffRow(label: string, v1: string, v2: string) {
    const differs = v1 !== v2;
    return (
      <tr className={differs ? 'bg-amber-500/6' : ''}>
        <td className="text-xs font-medium text-text-muted">{label}</td>
        <td className={`font-mono text-xs ${differs ? 'text-amber-200' : ''}`}>{v1}</td>
        <td className={`font-mono text-xs ${differs ? 'text-amber-200' : ''}`}>{v2}</td>
      </tr>
    );
  }

  const i1 = e1.input; const i2 = e2.input;
  const r1 = e1.result; const r2 = e2.result;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card max-w-[95vw] max-h-[90vh] overflow-y-auto" style={{ minWidth: 700 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">配置对比</h3>
          <button className="btn btn-secondary btn-xs" onClick={onClose}>关闭</button>
        </div>
        <div className="flex gap-1 mb-3 text-xs text-text-muted">
          <span className="flex-1 font-bold text-text-primary">{e1.label}</span>
          <span className="px-2">vs</span>
          <span className="flex-1 font-bold text-text-primary text-right">{e2.label}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>{e1.label || '条目1'}</th>
              <th>{e2.label || '条目2'}</th>
            </tr>
          </thead>
          <tbody>
            {diffRow('最大威力', String(i1.skill.maxPower), String(i2.skill.maxPower))}
            {diffRow('技能等级', String(i1.skill.skillLevel), String(i2.skill.skillLevel))}
            {diffRow('基础差值', String(i1.skill.baseDiff), String(i2.skill.baseDiff))}
            {diffRow('Hit数', String(i1.skill.hitCount), String(i2.skill.hitCount))}
            {diffRow('暴击', i1.skill.isCrit ? '是' : '否', i2.skill.isCrit ? '是' : '否')}
            {diffRow('宝珠', String(i1.skill.orb), String(i2.skill.orb))}
            {diffRow('偏向', String(i1.skill.deviation), String(i2.skill.deviation))}
            {diffRow('Token', String(i1.skill.token), String(i2.skill.token))}
            {diffRow('特殊', String(i1.skill.special), String(i2.skill.special))}
            {diffRow('加攻区', r1.atkFactor.toFixed(3), r2.atkFactor.toFixed(3))}
            {diffRow('减防区', r1.defFactor.toFixed(3), r2.defFactor.toFixed(3))}
            {diffRow('弱点区', r1.weaknessFactor.toFixed(3), r2.weaknessFactor.toFixed(3))}
            {diffRow('爆伤区', r1.critFactor.toFixed(1), r2.critFactor.toFixed(1))}
            {diffRow('连击倍率', String(i1.chainMul), String(i2.chainMul))}
            {diffRow('破坏倍率', String(i1.breakMul), String(i2.breakMul))}
            {diffRow('OD倍率', String(i1.odMul), String(i2.odMul))}
            {diffRow('浮动', String(i1.floatVal), String(i2.floatVal))}
            {diffRow('垫刀', String(i1.bonusDmg || 0), String(i2.bonusDmg || 0))}
            {diffRow('难度', String(i1.score.difficulty), String(i2.score.difficulty))}
            {diffRow('回合', String(i1.score.turns), String(i2.score.turns))}
            {diffRow('衰减后伤害', fmt(r1.postAttenuation), fmt(r2.postAttenuation))}
            {diffRow('总分', r1.score ? fmt(r1.score.totalScore) : '—', r2.score ? fmt(r2.score.totalScore) : '—')}
          </tbody>
        </table>
      </div>
    </div>
  );
}
