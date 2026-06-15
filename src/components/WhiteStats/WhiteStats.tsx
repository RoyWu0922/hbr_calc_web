import { useState, useMemo, useEffect } from 'react';
import { CHAR_GROWTH, EQUIP_PRESETS, BIAS_TYPES, BADGE_BONUS, WEAPON_BONUS } from '../../engine/whiteStatsData';
import { calcWhiteStats, type WhiteStatsInput } from '../../engine/whiteStats';
import CollapsibleSection from '../CollapsibleSection';
import { getWhiteStatsHistory, saveWhiteStatsEntry, deleteWhiteStatsEntry, type WhiteStatsEntry } from '../../utils/whiteStatsStorage';

function fmt(n: number): string { return Math.round(n).toLocaleString('zh-CN'); }

export default function WhiteStats() {
  const [shortId, setShortId] = useState('02');
  const [level, setLevel] = useState(200);
  const [badgeLevel, setBadgeLevel] = useState(13);
  const [rebirth, setRebirth] = useState(20);
  const [biasType, setBiasType] = useState(1);     // 1=力体 2=器运 3=智精 4=力器
  const [breakLevel, setBreakLevel] = useState(5);   // 突破等级 0-6
  const [missingPower, setMissingPower] = useState(0);
  const [missingDex, setMissingDex] = useState(0);
  const [missingSpr, setMissingSpr] = useState(0);
  const [missingPowerDex, setMissingPowerDex] = useState(0);
  const [baseFix, setBaseFix] = useState({ pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 });
  const [equipPreset, setEquipPreset] = useState('[对HP+]最优配装');
  const [weaponLevel, setWeaponLevel] = useState(5);
  const [scoreBuff, setScoreBuff] = useState(0);
  const [necklaceLuck, setNecklaceLuck] = useState(0);
  const [support, setSupport] = useState({ pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 });

  const input: WhiteStatsInput = useMemo(() => ({
    shortId, level, badgeLevel, rebirth, biasType, breakLevel,
    missingPower, missingDex, missingSpr, missingPowerDex,
    baseFix, equipPreset, weaponLevel,
    resonance: 0, support, scoreBuff,
    totalFix: { pow: 0, dex: 0, tough: 0, spr: 0, wis: 0, luck: 0 },
    necklaceLuck,
  }), [shortId, level, badgeLevel, rebirth, biasType, breakLevel,
      missingPower, missingDex, missingSpr, missingPowerDex,
      baseFix, equipPreset, weaponLevel, scoreBuff, necklaceLuck, support]);

  const result = useMemo(() => calcWhiteStats(input), [input]);

  // History
  const [history, setHistory] = useState<WhiteStatsEntry[]>([]);
  useEffect(() => { getWhiteStatsHistory().then(setHistory); }, []);

  const handleSave = async () => {
    const char = CHAR_GROWTH.find(c => c.shortId === shortId);
    const label = char ? `${shortId} — ${char.name}` : `ID: ${shortId}`;
    await saveWhiteStatsEntry({
      timestamp: Date.now(), label,
      input: { ...input },
      totalStats: { ...result.totalStats },
      resonanceEff: { ...result.resonanceEff },
    });
    setHistory(await getWhiteStatsHistory());
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条记录？')) return;
    await deleteWhiteStatsEntry(id);
    setHistory(await getWhiteStatsHistory());
  };

  const handleLoad = (entry: WhiteStatsEntry) => {
    const inp = entry.input;
    setShortId(inp.shortId);
    setLevel(inp.level);
    setBadgeLevel(inp.badgeLevel);
    setRebirth(inp.rebirth);
    setBiasType(inp.biasType);
    setBreakLevel(inp.breakLevel);
    setMissingPower(inp.missingPower);
    setMissingDex(inp.missingDex);
    setMissingSpr(inp.missingSpr);
    setMissingPowerDex(inp.missingPowerDex);
    setBaseFix(inp.baseFix);
    setEquipPreset(inp.equipPreset);
    setWeaponLevel(inp.weaponLevel);
    setScoreBuff(inp.scoreBuff);
    setNecklaceLuck(inp.necklaceLuck);
    setSupport(inp.support);
  };

  const char = CHAR_GROWTH.find(c => c.shortId === shortId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">白值计算</h2>
            <p className="text-sm text-text-muted">数据来源: 凛冬_ 白值计算器2026.6.5版</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>保存到历史</button>
        </div>

      {/* 角色选择 */}
      <CollapsibleSection title="角色选择" defaultOpen>
        <div className="w-64">
          <select className="input-field text-sm" value={shortId}
            onChange={e => setShortId(e.target.value)}>
            {CHAR_GROWTH.map(c => (
              <option key={c.shortId} value={c.shortId}>
                {c.shortId} — {c.name}
              </option>
            ))}
          </select>
        </div>
      </CollapsibleSection>

      {/* 基础参数 */}
      <CollapsibleSection title="基础参数" defaultOpen>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Field label="等级 (Level)" value={level} onChange={setLevel} />
          <div>
            <div className="input-label">徽章等级</div>
            <select className="input-field text-sm" value={badgeLevel}
              onChange={e => setBadgeLevel(parseInt(e.target.value))}>
              {Object.entries(BADGE_BONUS).map(([k, v]) => (
                <option key={k} value={k}>Lv{k} (+{v})</option>
              ))}
            </select>
          </div>
          <Field label="转生次数" value={rebirth} onChange={setRebirth} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="input-label">强化偏向</div>
            <select className="input-field text-sm" value={biasType}
              onChange={e => setBiasType(parseInt(e.target.value))}>
              {BIAS_TYPES.map(b => (
                <option key={b.id} value={b.id}>{b.label}偏向</option>
              ))}
            </select>
          </div>
          <div>
            <div className="input-label">突破等级 (0-6) (原皮满破+1, 开花+1)</div>
            <select className="input-field text-sm" value={breakLevel}
              onChange={e => setBreakLevel(parseInt(e.target.value))}>
              {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>Lv{n}</option>)}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* 缺失SS & 基础修正 — 默认折叠 */}
      <CollapsibleSection title="缺失SS形态 / 基础值修正" defaultOpen={false}>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Field label="缺力体型" value={missingPower} onChange={setMissingPower} />
          <Field label="缺器运型" value={missingDex} onChange={setMissingDex} />
          <Field label="缺智精型" value={missingSpr} onChange={setMissingSpr} />
          <Field label="缺力器型" value={missingPowerDex} onChange={setMissingPowerDex} />
        </div>
        <div className="text-xs text-text-muted mb-2">基础值修正</div>
        <div className="grid grid-cols-6 gap-3">
          <Field label="Pow" value={baseFix.pow} onChange={v => setBaseFix(f => ({ ...f, pow: v }))} />
          <Field label="Dex" value={baseFix.dex} onChange={v => setBaseFix(f => ({ ...f, dex: v }))} />
          <Field label="Tough" value={baseFix.tough} onChange={v => setBaseFix(f => ({ ...f, tough: v }))} />
          <Field label="Spr" value={baseFix.spr} onChange={v => setBaseFix(f => ({ ...f, spr: v }))} />
          <Field label="Wis" value={baseFix.wis} onChange={v => setBaseFix(f => ({ ...f, wis: v }))} />
          <Field label="Luck" value={baseFix.luck} onChange={v => setBaseFix(f => ({ ...f, luck: v }))} />
        </div>
      </CollapsibleSection>

      {/* 配装 & 专武 */}
      <CollapsibleSection title="配装 & 专武" defaultOpen>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="input-label flex items-center gap-0.5">
              配装预设(不包括专武)
              <span className="relative inline-flex align-middle group">
                <span className="text-text-muted group-hover:text-text-secondary text-[10px]"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--app-checkbox-border)', fontWeight: 700, cursor: 'help' }}>?</span>
                <div className="absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-card border border-white/10 rounded-lg p-2 shadow-xl whitespace-pre-line text-[10px] hidden group-hover:block" style={{ minWidth: 240, color: 'var(--app-text-secondary)' }}>
                  除「对DP+最优配装」外，戒指默认为力量偏向
                  除「脆弱最优配装」及「脆弱最优，但红晶片用完了」外，戒指额外词条默认为智力
                </div>
              </span>
            </div>
            <select className="input-field text-sm" value={equipPreset}
              onChange={e => setEquipPreset(e.target.value)}>
              {EQUIP_PRESETS.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="input-label">灵魂(专武)+值</div>
            <select className="input-field text-sm" value={weaponLevel}
              onChange={e => setWeaponLevel(parseInt(e.target.value))}>
              {Object.entries(WEAPON_BONUS).map(([k, v]) => (
                <option key={k} value={k}>+{k} (+{v})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <div className="input-label">打分buff</div>
            <select className="input-field text-sm" value={scoreBuff}
              onChange={e => setScoreBuff(parseInt(e.target.value))}>
              <option value={0}>0</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div>
            <div className="input-label">坠链运气加成(选择裸装时失效)</div>
            <select className="input-field text-sm" value={necklaceLuck}
              onChange={e => setNecklaceLuck(parseInt(e.target.value))}>
              <option value={0}>0</option>
              <option value={48}>48</option>
            </select>
          </div>
        </div>
        <div className="text-xs text-text-muted mb-2">支援修正</div>
        <div className="grid grid-cols-6 gap-3">
          <Field label="Pow(力量)" value={support.pow} onChange={v => setSupport(f => ({ ...f, pow: v }))} />
          <Field label="Dex(灵巧)" value={support.dex} onChange={v => setSupport(f => ({ ...f, dex: v }))} />
          <Field label="Tough(体力)" value={support.tough} onChange={v => setSupport(f => ({ ...f, tough: v }))} />
          <Field label="Spr(精神)" value={support.spr} onChange={v => setSupport(f => ({ ...f, spr: v }))} />
          <Field label="Wis(智慧)" value={support.wis} onChange={v => setSupport(f => ({ ...f, wis: v }))} />
          <Field label="Luck(运气)" value={support.luck} onChange={v => setSupport(f => ({ ...f, luck: v }))} />
        </div>
      </CollapsibleSection>

      {/* Output1: 基础状态值 */}
      <CollapsibleSection title="Output1 — 基础状态值" defaultOpen>
        <div className="grid grid-cols-6 gap-3">
          <StatBox label="Power(力量)" value={fmt(result.baseStats.pow)} />
          <StatBox label="Dexterity(灵巧)" value={fmt(result.baseStats.dex)} />
          <StatBox label="Toughness(体力)" value={fmt(result.baseStats.tough)} />
          <StatBox label="Spirit(精神)" value={fmt(result.baseStats.spr)} />
          <StatBox label="Wisdom(智慧)" value={fmt(result.baseStats.wis)} />
          <StatBox label="Luck(运气)" value={fmt(result.baseStats.luck)} />
        </div>
      </CollapsibleSection>

      {/* Output2: 合计状态值 */}
      <CollapsibleSection title="Output2 — 合计状态值" defaultOpen>
        <div className="grid grid-cols-6 gap-3 mb-2">
          <StatBox label="Power(力量)" value={fmt(result.totalStats.pow)} highlight />
          <StatBox label="Dexterity(灵巧)" value={fmt(result.totalStats.dex)} highlight />
          <StatBox label="Toughness(体力)" value={fmt(result.totalStats.tough)} highlight />
          <StatBox label="Spirit(精神)" value={fmt(result.totalStats.spr)} highlight />
          <StatBox label="Wisdom(智慧)" value={fmt(result.totalStats.wis)} highlight />
          <StatBox label="Luck(运气)" value={fmt(result.totalStats.luck)} highlight />
        </div>
        <div className="text-xs text-text-muted">
          倍率: {BIAS_TYPES.find(b => b.id === biasType)?.label}偏向 |
          装备: {equipPreset} | 专武+{weaponLevel}
        </div>
      </CollapsibleSection>

      {/* Output3-共鸣有效值 */}
      <CollapsibleSection title={<span>Output3 — 共鸣有效值 <span className="text-text-muted font-normal text-xs">(不含配装/专武/共鸣，十位向上取整)</span></span>} defaultOpen>
        <div className="grid grid-cols-6 gap-3">
          <StatBox label="Power" value={fmt(result.resonanceEff.pow)} />
          <StatBox label="Dexterity" value={fmt(result.resonanceEff.dex)} />
          <StatBox label="Toughness" value={fmt(result.resonanceEff.tough)} />
          <StatBox label="Spirit" value={fmt(result.resonanceEff.spr)} />
          <StatBox label="Wisdom" value={fmt(result.resonanceEff.wis)} />
          <StatBox label="Luck" value={fmt(result.resonanceEff.luck)} />
        </div>
      </CollapsibleSection>

      {/* Output3: 有效值 */}
      <div className="grid grid-cols-2 gap-4">
        <CollapsibleSection title="攻击技能有效值" defaultOpen>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="HP偏有效值" value={result.hpEff.toFixed(1)} />
            <StatBox label="DP偏有效值" value={result.dpEff.toFixed(1)} />
            <StatBox label="无偏有效值" value={result.neutralEff.toFixed(1)} />
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="dbf有效值 (减防/脆弱)" defaultOpen>
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="减防有效值" value={result.defDownEff.toFixed(1)} />
            <StatBox label="脆弱有效值" value={result.vulnEff.toFixed(1)} />
          </div>
        </CollapsibleSection>
      </div>

      {/* Footer info */}
      <div className="text-xs text-text-muted">
        ID={char?.fullId} ({shortId}) | {char?.name} | Lv{level} | 转生{rebirth} |
        徽章{badgeLevel} | {BIAS_TYPES.find(b => b.id === biasType)?.label}偏向 | 突破{breakLevel}
      </div>
      </div>

      {/* History panel */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--app-text-primary)' }}>历史记录</h3>
        {history.length === 0 ? (
          <p className="text-xs text-text-muted">暂无保存记录</p>
        ) : (
          <div className="space-y-2 max-h-[80vh] overflow-y-auto">
            {history.map(entry => (
              <div key={entry.id} className="card !p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--app-text-primary)' }}>{entry.label}</span>
                  <span className="text-[10px] text-text-muted">{new Date(entry.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {/* Stat header + 2 rows of 6 columns */}
                <div className="text-[10px] mb-1.5">
                  <div className="grid grid-cols-6 gap-0.5 text-center text-text-muted mb-0.5">
                    <div>力</div><div>灵</div><div>体</div><div>精</div><div>智</div><div>运</div>
                  </div>
                  <div className="grid grid-cols-6 gap-0.5 text-center font-mono mb-0.5">
                    <div>{fmt(entry.totalStats.pow)}</div>
                    <div>{fmt(entry.totalStats.dex)}</div>
                    <div>{fmt(entry.totalStats.tough)}</div>
                    <div>{fmt(entry.totalStats.spr)}</div>
                    <div>{fmt(entry.totalStats.wis)}</div>
                    <div>{fmt(entry.totalStats.luck)}</div>
                  </div>
                  <div className="grid grid-cols-6 gap-0.5 text-center font-mono text-text-muted">
                    <div>{fmt(entry.resonanceEff.pow)}</div>
                    <div>{fmt(entry.resonanceEff.dex)}</div>
                    <div>{fmt(entry.resonanceEff.tough)}</div>
                    <div>{fmt(entry.resonanceEff.spr)}</div>
                    <div>{fmt(entry.resonanceEff.wis)}</div>
                    <div>{fmt(entry.resonanceEff.luck)}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button className="btn btn-primary btn-xs" onClick={() => handleLoad(entry)}>读取</button>
                  <button className="btn btn-danger btn-xs" onClick={() => entry.id && handleDelete(entry.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared Helpers ───────────────────────────────────────────
function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="input-label truncate">{label}</div>
      <input className="input-field text-sm" type="number"
        value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="stat-box">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`font-semibold text-sm ${highlight ? 'text-gold' : ''}`}>{value}</div>
    </div>
  );
}
