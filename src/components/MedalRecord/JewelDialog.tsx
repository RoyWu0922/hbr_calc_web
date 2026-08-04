import { useEffect } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';

interface JewelDialogProps {
  data: MedalData;
  ch: MedalCharacter;
  jewels: Record<string, number>;
  setJewel: (charId: number, jewelIdx: number, value: number) => void;
  onClose: () => void;
}

export default function JewelDialog({ data, ch, jewels, setJewel, onClose }: JewelDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const learned = Object.values(jewels).filter(v => v >= 100).length;
  const total = data.jewels.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
          <div className="flex-1">
            <div className="font-semibold" style={{ color: 'var(--app-text-primary)' }}>
              {ch.name}
              <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-[10px] align-middle" style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-glass-border)' }}>{ch.team}</span>
            </div>
            <div className="text-xs text-text-muted">已习得 {learned}/{total}</div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">&times;</button>
        </div>
        <div className="p-3 overflow-y-auto space-y-4">
          {data.jewelGroups.map(group => {
            const groupLearned = group.indices.filter(idx => (jewels[String(idx)] ?? 0) >= 100).length;
            return (
              <div key={group.label} className="rounded-lg border border-white/10 p-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--app-text-primary)' }}>{group.label}</span>
                  <span className="text-xs text-text-muted">已习得 {groupLearned}/{group.indices.length}</span>
                </div>
                <div className="space-y-2">
                  {group.indices.map(idx => {
                    const value = jewels[String(idx)] ?? 0;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs" style={{ color: 'var(--app-text-primary)' }}>{data.jewels[idx]}</span>
                        <input type="checkbox" checked={value >= 100}
                          onChange={e => setJewel(ch.id, idx, e.target.checked ? 100 : 0)}
                          className="w-4 h-4 shrink-0" />
                        <input type="range" min={0} max={100} step={1} value={value}
                          onChange={e => setJewel(ch.id, idx, Number(e.target.value))}
                          className="flex-1" style={{ accentColor: 'var(--color-accent)' }} />
                        <span className={`w-8 text-right text-xs ${value >= 100 ? 'text-accent' : 'text-text-muted'}`}>{value}</span>
                      </div>
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
