import { useMemo, useState, useRef } from 'react';
import { medalData } from '../../data/medalData';
import type { MedalRecordStore } from '../../utils/medalStorage';
import { tierPointsForChar, charBadgeSummary, charJewelSummary, calcRankInfo, charCatDone } from '../../utils/medalCalc';
import { exportElementToPNG } from '../../utils/exportImage';
import BadgeChecklist from './BadgeChecklist';
import JewelView from './JewelView';

type SortKey = 'default' | 'rank' | 'count' | 'team' | 'cat';
type ProgressKey = 'all' | 'none' | 'partial' | 'done' | 'min';

export default function MedalRecord({ mode, store }: { mode: 'medal' | 'jewel'; store: MedalRecordStore }) {
  const { record, setCat, setJewel, customChars, addCharacter, removeCharacter } = store;
  const [team, setTeam] = useState('all');
  const [progress, setProgress] = useState<ProgressKey>('all');
  const [minCount, setMinCount] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [sortCat, setSortCat] = useState(medalData.checklist[0].key);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('');

  const allChars = useMemo(() => [...medalData.characters, ...customChars], [customChars]);
  const orderBy = useMemo(() => new Map(medalData.charOrder.map((en, i) => [en, i])), []);

  const visibleChars = useMemo(() => {
    let list = allChars.filter(ch => {
      if (team !== 'all' && ch.team !== team) return false;
      if (query && !(ch.name.includes(query) || ch.enName.toLowerCase().includes(query.toLowerCase()))) return false;
      const rec = record[String(ch.id)] || { cats: {}, jewels: {} };
      const { count, total } = charBadgeSummary(rec.cats ?? {}, medalData, ch.enName);
      if (progress === 'none' && count !== 0) return false;
      if (progress === 'partial' && (count === 0 || count === total)) return false;
      if (progress === 'done' && count !== total) return false;
      if (progress === 'min' && count < minCount) return false;
      return true;
    });
    const score = (ch: typeof allChars[number]) => {
      const rec = record[String(ch.id)] || { cats: {}, jewels: {} };
      if (mode === 'jewel') return charJewelSummary(rec.jewels, medalData.jewels.length).learned;
      return charBadgeSummary(rec.cats ?? {}, medalData, ch.enName).count;
    };
    if (sort === 'rank') {
      list = [...list].sort((a, b) => {
        const ra = calcRankInfo(charBadgeSummary(record[String(a.id)]?.cats ?? {}, medalData, a.enName).sum, medalData.rankThresholds);
        const rb = calcRankInfo(charBadgeSummary(record[String(b.id)]?.cats ?? {}, medalData, b.enName).sum, medalData.rankThresholds);
        return rb.rank - ra.rank;
      });
    } else if (sort === 'count') {
      list = [...list].sort((a, b) => score(b) - score(a));
    } else if (sort === 'team') {
      list = [...list].sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : a.name < b.name ? -1 : 1));
    } else if (sort === 'cat') {
      list = [...list].sort((a, b) =>
        charCatDone(record[String(b.id)]?.cats, medalData, b.enName, sortCat) -
        charCatDone(record[String(a.id)]?.cats, medalData, a.enName, sortCat));
    } else {
      list = [...list].sort((a, b) => {
        const ai = orderBy.get(a.enName) ?? Number.MAX_SAFE_INTEGER;
        const bi = orderBy.get(b.enName) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    }
    return list;
  }, [allChars, team, progress, minCount, query, sort, sortCat, record, mode, orderBy]);

  const overall = useMemo(() => {
    // Reflects the currently filtered set (team/search/progress) — e.g. team filter → that team's completion
    let done = 0, totalValid = 0, learned = 0;
    for (const ch of visibleChars) {
      const rec = record[String(ch.id)] || { cats: {}, jewels: {} };
      const bs = charBadgeSummary(rec.cats ?? {}, medalData, ch.enName);
      done += bs.count; totalValid += bs.total;
      learned += charJewelSummary(rec.jewels, medalData.jewels.length).learned;
    }
    const jewelTotal = visibleChars.length * medalData.jewels.length;
    return {
      badgePct: totalValid ? Math.round(done / totalValid * 100) : 0,
      jewelPct: jewelTotal ? Math.round(learned / jewelTotal * 100) : 0,
      done, totalValid, learned, jewelTotal,
    };
  }, [visibleChars, record]);

  const teamOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const en of medalData.charOrder) {
      const ch = medalData.characters.find(c => c.enName === en);
      if (ch) seen.add(ch.team);
    }
    return Array.from(seen);
  }, []);

  const contentRef = useRef<HTMLDivElement>(null);
  const exportImage = async () => {
    const el = contentRef.current;
    if (!el) return;
    const label = mode === 'medal' ? '勋章' : '宝玉';
    await exportElementToPNG(el, `hbr-${label}进度-${new Date().toISOString().slice(0, 10)}.png`);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs text-text-muted mb-1">{mode === 'medal' ? '勋章完成度(整体)' : '宝玉习得度(整体)'}</div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--color-accent-r), var(--color-accent-g), var(--color-accent-b), 0.15)' }}>
              <div className="h-full rounded-full" style={{ width: `${mode === 'medal' ? overall.badgePct : overall.jewelPct}%`, background: 'var(--color-accent)' }} />
            </div>
            <div className="text-xs text-text-muted mt-1">
              {mode === 'medal' ? `${overall.done}/${overall.totalValid} 档完成` : `${overall.learned}/${overall.jewelTotal} 宝玉习得`}
            </div>
          </div>
          <div className="text-4xl font-extrabold text-accent shrink-0 leading-none">
            {mode === 'medal' ? overall.badgePct : overall.jewelPct}%
          </div>
          <button className="btn btn-accent btn-sm" onClick={() => setAdding(a => !a)}>+</button>
          <button className="btn btn-secondary btn-sm" onClick={exportImage} title="导出当前进度为图片">导出图片</button>
        </div>
        {adding && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="input-field flex-1 min-w-[160px]">
              <input placeholder="角色名(如:新角色)" value={newName} onChange={e => setNewName(e.target.value)} className="bg-transparent outline-none w-full" />
            </div>
            <select className="input-field" value={newTeam} onChange={e => setNewTeam(e.target.value)}>
              <option value="">队伍(可选)</option>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => { if (newName.trim()) { addCharacter(newName.trim(), newTeam); setNewName(''); setNewTeam(''); setAdding(false); } }}>添加</button>
          </div>
        )}
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <select className="input-field" value={team} onChange={e => setTeam(e.target.value)}>
          <option value="all">全部队伍</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input-field" value={progress} onChange={e => setProgress(e.target.value as ProgressKey)}>
          <option value="all">全部进度</option>
          <option value="none">未开始</option>
          <option value="partial">进行中</option>
          <option value="done">{mode === 'medal' ? '已满勋章' : '已全宝玉'}</option>
          <option value="min">完成 ≥ N 项</option>
        </select>
        {progress === 'min' && (
          <input type="number" min={0} className="input-field w-24" value={minCount}
            onChange={e => setMinCount(Number(e.target.value))} />
        )}
        <input className="input-field flex-1 min-w-[140px]" placeholder="搜索角色名" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="input-field" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="default">默认排序(BadgeReward)</option>
          <option value="rank">按 Rank 降序</option>
          <option value="count">{mode === 'medal' ? '按完成数降序' : '按习得数降序'}</option>
          <option value="team">按队伍+名字</option>
          <option value="cat">按分类完成数</option>
        </select>
        {sort === 'cat' && (
          <select className="input-field" value={sortCat} onChange={e => setSortCat(e.target.value)}>
            {medalData.checklist.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        )}
      </div>

      <div ref={contentRef}>
        {mode === 'medal'
          ? <BadgeChecklist data={medalData} record={record} visibleChars={visibleChars} setCat={setCat} removeCharacter={removeCharacter} />
          : <JewelView data={medalData} record={record} visibleChars={visibleChars} setJewel={setJewel} />}
      </div>
    </div>
  );
}
