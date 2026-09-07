import { useState, useMemo, useEffect } from 'react';
import { maxStatsData, type Stats6, type MaxStyle } from '../../data/maxStatsData';
import CollapsibleSection from '../CollapsibleSection';

type StatKey = keyof Stats6;
const STAT_LABELS: [StatKey, string][] = [
  ['pow', 'Power 力量'], ['dex', 'Dexterity 灵巧'], ['tough', 'Toughness 体力'],
  ['spr', 'Spirit 精神'], ['wis', 'Wisdom 智慧'], ['luck', 'Luck 运气'],
];
const EMPTY_STATS: Stats6 = { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 };

function supportBonus(style: MaxStyle | undefined): Stats6 {
  const out = { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 };
  if (style) for (const [k] of STAT_LABELS) out[k] = Math.ceil(0.1 * style.stats[k]);
  return out;
}

const ALL = '';
const ELEMENTS = (() => {
  const s = new Set<string>();
  for (const c of maxStatsData.characters) for (const st of c.styles) if (st.element) s.add(st.element);
  return Array.from(s).sort();
})();
const ALL_TEAMS = (() => {
  const s = new Set<string>();
  for (const c of maxStatsData.characters) for (const st of c.styles) if (st.team) s.add(st.team);
  return Array.from(s).sort();
})();

