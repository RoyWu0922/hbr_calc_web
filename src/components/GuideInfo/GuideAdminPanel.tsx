import { useEffect, useState } from 'react';
import { listAll, setGuideStatus, softDeleteGuide } from '../../utils/guideStorage';
import { getCharById, getAvgBreak, getElementIcon } from '../../data/guideData';
import type { GuideEntry } from '../../types';
import GuideUploadForm from './GuideUploadForm';

const STATUS_LABEL: Record<string, string> = { pending: '待审', approved: '已通过', rejected: '已驳回' };
const STATUS_COLOR: Record<string, string> = { pending: 'text-amber-400', approved: 'text-emerald-400', rejected: 'text-red-400' };

export default function GuideAdminPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<GuideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const r = await listAll();
    setEntries(r.entries);
    setErr(r.error);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const sorted = [...entries].sort((a, b) => {
    const rank = (s: string) => (s === 'pending' ? 0 : s === 'approved' ? 1 : 2);
    return rank(a.status) - rank(b.status) || b.createdAt - a.createdAt;
  });

  const act = async (uuid: string, fn: (u: string) => Promise<string | null>) => {
    const e = await fn(uuid);
    if (e) setErr(e); else refresh();
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">后台审核</h3>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-xs" onClick={() => setShowForm(true)}>+ 发布作业</button>
            <button className="text-text-muted hover:text-text-primary text-xl leading-none" onClick={onClose}>×</button>
          </div>
        </div>

        {err && <div className="text-red-400 text-xs mb-2">{err}</div>}
        {loading ? (
          <div className="text-text-muted text-sm">加载中…</div>
        ) : !sorted.length ? (
          <div className="text-text-muted text-sm">暂无投稿</div>
        ) : (
          <div className="space-y-2">
            {sorted.map(e => (
              <div key={e.uuid} className="glass-row p-2 flex items-center gap-2">
                <img src={getElementIcon(e.attribute)} alt="" className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">
                    {e.category === 'ex' ? 'EX' : '打分'} · 期数{e.period} · 回合{e.turns} · 均突{getAvgBreak(e.team)} · {e.author}
                  </div>
                  <div className="text-[10px] text-text-muted truncate">
                    {e.team.map(s => getCharById(s.characterId)?.name ?? '?').join(' / ')}
                  </div>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${STATUS_COLOR[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                {e.status !== 'approved' && <button className="btn btn-xs btn-primary shrink-0" onClick={() => e.uuid && act(e.uuid, u => setGuideStatus(u, 'approved'))}>通过</button>}
                {e.status !== 'rejected' && <button className="btn btn-xs btn-secondary shrink-0" onClick={() => e.uuid && act(e.uuid, u => setGuideStatus(u, 'rejected'))}>驳回</button>}
                <button className="btn btn-xs btn-danger shrink-0" onClick={() => e.uuid && act(e.uuid, u => softDeleteGuide(u))}>删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm && <GuideUploadForm category="ex" allowCategoryChange isAdmin onClose={() => setShowForm(false)} onSubmitted={refresh} />}
    </div>
  );
}
