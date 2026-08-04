import { useEffect } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import { tierPointsForChar, calcRankInfo, charBadgeSummary, catRange } from '../../utils/medalCalc';
import RankArc from './RankArc';

interface BadgeDialogProps {
  data: MedalData;
  ch: MedalCharacter;
  cats: Record<string, number>;
  setCat: (charId: number, catKey: string, count: number) => void;
  onClose: () => void;
}

export default function BadgeDialog({ data, ch, cats, setCat, onClose }: BadgeDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const points = tierPointsForChar(data, ch.enName);
  const { sum, count, total } = charBadgeSummary(cats, data, ch.enName);
  const rank = calcRankInfo(sum, data.rankThresholds);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
          <RankArc rank={rank.rank} isMax={rank.isMax} into={rank.into} span={rank.span} size={56} />
          <div className="flex-1">
            <div className="font-semibold" style={{ color: 'var(--app-text-primary)' }}>
              {ch.name}
              <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-[10px] align-middle" style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-glass-border)' }}>{ch.team}</span>
            </div>
            <div className="text-xs text-text-muted">
              {rank.isMax
                ? '已完成全部勋章'
                : `距 R${rank.rank + 1} 还差 ${rank.toNext} 分`}
              <span className="ml-2">{count}/{total}</span>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">&times;</button>
        </div>
        <div className="p-3 overflow-y-auto space-y-3">
          {data.checklist.map(cat => {
            const { offset } = catRange(data, cat.key);
            const realCount = cat.tiers.filter((_, j) => points[offset + j] > 0).length;
            const n = Math.max(0, Math.min(cats[cat.key] ?? 0, realCount));
            return (
              <div key={cat.key} className="rounded-lg border border-white/10 p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold" style={{ color: 'var(--app-text-primary)' }}>{cat.label}</span>
                  <span className="text-xs text-text-muted">{realCount ? `${n}/${realCount}` : '—'}</span>
                </div>
                {realCount > 0 && (
                  <input type="range" min={0} max={realCount} step={1} value={n}
                    onChange={e => setCat(ch.id, cat.key, Number(e.target.value))}
                    className="w-full mb-2" style={{ accentColor: 'var(--color-accent)' }} />
                )}
                <div className="flex flex-wrap gap-1.5">
                  {cat.tiers.map((t, j) => {
                    if (points[offset + j] <= 0) {
                      return <span key={String(t)} className="w-12 h-6 rounded-md border border-dashed border-white/10" />;
                    }
                    const pos = cat.tiers.slice(0, j + 1).filter((_, k) => points[offset + k] > 0).length;
                    const done = pos <= n;
                    return (
                      <button key={String(t)} onClick={() => setCat(ch.id, cat.key, pos)}
                        className={done
                          ? 'px-2 py-0.5 rounded-md text-xs border border-accent text-accent'
                          : 'px-2 py-0.5 rounded-md text-xs border border-white/15 text-text-muted hover:border-white/30'}>
                        {String(t)}{done ? ` · ${points[offset + j]}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
