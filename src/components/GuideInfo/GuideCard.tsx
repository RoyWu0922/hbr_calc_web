import { getCharById, getSlotThumbnail, getCharSkins, resolveSlotSkin, getElementIcon, getAvgBreak } from '../../data/guideData';
import type { GuideEntry, GuideTeamSlot } from '../../types';

function TeamSlot({ slot }: { slot: GuideTeamSlot }) {
  const c = getCharById(slot.characterId);
  const thumb = c ? getSlotThumbnail(slot) : null;
  const skinLabel = c ? getCharSkins(c.enName)?.find(s => s.id === resolveSlotSkin(c.enName, slot.skin))?.label : '';
  return (
    <div className="relative rounded overflow-hidden border border-white/10 bg-bg-input aspect-square">
      {thumb ? (
        <img src={thumb} alt={c?.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-text-muted px-1 text-center leading-tight">{c?.name ?? '?'}</div>
      )}
      {skinLabel && <span className="absolute top-0 left-0 text-[8px] leading-3 bg-black/70 text-white px-1 rounded-br">{skinLabel}</span>}
      <span className="absolute bottom-0 inset-x-0 text-center text-[9px] leading-4 bg-black/70 text-white">{slot.break}突</span>
    </div>
  );
}

export default function GuideCard({ entry, isFav, onToggleFav, liked, onLike, canEdit, onEdit }: {
  entry: GuideEntry;
  isFav: boolean;
  onToggleFav: () => void;
  liked: boolean;
  onLike: () => void;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <img src={getElementIcon(entry.attribute)} alt={entry.attribute} className="w-4 h-4" />
        <span className="font-semibold">{entry.attribute}</span>
        <span className="text-text-muted">期数 {entry.period}</span>
        {entry.category === 'ex' && entry.stage && <span className="text-text-muted">{entry.stage}</span>}
        {entry.category === 'ex' && <span className="text-text-muted">{entry.weather ? '需天气' : '不需天气'}</span>}
        <span className="text-text-muted">回合 {entry.turns}</span>
        <span className="text-text-muted">均突 {getAvgBreak(entry.team)}</span>
        {entry.category === 'score' && <span className="text-accent font-semibold">{entry.score} 分</span>}
        <div className="flex-1" />
        <button className={`flex items-center gap-0.5 text-sm ${liked ? 'text-red-400' : 'text-text-muted hover:text-text-primary'}`} onClick={onLike} title="点赞">
          <span className="leading-none">{liked ? '❤' : '♡'}</span>
          <span>{entry.likeCount ?? 0}</span>
        </button>
        {canEdit && <button className="btn btn-xs btn-secondary" onClick={onEdit}>编辑</button>}
        <button className={`text-lg leading-none ${isFav ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`} onClick={onToggleFav} title="收藏">
          {isFav ? '★' : '☆'}
        </button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-1">
        {entry.team.map((s, i) => <TeamSlot key={i} slot={s} />)}
      </div>

      <div className="text-xs text-text-muted">作者：{entry.author}</div>

      {entry.videoUrl && (
        <div className="flex items-center gap-2 flex-wrap">
          <a href={entry.videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-xs btn-secondary">▶ 视频</a>
        </div>
      )}

      {entry.notes && <div className="text-xs text-text-secondary whitespace-pre-wrap">{entry.notes}</div>}
    </div>
  );
}