// ── 级联选择状态（主角色 + 支援）──────────────────────────
export default function MaxStatsCalculator() {
  const [element, setElement] = useState(ALL);
  const [team, setTeam] = useState(ALL);
  const [charName, setCharName] = useState('');
  const [styleIdx, setStyleIdx] = useState(0);
  const [supElement, setSupElement] = useState(ALL);
  const [supTeam, setSupTeam] = useState(ALL);
  const [supName, setSupName] = useState('');
  const [supIdx, setSupIdx] = useState(0);
  const [equipName, setEquipName] = useState(maxStatsData.equips[0]?.name ?? '');
  // 专属潜在特性（UR）：默认不装，勾选后把当前角色的专属加成（通常两项 +20）计入顶配白值
  const [urOn, setUrOn] = useState(false);

  // 该属性下可选的队伍
  const teamsForElement = useMemo(() => {
    const base = !element ? maxStatsData.characters : maxStatsData.characters.filter(c => c.styles.some(st => st.element === element));
    const s = new Set<string>();
    for (const c of base) for (const st of c.styles) if (st.team) s.add(st.team);
    return Array.from(s).sort();
  }, [element]);

  const charCandidates = useMemo(() => {
    return maxStatsData.characters.filter(c =>
      (!element || c.styles.some(st => st.element === element)) &&
      (!team || c.styles.some(st => st.team === team))
    );
  }, [element, team]);

  const char = charCandidates.find(c => c.name === charName) ?? charCandidates[0];
  const styles = (char?.styles || []).filter(st =>
    (!element || st.element === element) && (!team || st.team === team)
  );
  const style = styles[Math.min(styleIdx, styles.length - 1)];

  const supTeamsForElement = useMemo(() => {
    const base = !supElement ? maxStatsData.characters : maxStatsData.characters.filter(c => c.styles.some(st => st.element === supElement));
    const s = new Set<string>();
    for (const c of base) for (const st of c.styles) if (st.team) s.add(st.team);
    return Array.from(s).sort();
  }, [supElement]);

  const supCandidates = useMemo(() => {
    return maxStatsData.characters.filter(c =>
      (!supElement || c.styles.some(st => st.element === supElement)) &&
      (!supTeam || c.styles.some(st => st.team === supTeam))
    );
  }, [supElement, supTeam]);

  const supChar = supCandidates.find(c => c.name === supName) ?? supCandidates[0];
  const supStyles = (supChar?.styles || []).filter(st =>
    (!supElement || st.element === supElement) && (!supTeam || st.team === supTeam)
  );
  const supStyle = supStyles[Math.min(supIdx, supStyles.length - 1)];

  const equip = maxStatsData.equips.find(e => e.name === equipName);
  // 专属潜在特性（UR）：按当前主角色命中（通常两项 +20，其余 0），勾选后才计入
  const ur = maxStatsData.urPotential?.[char?.name ?? ''] ?? EMPTY_STATS;
  const urBits = STAT_LABELS.filter(([k]) => (ur[k] ?? 0) > 0)
    .map(([k, label]) => `${label.split(' ')[1]}+${ur[k]}`).join(' ');

  useEffect(() => { setCharName(charCandidates[0]?.name ?? ''); setStyleIdx(0); }, [element, team]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setStyleIdx(0); }, [charName]);
  useEffect(() => { setSupName(supCandidates[0]?.name ?? ''); setSupIdx(0); }, [supElement, supTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSupIdx(0); }, [supName]);

  const support = useMemo(() => supportBonus(supStyle), [supStyle]);

  const totals = useMemo(() => {
    const out: Stats6 = { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 };
    for (const [k] of STAT_LABELS) {
      out[k] = (style?.stats[k] ?? 0) + support[k] + (equip?.stats[k] ?? 0) + (urOn ? (ur[k] ?? 0) : 0);
    }
    return out;
  }, [style, support, equip, ur, urOn]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">顶配计算器</h2>
          <p className="text-sm text-text-muted">{maxStatsData.note}</p>
        </div>
      </div>

      <CollapsibleSection title="角色（属性 → 队伍 → 角色 → 卡面）" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="input-label">属性</div>
            <select className="input-field text-sm" value={element} onChange={e => { setElement(e.target.value); setTeam(ALL); }}>
              <option value={ALL}>全部</option>
              {ELEMENTS.map(el => <option key={el} value={el}>{el}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">队伍</div>
            <select className="input-field text-sm" value={team} onChange={e => { setTeam(e.target.value); setCharName(''); }}>
              <option value={ALL}>全部</option>
              {teamsForElement.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">角色</div>
            <select className="input-field text-sm" value={char?.name ?? ''} onChange={e => setCharName(e.target.value)}>
              {charCandidates.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">卡面</div>
            <select className="input-field text-sm" value={styleIdx} onChange={e => setStyleIdx(parseInt(e.target.value))}>
              {styles.map((s, i) => <option key={i} value={i}>{s.style}{s.element ? ` · ${s.element}` : ''}</option>)}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="共鸣" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="input-label">共鸣属性</div>
            <select className="input-field text-sm" value={supElement} onChange={e => { setSupElement(e.target.value); setSupTeam(ALL); }}>
              <option value={ALL}>全部</option>
              {ELEMENTS.map(el => <option key={el} value={el}>{el}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">共鸣队伍</div>
            <select className="input-field text-sm" value={supTeam} onChange={e => { setSupTeam(e.target.value); setSupName(''); }}>
              <option value={ALL}>全部</option>
              {supTeamsForElement.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">共鸣角色</div>
            <select className="input-field text-sm" value={supName} onChange={e => setSupName(e.target.value)}>
              <option value="">无</option>
              {supCandidates.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div className="input-label">共鸣卡面</div>
            <select className="input-field text-sm" value={supIdx} onChange={e => setSupIdx(parseInt(e.target.value))} disabled={!supName}>
              {supStyles.map((s, i) => <option key={i} value={i}>{s.style}{s.element ? ` · ${s.element}` : ''}</option>)}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="配装预设" defaultOpen>
        <div className="w-full md:w-96 space-y-3">
          <div>
            <div className="input-label">配装（含专武+5）</div>
            <select className="input-field text-sm" value={equipName} onChange={e => setEquipName(e.target.value)}>
              {maxStatsData.equips.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none" onClick={() => setUrOn(!urOn)}>
            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-all flex-shrink-0 ${urOn ? 'bg-accent border-accent' : 'toggle-off'}`}>
              {urOn && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div>
              <div className="text-xs text-text-muted">专属潜在特性（UR）</div>
              <div className="text-[10px] text-text-muted/70 leading-snug">
                {char?.name && urBits
                  ? <>当前 {char.name} 可装：{urBits.split(' ').map(b => <span key={b} className="mr-1">{b}</span>)}</>
                  : '勾选后为该角色装上专属潜在特性加成'}
              </div>
            </div>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="顶配白值（基础 + 共鸣 + 配装）" defaultOpen>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAT_LABELS.map(([k, label]) => (
            <div key={k} className="stat-box">
              <div className="text-xs text-text-muted">{label}</div>
              <div className="font-semibold text-sm num">{totals[k].toLocaleString('zh-CN')}</div>
              <div className="text-[10px] text-text-muted mt-0.5">基础 {style?.stats[k] ?? 0} + 共鸣 {support[k]} + 配装 {equip?.stats[k] ?? 0}{urOn && (ur[k] ?? 0) > 0 && <> + 专属 {ur[k]}</>}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
