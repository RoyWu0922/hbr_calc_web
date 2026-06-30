import { useState, useEffect, useMemo } from 'react';
import { CalcHistoryEntry, DamageResultData } from '../../types';
import { getHistory, deleteHistoryEntry, clearHistory, duplicateHistoryEntry, updateHistoryLabel } from '../../utils/storage';
import { decodeShareData } from '../../utils/shareUrl';

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
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [importCode, setImportCode] = useState('');

  const loadHistory = async () => {
    setLoading(true);
    try { setAllEntries(await getHistory()); } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const entries = useMemo(() => {
    let list = [...allEntries];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e => e.label.toLowerCase().includes(q));
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
      // 'time' — already sorted by timestamp desc from getHistory
    }
    return list;
  }, [allEntries, search, sortBy]);

  const handleDelete = async (id: number) => {
    await deleteHistoryEntry(id);
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
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">计算历史 ({entries.length}{search ? '/' + allEntries.length : ''})</h2>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1.5">
            <input className="input-field w-64 text-xs py-1.5" placeholder="粘贴分享码导入…"
              value={importCode} onChange={e => setImportCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleImport(); }} />
            <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!importCode.trim()}>导入</button>
          </div>
          <button className="btn btn-danger" onClick={handleClear}>清除全部</button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="card">
        <div className="flex gap-3 items-center">
          <input className="input-field text-sm flex-1" placeholder="搜索标签…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex gap-0 text-[10px] flex-shrink-0">
            {(['time', 'label', 'score', 'turns'] as SortKey[]).map(k => (
              <button key={k} onClick={() => setSortBy(k)}
                className={`px-2 py-0.5 rounded ${sortBy === k ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
                {{ time: '时间', label: '标签', score: '分数', turns: '回合' }[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>标签</th>
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
                <tr key={entry.id} className="hover:bg-bg-input/30">
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
                  <td>{s.difficulty}</td>
                  <td>{s.turns}</td>
                  <td className="font-mono text-gold">{fmt(r.postAttenuation)}</td>
                  <td className="font-mono">{r.score ? fmt(r.score.damageScore) : '—'}</td>
                  <td className="font-mono text-gold font-bold">{r.score ? fmt(r.score.totalScore) : '—'}</td>
                  <td className="text-text-muted text-xs">{new Date(entry.timestamp).toLocaleString('zh-CN')}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn btn-primary btn-xs" onClick={() => onLoad(entry)}>加载</button>
                      <button className="btn btn-secondary btn-xs" onClick={() => entry.id && handleCopy(entry.id)}>复制</button>
                      <button className="btn btn-danger btn-xs" onClick={() => entry.id && handleDelete(entry.id)}>删除</button>
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
