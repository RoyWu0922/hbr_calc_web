import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../utils/auth';
import { listComments, addComment, softDeleteComment } from '../../utils/guideStorage';
import type { GuideComment, GuideEntry } from '../../types';

const MAX_LEN = 500;

export default function CommentModal({ entry, onClose, isAdmin }: {
  entry: GuideEntry;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<GuideComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // 挂载时加载该作业评论（弹窗由父组件条件渲染，关闭即卸载）
  useEffect(() => {
    if (!entry.uuid) return;
    let alive = true;
    setLoading(true);
    setErr('');
    listComments(entry.uuid).then(r => {
      if (!alive) return;
      setComments(r.comments);
      if (r.error) setErr(r.error);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [entry.uuid]);

  const canDelete = (c: GuideComment) => isAdmin || c.userId === user?.id;

  const del = async (c: GuideComment) => {
    if (!c.uuid) return;
    setBusy(true);
    const e = await softDeleteComment(c.uuid);
    setBusy(false);
    if (e) { setErr(e); return; }
    setComments(prev => prev.filter(x => x.uuid !== c.uuid));
  };

  const post = async () => {
    const content = text.trim();
    if (!content || !user || content.length > MAX_LEN || !entry.uuid) return;
    const author = (user.user_metadata?.username as string) || '未知';
    setBusy(true);
    setErr('');
    const e = await addComment(entry.uuid, content, user.id, author);
    setBusy(false);
    if (e) { setErr(e); return; }
    setText('');
    // 重新拉取，保证顺序与 RLS 过滤一致
    listComments(entry.uuid).then(r => { if (!r.error) setComments(r.comments); });
  };

  const fmt = (ts: number) => new Date(ts).toLocaleString();

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-lg max-h-[85vh] flex flex-col p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold">
            评论{entry.attribute ? ` · ${entry.attribute}` : ''} 期{entry.period}
            {entry.category === 'ex' && entry.stage ? ` ${entry.stage}` : ''}
          </h3>
          <button className="text-text-muted hover:text-text-primary text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            <div className="text-center text-text-muted text-sm py-6">加载中…</div>
          ) : comments.length === 0 ? (
            <div className="text-center text-text-muted text-sm py-6">还没有评论</div>
          ) : comments.map(c => (
            <div key={c.uuid} className="rounded-lg border border-white/10 bg-bg-input/50 p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-accent">{c.author}</span>
                <span className="text-[10px] text-text-muted">{fmt(c.createdAt)}</span>
                {canDelete(c) && (
                  <button className="ml-auto text-[11px] text-text-muted hover:text-red-400" onClick={() => del(c)} disabled={busy}>删除</button>
                )}
              </div>
              <div className="text-sm text-text-secondary mt-1 whitespace-pre-wrap break-words">{c.content}</div>
            </div>
          ))}
        </div>

        {err && <div className="text-red-400 text-xs mt-2">{err}</div>}

        {user ? (
          <div className="mt-3">
            <textarea className="input-field w-full resize-none" rows={2} maxLength={MAX_LEN} placeholder="写下你的评论…"
              value={text} onChange={e => setText(e.target.value)} />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-text-muted">{text.length}/{MAX_LEN}</span>
              <button className="btn btn-primary btn-sm" onClick={post}
                disabled={busy || !text.trim() || text.trim().length > MAX_LEN}>
                {busy ? '发表中…' : '发表评论'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-center text-xs text-text-muted">登录后可评论</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
