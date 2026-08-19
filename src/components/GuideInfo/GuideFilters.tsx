import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GUIDE_ATTRIBUTES, TEAM_ORDER, teamCharacters, getElementIcon, getAvgBreak,
  getCharThumbnail, getSkinThumbnail, getCharSkins, getCharById, resolveSlotSkin,
} from '../../data/guideData';
import type { GuideAttribute, GuideCategory, GuideEntry, GuideStage } from '../../types';

export interface ExcludeFilter {
  characterId: number;
  skin?: string;   // 缺省 = 排除整卡；否则只排除该皮肤
}

export interface GuideFilterState {
  period: number | null;           // 期数（null = 不限）
  stage: '' | GuideStage;          // 阶段（EX）
  attribute: '' | GuideAttribute;
  weather: '' | 'yes' | 'no';      // 天气（EX）
  maxTurns: number;                // 回合 ≤ N（1~15）
  avgBreak: number | null;         // 平均突破 1~4
  excludeChars: ExcludeFilter[];   // 不含的卡（角色 id + 可选皮肤）
  minScore: number | null;         // 分数下限（打分EX）
  favoritesOnly: boolean;          // 已收藏
  mineOnly: boolean;               // 仅看我发布的
}

export const defaultFilters: GuideFilterState = {
  period: null, stage: '', attribute: '', weather: '',
  maxTurns: 15, avgBreak: null, excludeChars: [], minScore: null, favoritesOnly: false, mineOnly: false,
};

export function applyFilters(
  entries: GuideEntry[],
  f: GuideFilterState,
  favorites: Set<string>,
  category: GuideCategory,
  userId: string | null,
): GuideEntry[] {
  return entries.filter(e => {
    if (f.period != null && e.period !== f.period) return false;
    if (category === 'ex') {
      if (f.stage && e.stage !== f.stage) return false;
      if (f.weather === 'yes' && !e.weather) return false;
      if (f.weather === 'no' && e.weather) return false;
    }
    if (f.attribute && e.attribute !== f.attribute) return false;
    if (e.turns > f.maxTurns) return false;
    if (f.avgBreak != null && getAvgBreak(e.team) !== f.avgBreak) return false;
    if (category === 'score' && f.minScore != null && (e.score ?? 0) < f.minScore) return false;
    if (f.excludeChars.length) {
      const excluded = e.team.some(slot => {
        const c = getCharById(slot.characterId);
        const effSkin = c ? resolveSlotSkin(c.enName, slot.skin) : null;
        return f.excludeChars.some(x =>
          x.characterId === slot.characterId &&
          (x.skin === undefined || (effSkin != null && x.skin === effSkin)));
      });
      if (excluded) return false;
    }
    if (f.favoritesOnly && !(e.uuid && favorites.has(e.uuid))) return false;
    if (f.mineOnly && !(userId && e.userId === userId)) return false;
    return true;
  });
}

