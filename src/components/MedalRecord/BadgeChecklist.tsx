import { useState } from 'react';
import type { MedalData, MedalCharacter } from '../../data/medalData';
import type { MedalRecord } from '../../utils/medalStorage';
import { tierPointsForChar, calcRankInfo, charBadgeSummary } from '../../utils/medalCalc';
import BadgeDialog from './BadgeDialog';
import RankArc from './RankArc';

interface BadgeChecklistProps {
  data: MedalData;
  record: MedalRecord;
  visibleChars: MedalCharacter[];
  setCat: (charId: number, catKey: string, count: number) => void;
  removeCharacter: (charId: number) => void;
}

function CharCard({ data, record, ch, setCat, removeCharacter, onClick }: {
  data: MedalData; record: MedalRecord; ch: MedalCharacter;
  setCat: (charId: number, catKey: string, count: number) => void;
  removeCharacter: (charId: number) => void;
  onClick: () => void;
}) {
  const rec = record[String(ch.id)] || { cats: {}, jewels: {} };
  const points = tierPointsForChar(data, ch.enName);
  const { sum, count, total } = charBadgeSummary(rec.cats ?? {}, data, ch.enName);
  const rank = calcRankInfo(sum, data.rankThresholds);
  const isCustom = ch.id < 0;
  return (
    <div className="card p-3">
      <button className="flex items-center gap-3 w-full text-left" onClick={onClick}>
        <RankArc rank={rank.rank} isMax={rank.isMax} into={rank.into} span={rank.span} size={56} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold leading-tight break-words" style={{ color: 'var(--app-text-primary)' }}>{ch.name}</div>
          <div className="text-xs text-text-muted">
            <span className="inline-block px-1.5 py-0.5 rounded bg-bg-card border border-white/10 mr-1.5">{ch.team}</span>
            {rank.isMax ? '已完成全部勋章' : `距 R${rank.rank + 1} 还差 ${rank.toNext} 分`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-accent">{count}/{total}</div>
          <div className="text-[10px] text-text-muted">{total ? Math.round(count / total * 100) : 0}%</div>
        </div>
        {isCustom && (
          <button className="btn btn-danger btn-xs" onClick={e => { e.stopPropagation(); removeCharacter(ch.id); }}>删除</button>
        )}
      </button>
    </div>
  );
}

export default function BadgeChecklist({ data, record, visibleChars, setCat, removeCharacter }: BadgeChecklistProps) {
  const [dialogChar, setDialogChar] = useState<MedalCharacter | null>(null);

  return (
    <>
      <div className="grid gap-3 grid-cols-3">
        {visibleChars.map(ch => (
          <CharCard key={ch.id} data={data} record={record} ch={ch}
            setCat={setCat} removeCharacter={removeCharacter}
            onClick={() => setDialogChar(ch)} />
        ))}
        {visibleChars.length === 0 && (
          <div className="card p-8 text-center text-text-muted col-span-full">没有符合筛选条件的角色</div>
        )}
      </div>
      {dialogChar && (
        <BadgeDialog data={data} ch={dialogChar}
          cats={record[String(dialogChar.id)]?.cats ?? {}}
          setCat={setCat}
          onClose={() => setDialogChar(null)} />
      )}
    </>
  );
}
