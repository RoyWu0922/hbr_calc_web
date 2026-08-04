import { useEffect } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import type { MedalRecord } from '../../utils/medalStorage';

interface JewelDetailDialogProps {
  data: MedalData;
  jewelIdx: number;
  visibleChars: MedalCharacter[];
  record: MedalRecord;
  setJewel: (charId: number, jewelIdx: number, value: number) => void;
  onClose: () => void;
}

export default function JewelDetailDialog({ data, jewelIdx, visibleChars, record, setJewel, onClose }: JewelDetailDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const group = data.jewelGroups.find(g => g.indices.includes(jewelIdx));
  const learnedCount = visibleChars.filter(ch => (record[String(ch.id)]?.jewels[String(jewelIdx)] ?? 0) >= 100).length;
  const total = visibleChars.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
          <div className="flex-1">
            <div className="font-semibold" style={{ color: 'var(--app-text-primary)' }}>
              {data.jewels[jewelIdx]}
              {group && (
                <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-[10px] align-middle border border-white/10 text-text-muted">{group.label}</span>
              )}
            </div>
            <div className="text-xs text-text-muted">已习得 {learnedCount}/{total}</div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">&times;</button>
        </div>
        <div className="p-3 overflow-y-auto space-y-2">
          {visibleChars.map(ch => {
            const value = record[String(ch.id)]?.jewels[String(jewelIdx)] ?? 0;
            return (
              <div key={ch.id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs truncate" style={{ color: 'var(--app-text-primary)' }}>{ch.name}</span>
                <span className="text-[10px] text-text-muted shrink-0 w-10">{ch.team}</span>
                <input type="checkbox" checked={value >= 100}
                  onChange={e => setJewel(ch.id, jewelIdx, e.target.checked ? 100 : 0)}
                  className="w-4 h-4 shrink-0" />
                <input type="range" min={0} max={100} step={1} value={value}
                  onChange={e => setJewel(ch.id, jewelIdx, Number(e.target.value))}
                  className="flex-1" style={{ accentColor: 'var(--color-accent)' }} />
                <span className={`w-8 text-right text-xs ${value >= 100 ? 'text-accent' : 'text-text-muted'}`}>{value}</span>
              </div>
            );
          })}
          {visibleChars.length === 0 && <div className="p-6 text-center text-text-muted">没有符合筛选条件的角色</div>}
        </div>
      </div>
    </div>
  );
}
