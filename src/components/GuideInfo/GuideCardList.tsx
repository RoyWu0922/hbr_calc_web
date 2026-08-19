import type { GuideEntry } from '../../types';
import GuideCard from './GuideCard';

export default function GuideCardList({ entries, favorites, onToggleFav, userId, isAdmin, likedIds, onLike, onEdit }: {
  entries: GuideEntry[];
  favorites: Set<string>;
  onToggleFav: (uuid: string) => void;
  userId: string | null;
  isAdmin: boolean;
  likedIds: Set<string>;
  onLike: (uuid: string) => void;
  onEdit: (entry: GuideEntry) => void;
}) {
  if (!entries.length) return <div className="card p-8 text-center text-text-muted">没有符合条件的作业</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {entries.map(e => (
        <GuideCard key={e.uuid} entry={e}
          isFav={!!e.uuid && favorites.has(e.uuid)}
          onToggleFav={() => e.uuid && onToggleFav(e.uuid)}
          liked={!!e.uuid && likedIds.has(e.uuid)}
          onLike={() => e.uuid && onLike(e.uuid)}
          canEdit={!!userId && (isAdmin || e.userId === userId)}
          onEdit={() => onEdit(e)}
        />
      ))}
    </div>
  );
}
