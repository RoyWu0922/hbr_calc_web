import { useEffect, useState } from 'react';
import { TEAM_ORDER, teamCharacters, getCharSkins, getCharThumbnail, getSkinThumbnail, getDefaultSkinId } from '../../data/guideData';

export interface PickedCharacter {
  characterId: number;
  skin?: string;   // 皮肤 id；无卡面角色为 undefined
}

/** 皮肤化角色选择弹窗：先选角色（默认皮缩略图）→ 再选该角色皮肤 */
export default function CharacterPickerModal({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (sel: PickedCharacter) => void;
}) {
  const [selected, setSelected] = useState<{ id: number; enName: string } | null>(null);

  // 每次打开重置选中
  useEffect(() => { if (open) setSelected(null); }, [open]);

  if (!open) return null;

  const pick = (id: number, skin?: string) => { onPick({ characterId: id, skin }); onClose(); };

  const selectChar = (id: number, enName: string) => {
    const skins = getCharSkins(enName);
    if (!skins || skins.length <= 1) { pick(id, getDefaultSkinId(enName) ?? undefined); return; }
    setSelected({ id, enName });
  };

  const selSkins = selected ? getCharSkins(selected.enName) : null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">选择角色</h3>
          <button className="text-text-muted hover:text-text-primary text-xl leading-none" onClick={onClose}>×</button>
        </div>

        {/* 已选角色的皮肤条 */}
        {selected && selSkins && selSkins.length > 1 && (
          <div className="mb-4">
            <div className="text-xs text-accent mb-1.5">选择皮肤（a皮 / s皮 / 原皮 / 换皮）</div>
            <div className="flex flex-wrap gap-2">
              {selSkins.map(s => (
                <button key={s.id} onClick={() => pick(selected.id, s.id)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-bg-input p-1.5 hover:border-accent/60 w-16">
                  <img src={getSkinThumbnail(selected.enName, s.id) ?? ''} alt={s.label}
                    className="w-12 h-12 rounded object-cover" loading="lazy" />
                  <span className="text-[10px] text-text-secondary">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 角色网格 */}
        <div className="space-y-3">
          {TEAM_ORDER.map(team => {
            const chars = teamCharacters(team);
            if (!chars.length) return null;
            return (
              <div key={team}>
                <div className="text-xs text-accent mb-1.5">{team}</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {chars.map(c => {
                    const thumb = getCharThumbnail(c.enName);
                    const isSel = selected?.id === c.id;
                    return (
                      <button key={c.id} onClick={() => selectChar(c.id, c.enName)}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all
                          ${isSel ? 'border-accent bg-accent/10' : 'border-white/10 bg-bg-input hover:border-accent/50'}`}>
                        {thumb ? (
                          <img src={thumb} alt={c.name} className="w-full aspect-square rounded object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full aspect-square rounded flex items-center justify-center text-xs text-text-muted bg-black/20">{c.name}</div>
                        )}
                        <span className="text-[10px] text-text-secondary leading-tight text-center">{c.name}</span>
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