export default function GuideFilters({ category, filters, onChange, userId }: {
  category: GuideCategory;
  filters: GuideFilterState;
  onChange: (f: GuideFilterState) => void;
  userId: string | null;
}) {
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [skinChar, setSkinChar] = useState<{ id: number; enName: string } | null>(null);   // 打开皮肤弹窗的角色
  const set = (patch: Partial<GuideFilterState>) => onChange({ ...filters, ...patch });
  const chip = (active: boolean) => `btn btn-xs ${active ? 'btn-primary' : 'btn-secondary'}`;

  const wholeExcluded = (id: number) => filters.excludeChars.some(x => x.characterId === id && x.skin === undefined);
  const skinExcluded = (id: number, skin: string) => filters.excludeChars.some(x => x.characterId === id && x.skin === skin);

  // 整卡排除切换
  const toggleWhole = (id: number) => {
    const list = filters.excludeChars.filter(x => x.characterId !== id);   // 清除该角色的全部皮肤项
    if (wholeExcluded(id)) set({ excludeChars: list });
    else set({ excludeChars: [...list, { characterId: id }] });
  };
  // 单皮肤排除切换（整卡已排除时忽略）
  const toggleSkin = (id: number, skin: string) => {
    if (wholeExcluded(id)) return;
    const list = filters.excludeChars;
    if (skinExcluded(id, skin)) set({ excludeChars: list.filter(x => !(x.characterId === id && x.skin === skin)) });
    else set({ excludeChars: [...list, { characterId: id, skin }] });
  };

  const excludedSkinLabels = (id: number, enName: string): string => {
    const skins = getCharSkins(enName) ?? [];
    return skins
      .filter(s => skinExcluded(id, s.id))
      .map(s => s.label)
      .join('、');
  };

  return (
    <div className="card p-3 space-y-3">
      {/* 期数 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="input-label">期数</span>
        {category === 'ex' ? (
          <>
            <button className={chip(filters.period == null)} onClick={() => set({ period: null })}>不限</button>
            {[1, 2, 3].map(p => <button key={p} className={chip(filters.period === p)} onClick={() => set({ period: p })}>{p}</button>)}
          </>
        ) : (
          <input type="number" className="input-field w-24" placeholder="期数" value={filters.period ?? ''}
            onChange={e => set({ period: e.target.value === '' ? null : Number(e.target.value) })} />
        )}
      </div>

      {/* 阶段 + 天气（EX） */}
      {category === 'ex' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="input-label">阶段</span>
          <button className={chip(!filters.stage)} onClick={() => set({ stage: '' })}>不限</button>
          <button className={chip(filters.stage === 'P1')} onClick={() => set({ stage: 'P1' })}>P1</button>
          <button className={chip(filters.stage === 'P2')} onClick={() => set({ stage: 'P2' })}>P2</button>

          <span className="input-label ml-2">天气</span>
          <button className={chip(!filters.weather)} onClick={() => set({ weather: '' })}>不限</button>
          <button className={chip(filters.weather === 'yes')} onClick={() => set({ weather: 'yes' })}>需要天气</button>
          <button className={chip(filters.weather === 'no')} onClick={() => set({ weather: 'no' })}>不需要天气</button>
        </div>
      )}

      {/* 属性 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="input-label">属性</span>
        <button className={chip(!filters.attribute)} onClick={() => set({ attribute: '' })}>不限</button>
        {GUIDE_ATTRIBUTES.map(a => (
          <button key={a} className={chip(filters.attribute === a)} onClick={() => set({ attribute: a })} title={a}>
            <img src={getElementIcon(a)} alt={a} className="w-5 h-5 inline-block align-middle" />
          </button>
        ))}
      </div>

      {/* 回合 + 平均突破 + 分数 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="input-label">回合 ≤</span>
        <input type="range" min={1} max={15} step={1} value={filters.maxTurns}
          onChange={e => set({ maxTurns: Number(e.target.value) })}
          className="w-40 accent-accent" />
        <span className="text-xs font-semibold text-accent w-6">{filters.maxTurns}</span>

        <span className="input-label ml-2">平均突破</span>
        <button className={chip(filters.avgBreak == null)} onClick={() => set({ avgBreak: null })}>不限</button>
        {[1, 2, 3, 4].map(n => <button key={n} className={chip(filters.avgBreak === n)} onClick={() => set({ avgBreak: n })}>{n}</button>)}

        {category === 'score' && (
          <>
            <span className="input-label ml-2">分数 ≥</span>
            <input type="number" className="input-field w-24" placeholder="最低分" value={filters.minScore ?? ''}
              onChange={e => set({ minScore: e.target.value === '' ? null : Number(e.target.value) })} />
          </>
        )}
      </div>

      {/* 已收藏 + 仅看我的 + 不含的卡 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="input-label">已收藏</span>
        <button className={chip(filters.favoritesOnly)} onClick={() => set({ favoritesOnly: !filters.favoritesOnly })}>仅看收藏</button>

        <span className="input-label ml-2">我的</span>
        <button className={chip(filters.mineOnly)} disabled={!userId} title={userId ? '只看自己发布的作业' : '登录后可用'}
          onClick={() => set({ mineOnly: !filters.mineOnly })}>仅看我发布的</button>

        <button className={chip(filters.excludeChars.length > 0)} onClick={() => setExcludeOpen(true)}>
          不含的卡{filters.excludeChars.length ? ` (${filters.excludeChars.length})` : ''}
        </button>
        {excludeOpen && createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3"
            onClick={e => { if (e.target === e.currentTarget) { setExcludeOpen(false); setSkinChar(null); } }}>
            <div className="card w-full max-w-xl max-h-[80vh] overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">不含的卡</h3>
                <button className="text-text-muted hover:text-text-primary text-xl leading-none"
                  onClick={() => { setExcludeOpen(false); setSkinChar(null); }}>×</button>
              </div>
              <div className="text-xs text-text-muted mb-3">点角色 = 排除整卡；点「皮」可只排除某个皮肤</div>
              {TEAM_ORDER.map(team => (
                <div key={team}>
                  <div className="text-xs text-accent mt-2 mb-1">{team}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {teamCharacters(team).map(c => {
                      const thumb = getCharThumbnail(c.enName);
                      const skins = getCharSkins(c.enName);
                      const whole = wholeExcluded(c.id);
                      const skinLbl = excludedSkinLabels(c.id, c.enName);
                      return (
                        <div key={c.id}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => toggleWhole(c.id)}
                              className={`flex items-center gap-1 rounded-md border px-1 py-0.5 text-xs transition-all
                                ${whole ? 'border-red-500/70 bg-red-500/15 text-red-400' : 'border-white/10 bg-bg-input hover:border-accent/40'}`}>
                              {thumb ? (
                                <img src={thumb} alt={c.name} className="w-6 h-6 rounded object-cover" loading="lazy" />
                              ) : (
                                <span className="w-6 h-6 rounded bg-black/20 flex items-center justify-center text-[8px]">{c.name.slice(0, 1)}</span>
                              )}
                              <span>{c.name}</span>
                              {skinLbl && <span className="text-[9px] bg-white/10 rounded px-1">{skinLbl}</span>}
                            </button>
                            {skins && skins.length > 1 && (
                              <button onClick={() => setSkinChar({ id: c.id, enName: c.enName })}
                                className={`w-5 h-5 rounded border text-[9px] leading-none transition-all
                                  ${skinLbl ? 'border-red-500/70 bg-red-500/15 text-red-400' : 'border-white/10 bg-bg-input text-text-muted hover:text-accent'}`}
                                title={skinLbl ? `已排除皮肤：${skinLbl}` : '按皮肤排除'}>皮</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}

        {/* 皮肤选择弹窗（叠在不含的卡弹窗之上） */}
        {skinChar && createPortal(
          <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-3"
            onClick={e => { if (e.target === e.currentTarget) setSkinChar(null); }}>
            <div className="card w-full max-w-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold">{getCharById(skinChar.id)?.name ?? ''} · 皮肤</h3>
                <button className="text-text-muted hover:text-text-primary text-xl leading-none" onClick={() => setSkinChar(null)}>×</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {getCharSkins(skinChar.enName)!.map(s => {
                  const on = skinExcluded(skinChar.id, s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSkin(skinChar.id, s.id)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-all
                        ${on ? 'border-red-500/60 bg-red-500/15 text-red-400' : 'border-white/10 bg-bg-input text-text-secondary hover:text-text-primary'}`}>
                      <img src={getSkinThumbnail(skinChar.enName, s.id) ?? ''} alt={s.label} className="w-7 h-7 rounded object-cover" loading="lazy" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
