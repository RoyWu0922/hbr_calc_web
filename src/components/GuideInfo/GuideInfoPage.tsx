import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../utils/auth';
import { listApproved, toggleGuideLike, listMyLikedIds } from '../../utils/guideStorage';
import { ADMIN_USER_IDS } from '../../config/admin';
import type { GuideCategory, GuideEntry } from '../../types';
import GuideFilters, { applyFilters, defaultFilters, type GuideFilterState } from './GuideFilters';
import GuideCardList from './GuideCardList';
import GuideUploadForm from './GuideUploadForm';
import GuideAdminPanel from './GuideAdminPanel';
import Pagination from '../Pagination';

const PAGE_SIZE = 12;

function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('hbr_guide_favorites') || '[]') as string[]); } catch { return new Set(); }
}
function saveFavorites(s: Set<string>) { localStorage.setItem('hbr_guide_favorites', JSON.stringify([...s])); }

export default function GuideInfoPage() {
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_USER_IDS.includes(user.id);
  const [category, setCategory] = useState<GuideCategory>('ex');
  const [entries, setEntries] = useState<GuideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<GuideFilterState>(defaultFilters);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editing, setEditing] = useState<GuideEntry | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFilters(defaultFilters);
    setPage(1);
    listApproved(category).then(r => {
      if (!alive) return;
      setEntries(r.entries);
      setError(r.error);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [category]);

  // 加载当前用户的点赞列表
  useEffect(() => {
    if (!user) { setLikedIds(new Set()); return; }
    listMyLikedIds().then(ids => setLikedIds(new Set(ids)));
  }, [user?.id]);

  // 提示自动消失
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggleFav = (uuid: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      saveFavorites(next);
      return next;
    });
  };

  const toggleLike = async (uuid: string) => {
    if (!user) { setNotice('请先登录后再点赞'); return; }
    const wasLiked = likedIds.has(uuid);
    setLikedIds(prev => { const n = new Set(prev); if (wasLiked) n.delete(uuid); else n.add(uuid); return n; });
    const { count, error } = await toggleGuideLike(uuid);
    if (error) {
      setNotice('点赞失败：' + error);
      setLikedIds(prev => { const n = new Set(prev); if (wasLiked) n.add(uuid); else n.delete(uuid); return n; });
      return;
    }
    setEntries(prev => prev.map(e => e.uuid === uuid ? { ...e, likeCount: count } : e));
  };

  const openEdit = (entry: GuideEntry) => setEditing(entry);

  const filtered = useMemo(() => applyFilters(entries, filters, favorites, category, user?.id ?? null), [entries, filters, favorites, category, user?.id]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className={`sub-tab text-sm ${category === 'ex' ? 'active' : ''}`} onClick={() => setCategory('ex')}>异时层EX</button>
        <button className={`sub-tab text-sm ${category === 'score' ? 'active' : ''}`} onClick={() => setCategory('score')}>打分EX</button>
        <div className="flex-1" />
        <button className="btn btn-accent btn-sm" onClick={() => setShowUpload(true)}>上传作业</button>
        {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setShowAdmin(true)}>后台审核</button>}
      </div>

      {notice && <div className="card p-2 text-center text-xs text-accent">{notice}</div>}

      <GuideFilters category={category} filters={filters} onChange={setFilters} userId={user?.id ?? null} />

      {loading ? (
        <div className="card p-8 text-center text-text-muted">加载中…</div>
      ) : error ? (
        <div className="card p-8 text-center">
          <div className="text-amber-400 text-sm">加载失败</div>
          <div className="text-text-muted text-xs mt-1">{error}</div>
          <div className="text-text-muted text-xs mt-2">提示：请确认已在 Supabase 执行 supabase/guide_entries.sql 建表。</div>
        </div>
      ) : (
        <>
          <GuideCardList entries={pageEntries} favorites={favorites} onToggleFav={toggleFav}
            userId={user?.id ?? null} isAdmin={isAdmin} likedIds={likedIds} onLike={toggleLike} onEdit={openEdit} />
          <Pagination page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}

      {showUpload && (
        <GuideUploadForm category={category} isAdmin={isAdmin} onClose={() => setShowUpload(false)}
          onSubmitted={() => listApproved(category).then(r => { setEntries(r.entries); setError(r.error); })} />
      )}
      {editing && (
        <GuideUploadForm category={editing.category} isAdmin={isAdmin} initial={editing} onClose={() => setEditing(null)}
          onSubmitted={() => listApproved(category).then(r => { setEntries(r.entries); setError(r.error); })} />
      )}
      {showAdmin && <GuideAdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
