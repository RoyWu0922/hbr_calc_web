import { useState } from 'react';
import { useAuth } from '../../utils/auth';
import { submitGuide, updateGuide } from '../../utils/guideStorage';
import { GUIDE_ATTRIBUTES, getCharById, getCharSkins, getSlotThumbnail, resolveSlotSkin } from '../../data/guideData';
import type { GuideAttribute, GuideCategory, GuideEntry, GuideStage, GuideTeamSlot } from '../../types';
import CharacterPickerModal from './CharacterPicker';

export default function GuideUploadForm({ category, allowCategoryChange, isAdmin, initial, onClose, onSubmitted }: {
  category: GuideCategory;
  allowCategoryChange?: boolean;
  isAdmin: boolean;
  initial?: GuideEntry | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const editing = !!initial?.uuid;
  const [cat, setCat] = useState<GuideCategory>(initial?.category ?? category);
  const [period, setPeriod] = useState<number>(initial?.period ?? (category === 'ex' ? 1 : 100));
  const [stage, setStage] = useState<GuideStage>(initial?.stage ?? 'P1');
  const [attribute, setAttribute] = useState<GuideAttribute>(initial?.attribute ?? '火');
  const [weather, setWeather] = useState(initial?.weather ?? false);
  const [turns, setTurns] = useState(initial?.turns ?? 1);
  const [team, setTeam] = useState<(GuideTeamSlot | null)[]>(() =>
    Array.from({ length: 6 }, (_, i) => initial?.team?.[i] ?? null));
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [score, setScore] = useState(initial?.score != null ? String(initial.score) : '');
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const setSlot = (i: number, v: GuideTeamSlot | null) => setTeam(t => t.map((s, idx) => idx === i ? v : s));

  // 实槽：点击循环突破 0→1→2→3→4；4 再点清空回 +
  const cycleSlot = (i: number) => {
    const s = team[i];
    if (!s) return;
    if (s.break < 4) setSlot(i, { ...s, break: s.break + 1 });
    else setSlot(i, null);
  };

  const slotInfo = (s: GuideTeamSlot) => {
    const c = getCharById(s.characterId);
    if (!c) return null;
    const skin = getCharSkins(c.enName)?.find(x => x.id === resolveSlotSkin(c.enName, s.skin));
    return { name: c.name, skinLabel: skin?.label ?? '', thumb: getSlotThumbnail(s) };
  };

  const submit = async () => {
    setErr('');
    if (!user) { setErr('请先登录后再投稿'); return; }
    if (!author.trim()) { setErr('请填写作者'); return; }
    if (turns < 1 || turns > 15) { setErr('回合数需在 1~15'); return; }
    const filled = team.filter((s): s is GuideTeamSlot => !!s);
    if (!filled.length) { setErr('请至少选择 1 名角色'); return; }
    setBusy(true);
    const entry: GuideEntry = {
      category: cat,
      period: Number(period) || (cat === 'ex' ? 1 : 100),
      stage: cat === 'ex' ? stage : undefined,
      attribute,
      weather: cat === 'ex' ? weather : undefined,
      turns,
      team: filled,
      author: author.trim(),
      videoUrl: videoUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      score: cat === 'score' ? (Number(score) || undefined) : undefined,
      status: isAdmin ? 'approved' : 'pending',
      userId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const e = editing && initial?.uuid
      ? await updateGuide(initial.uuid, entry)
      : await submitGuide(entry, user.id, isAdmin);
    setBusy(false);
    if (e) setErr(e); else { onSubmitted(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">{editing ? '编辑作业' : `上传作业${isAdmin ? '（管理员 · 直接发布）' : ''}`}</h3>
          <button className="text-text-muted hover:text-text-primary text-xl leading-none" onClick={onClose}>×</button>
        </div>

        {allowCategoryChange && (
          <div className="flex gap-2 mb-3">
            <button className={`sub-tab text-sm ${cat === 'ex' ? 'active' : ''}`} onClick={() => setCat('ex')}>异时层EX</button>
            <button className={`sub-tab text-sm ${cat === 'score' ? 'active' : ''}`} onClick={() => setCat('score')}>打分EX</button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="input-label">期数
            <input type="number" className="input-field mt-1" value={period} onChange={e => setPeriod(Number(e.target.value))} />
          </label>
          {cat === 'ex' && (
            <label className="input-label">阶段
              <select className="input-field mt-1" value={stage} onChange={e => setStage(e.target.value as GuideStage)}>
                <option value="P1">P1</option><option value="P2">P2</option>
              </select>
            </label>
          )}
          <label className="input-label">属性
            <select className="input-field mt-1" value={attribute} onChange={e => setAttribute(e.target.value as GuideAttribute)}>
              {GUIDE_ATTRIBUTES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="input-label">回合
            <input type="number" min={1} max={15} className="input-field mt-1" value={turns} onChange={e => setTurns(Number(e.target.value))} />
          </label>
          {cat === 'ex' && (
            <label className="input-label flex items-center gap-2 self-end pb-1 cursor-pointer select-none">
              <input type="checkbox" checked={weather} onChange={e => setWeather(e.target.checked)} />
              需要天气
            </label>
          )}
          {cat === 'score' && (
            <label className="input-label">分数
              <input type="number" className="input-field mt-1" value={score} onChange={e => setScore(e.target.value)} />
            </label>
          )}
        </div>

        <div className="mt-3">
          <div className="input-label mb-1">队伍编成（点 + 选角色，再点头像提升突破，4 突后再点清空）</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {team.map((slot, i) => {
              if (!slot) {
                return (
                  <button key={i} onClick={() => setPickerIdx(i)}
                    className="aspect-square rounded-lg border border-dashed border-white/25 bg-bg-input/50 flex items-center justify-center text-2xl text-text-muted hover:border-accent/60 hover:text-accent transition-all"
                    title="选择角色">
                    +
                  </button>
                );
              }
              const info = slotInfo(slot);
              return (
                <button key={i} onClick={() => cycleSlot(i)}
                  className="relative rounded-lg overflow-hidden border border-white/10 aspect-square group hover:border-accent/60 transition-all"
                  title={info ? `${info.name}${info.skinLabel ? ` · ${info.skinLabel}` : ''}（点击提升突破）` : '点击提升突破'}>
                  {info?.thumb ? (
                    <img src={info.thumb} alt={info.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-text-muted px-1 text-center leading-tight bg-black/20">{info?.name ?? '?'}</div>
                  )}
                  {info?.skinLabel && (
                    <span className="absolute top-0 left-0 text-[9px] leading-4 bg-black/70 text-white px-1 rounded-br">{info.skinLabel}</span>
                  )}
                  <span className="absolute bottom-0 inset-x-0 text-center text-[10px] leading-4 bg-black/70 text-white">{slot.break}突</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <label className="input-label">作者
            <input className="input-field mt-1" value={author} onChange={e => setAuthor(e.target.value)} />
          </label>
          <label className="input-label">视频链接
            <input className="input-field mt-1" placeholder="https://…" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
          </label>
          <label className="input-label">备注
            <input className="input-field mt-1" value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>

        {err && <div className="text-red-400 text-xs mt-3">{err}</div>}

        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary flex-1" onClick={submit} disabled={busy}>{busy ? '提交中…' : editing ? '保存修改' : isAdmin ? '直接发布' : '提交审核'}</button>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>

      <CharacterPickerModal open={pickerIdx !== null} onClose={() => setPickerIdx(null)}
        onPick={sel => { if (pickerIdx != null) setSlot(pickerIdx, { characterId: sel.characterId, skin: sel.skin, break: 0 }); }} />
    </div>
  );
}
