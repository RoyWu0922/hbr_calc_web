import { useState, memo } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import type { MedalRecord } from '../../utils/medalStorage';
import { charJewelSummary } from '../../utils/medalCalc';
import JewelDialog from './JewelDialog';
import JewelDetailDialog from './JewelDetailDialog';

interface JewelViewProps {
  data: MedalData;
  record: MedalRecord;
  visibleChars: MedalCharacter[];
  setJewel: (charId: number, jewelIdx: number, value: number) => void;
}

interface JewelCardProps {
  jewelIdx: number;
  label: string;
  groupLabel: string;
  visibleChars: MedalCharacter[];
  record: MedalRecord;
  onOpen: () => void;
}

const JewelCard = memo(function JewelCard({ jewelIdx, label, groupLabel, visibleChars, record, onOpen }: JewelCardProps) {
  const learnedCount = visibleChars.filter(ch => (record[String(ch.id)]?.jewels[String(jewelIdx)] ?? 0) >= 100).length;
  const total = visibleChars.length;
  const pct = total ? Math.round(learnedCount / total * 100) : 0;

  return (
    <button type="button" onClick={onOpen}
      className="card p-2 rounded-lg text-left cursor-pointer hover:border-accent/30 transition-colors flex items-center gap-2 min-w-0"
      title={`${label} (${groupLabel}) · 已习得 ${learnedCount}/${total}`}>
      <PctRing pct={pct} size={32} />
      <span className="text-xs font-medium leading-tight break-words min-w-0" style={{ color: 'var(--app-text-primary)' }}>{label}</span>
    </button>
  );
});

function PctRing({ pct, size = 32 }: { pct: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, pct / 100));
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.15)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none" style={{ color: 'var(--app-text-primary)' }}>{pct}%</div>
    </div>
  );
}

export default function JewelView({ data, record, visibleChars, setJewel }: JewelViewProps) {
  const [view, setView] = useState<'char' | 'jewel'>('char');
  const [groupFilter, setGroupFilter] = useState<'all' | number>('all');
  const [dialogChar, setDialogChar] = useState<MedalCharacter | null>(null);
  const [dialogJewel, setDialogJewel] = useState<number | null>(null);

  const groups = groupFilter === 'all'
    ? data.jewelGroups
    : [data.jewelGroups[Number(groupFilter)]];

  return (
    <div className="space-y-3">
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <button className={view === 'char' ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setView('char')}>角色based</button>
        <button className={view === 'jewel' ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setView('jewel')}>宝玉based</button>
        {view === 'jewel' && (
          <select className="input-field" value={String(groupFilter)} onChange={e => setGroupFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">全部</option>
            {data.jewelGroups.map((g, i) => <option key={g.label} value={i}>{g.label}</option>)}
          </select>
        )}
      </div>

      {view === 'char' && (
        visibleChars.length === 0 ? (
          <div className="p-8 text-center text-text-muted">没有符合筛选条件的角色</div>
        ) : (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visibleChars.map(ch => {
              const rec = record[String(ch.id)] || { cats: {}, jewels: {} };
              const { learned } = charJewelSummary(rec.jewels, data.jewels.length);
              const pct = Math.round(learned / data.jewels.length * 100);
              return (
                <button key={ch.id}
                  onClick={() => setDialogChar(ch)}
                  className="card p-2 rounded-lg text-left hover:border-accent/30 transition-colors flex items-center gap-2 min-w-0"
                  title={`${ch.name} · 已习得 ${learned}/${data.jewels.length}`}>
                  <PctRing pct={pct} size={32} />
                  <span className="text-xs font-medium leading-tight break-words min-w-0" style={{ color: 'var(--app-text-primary)' }}>{ch.name}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {view === 'jewel' && (
        groups.map(group => (
          <div key={group.label} className="space-y-2">
            <div className="text-sm font-semibold px-1" style={{ color: 'var(--app-text-primary)' }}>{group.label}</div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {group.indices.map(idx => (
                <JewelCard key={idx}
                  jewelIdx={idx}
                  label={data.jewels[idx]}
                  groupLabel={group.label}
                  visibleChars={visibleChars}
                  record={record}
                  onOpen={() => setDialogJewel(idx)} />
              ))}
            </div>
          </div>
        ))
      )}

      {dialogChar && (
        <JewelDialog
          data={data}
          ch={dialogChar}
          jewels={record[String(dialogChar.id)]?.jewels ?? {}}
          setJewel={setJewel}
          onClose={() => setDialogChar(null)} />
      )}
      {dialogJewel !== null && (
        <JewelDetailDialog
          data={data}
          jewelIdx={dialogJewel}
          visibleChars={visibleChars}
          record={record}
          setJewel={setJewel}
          onClose={() => setDialogJewel(null)} />
      )}
    </div>
  );
}
