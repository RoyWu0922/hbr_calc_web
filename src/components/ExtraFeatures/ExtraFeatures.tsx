import { useState, useMemo, useEffect, useRef } from 'react';
import ImageInfoTip from '../ImageInfoTip';
import saPic from '/SA_pic.png';
import defensePic from '/defense.png';
import { calcScore, calcBreakDetail, calcEncounterScore, calcIncomingDamage } from '../../engine/damage';
import { SCORE_TABLE, TURN_COEFF } from '../../engine/skillDb';
import { BreakParams } from '../../types';

function fmt(n: number): string { return Math.round(n).toLocaleString('zh-CN'); }
function fmtDec(n: number, d = 2): string { return n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }); }

// Collapse toggle for card headers
function CollapseHeader({ title, open, setOpen }: { title: React.ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="card-header flex justify-between items-center cursor-pointer select-none" onClick={() => setOpen(!open)}>
      <span>{title}</span>
      <span className="text-text-muted text-lg transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
    </div>
  );
}

export default function ExtraFeatures() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">额外功能</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <ODCalculator />
        <BreakCalculator />
      </div>
      <QuickScoreCard />
      <EncounterCalc />
      <IncomingDamageCalc />
    </div>
  );
}

// ─── OD Calculator (Copy-OD method) ─────────────────────────
function ODCalculator() {
  const [origHit, setOrigHit] = useState(0);
  const [addHit, setAddHit] = useState(0);
  const [fixedOD, setFixedOD] = useState(0);
  const [targets, setTargets] = useState(1);
  const [earring, setEarring] = useState(15);
  const [odRise, setOdRise] = useState(0);
  const [odRate, setOdRate] = useState(100);
  const [resist, setResist] = useState(false);
  const calc = () => {
    // J: actual OD gain coefficient
    let j: number;
    if (origHit > 9) j = earring;
    else if (origHit === 0) j = 0;
    else if (earring === 0) j = 0;
    else j = ((origHit - 1) / 9 * (earring - 5) + 5);
    j = j / 100 + 1 + odRise / 100;

    // N: actual OD%
    const part1 = Math.floor(fixedOD * j * 100) / 100;
    const j25 = Math.floor(j * 2.5 * 100) / 100;
    const part2 = (origHit + addHit) * (resist ? 0 : 1) * Math.floor(j25 * odRate) / 100 * targets;
    const n = (part1 + part2) / 100;
    const actualHits = n * 40;
    return { j, n, actualHits };
  };

  const r = calc();

  return (
    <div className="card">
      <div className="card-header">便捷OD计算</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Field label="原始hit数" value={origHit} onChange={setOrigHit} />
          <Field label="附加连击数" value={addHit} onChange={setAddHit} />
          <Field label="固定OD%" value={fixedOD} onChange={setFixedOD} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Field label="目标数" value={targets} onChange={setTargets} />
          <div>
            <div className="input-label">耳环系数%</div>
            <select className="input-field text-xs py-1.5" value={earring}
              onChange={e => setEarring(parseInt(e.target.value))}>
              <option value={0}>0</option>
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={15}>15</option>
            </select>
          </div>
          <Field label="目标OD率%" value={odRate} onChange={setOdRate} step={0.5} />
        </div>
        <div className="grid grid-cols-3 gap-3 items-end mb-3">
          <div>
            <div className="input-label flex items-center gap-0.5">额外od上升量% <OdRiseTip /></div>
            <input className="input-field text-xs py-1.5" type="text" inputMode="decimal" step={0.01}
              value={odRise} onChange={e => setOdRise(parseFloat(e.target.value) || 0)} />
          </div>
          <Toggle label="耐性" value={resist} onChange={setResist} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="实际OD上升量" value={fmtDec(r.j, 4)} />
          <StatBox label="实际OD%" value={(r.n * 100).toFixed(2) + '%'} />
          <StatBox label="实际hit数(参考)" value={fmtDec(r.actualHits, 3)} />
        </div>
    </div>
  );
}

// ─── Break Calculator (dmg calc method) ──────────────────────
function BreakCalculator() {
  const [skillDR, setSkillDR] = useState(0);
  const [enemyDR, setEnemyDR] = useState(0);
  const [origHits, setOrigHits] = useState(0);
  const [earring, setEarring] = useState(0);
  const [necklace, setNecklace] = useState(0);
  const [otherDR, setOtherDR] = useState(0);
  const [superChain, setSuperChain] = useState(0);
  const [bigChain, setBigChain] = useState(0);
  const [midChain, setMidChain] = useState(0);
  const [smallChain, setSmallChain] = useState(0);
  const [maxDR, setMaxDR] = useState<number | undefined>(undefined);  // %, undefined = no cap
  const [initDR, setInitDR] = useState(100);  // %, default 100%
  // Hit distributions (per original hit)
  const [dists, setDists] = useState<number[]>(Array(12).fill(0));

  const breakParams: BreakParams = useMemo(() => ({
    skillDR, enemyDR, origHits,
    earring, necklace, otherDR: otherDR / 100,
    superChain, bigChain, midChain, smallChain,
    maxDR: maxDR !== undefined ? maxDR / 100 : undefined,
    initDR: initDR / 100,
    dists: dists.slice(0, origHits),
  }), [skillDR, enemyDR, origHits, earring, necklace, otherDR, superChain, bigChain, midChain, smallChain, maxDR, initDR, dists]);

  const result = useMemo(() => calcBreakDetail(breakParams), [breakParams]);

  return (
    <div className="card">
      <div className="card-header">加权破坏计算 <span className="text-text-muted ml-2 font-normal text-xs"></span></div>
      {/* Row 1: enemy DR, max DR, init DR */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="敌人DR%" value={enemyDR} onChange={setEnemyDR} step={0.01} />
        <Field label="敌人最大破坏率%" value={maxDR ?? 0} onChange={v => setMaxDR(v || undefined)} step={1} />
        <Field label="敌人初始破坏率%" value={initDR} onChange={setInitDR} step={1} />
      </div>
      {/* Row 2: skill DR, original hits */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="技能破坏倍率(DR)" value={skillDR} onChange={setSkillDR} step={0.1} />
        <Field label="技能原始Hit数" value={origHits} onChange={setOrigHits} />
      </div>
      {/* Row 3: 4 chain types */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Field label="特大连击50%" value={superChain} onChange={setSuperChain} />
        <Field label="大连击25%" value={bigChain} onChange={setBigChain} />
        <Field label="中连击12%" value={midChain} onChange={setMidChain} />
        <Field label="小连击6%" value={smallChain} onChange={setSmallChain} />
      </div>
      {/* Row 4: other DR, earring, necklace */}
      <div className="flex gap-4 items-end mb-3">
        <div className="w-40"><Field label="其他破坏率增量%" value={otherDR} onChange={setOtherDR} step={0.1} /></div>
        <Toggle label="破坏耳环" value={!!earring} onChange={v => setEarring(v ? 1 : 0)} />
        <Toggle label="恒星战项链" value={!!necklace} onChange={v => setNecklace(v ? 1 : 0)} />
      </div>
      <div className="mb-2">
        <div className="text-xs text-text-muted mb-1">Hit分布 (每本体hit)</div>
        <div className="flex gap-1 flex-wrap">
          {dists.map((d, i) => i < origHits && (
            <input key={i} className="input-field w-14 text-xs py-1" type="number" step={0.01} value={d}
              onChange={e => { const n = [...dists]; n[i] = parseFloat(e.target.value) || 0; setDists(n); }} />
          ))}
        </div>
      </div>
      <div className="text-xs text-text-muted mb-1">耳环加成: {result.earringBonus.toFixed(3)} | DR乘数: {result.drMultiplier.toFixed(3)}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <StatBox label="理论DR增量" value={fmtDec(result.theoreticalDRInc, 4)} />
        <StatBox label="理论破坏率增量" value={(result.theoreticalBreakInc * 100).toFixed(2) + '%'} />
        <StatBox label="实际最终破坏率" value={(result.actualFinalDR * 100).toFixed(2) + '%'} />
      </div>
      <div className="mb-3">
        <StatBox label="平均破坏率" value={(result.averageDR * 100).toFixed(2) + '%'} highlight />
      </div>
      {/* Detail table */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-text-muted hover:text-text-secondary">展开Hit明细</summary>
        <div className="mt-2 max-h-60 overflow-y-auto">
          <table>
            <thead><tr><th>Hit</th><th>类型</th><th>乘区</th><th>DR增量</th><th>累计DR</th><th>伤害</th></tr></thead>
            <tbody>
              {result.hitDetails.map(r => (
                <tr key={r.hit}>
                  <td>{r.hit}</td><td>{r.type}</td><td className="font-mono">{r.mult.toFixed(3)}</td>
                  <td className="font-mono">{r.drInc.toFixed(4)}</td><td className="font-mono">{r.cumDR.toFixed(4)}</td>
                  <td className="font-mono">{r.dmg.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ─── Quick Score ──────────────────────────────────────────────
function QuickScoreCard() {
  const [totalDmg, setTotalDmg] = useState(0);
  const [damageCoeff, setDamageCoeff] = useState(0.01);
  const [diff, setDiff] = useState(40);
  const [turns, setTurns] = useState(2);
  const [hasShield, setHasShield] = useState(true);
  const [modifier, setModifier] = useState(1.35);
  const [thresholdOverride, setThresholdOverride] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const result = useMemo(() => {
    if (!totalDmg) return null;
    return calcScore(totalDmg, {
      difficulty: diff, turns, hasShield, damageCoeff, modifier,
      thresholdOverride,
    });
  }, [totalDmg, damageCoeff, diff, turns, hasShield, modifier, thresholdOverride]);

  return (
    <div className="card border-gold/20">
      <CollapseHeader title={<span>便捷打分计算（直接输入伤害）<ImageInfoTip src={saPic} alt="打分计算说明" /></span>} open={open} setOpen={setOpen} />
      {open && (<>
      <div className="flex gap-3 mb-3 items-end flex-wrap">
        <Field label="总伤" value={totalDmg} onChange={v => setTotalDmg(v)} />
        <Field label="伤害系数" value={damageCoeff} onChange={v => setDamageCoeff(v)} step={0.001} />
        <div>
          <div className="input-label">难度</div>
          <select className="input-field text-xs py-1.5" value={diff} onChange={e => setDiff(parseInt(e.target.value))}>
            {Object.keys(SCORE_TABLE).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <div className="input-label">回合</div>
          <select className="input-field text-xs py-1.5" value={turns} onChange={e => setTurns(parseInt(e.target.value))}>
            {Object.keys(TURN_COEFF).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <Field label="词条倍率" value={modifier} onChange={v => setModifier(v)} step={0.01} />
        <div>
          <div className="input-label">伤害阈值</div>
          <input className="input-field text-xs py-1.5" type="number"
            value={thresholdOverride ?? ''}
            onChange={e => setThresholdOverride(e.target.value ? parseFloat(e.target.value) : undefined)} />
        </div>
        <Toggle label="盾分" value={hasShield} onChange={setHasShield} />
      </div>
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-700/50">
          <StatBox label="基础分" value={fmt(result.baseScore)} />
          <StatBox label="伤害分" value={fmt(result.damageScore)} />
          <StatBox label="盾分" value={fmt(result.shieldScore)} />
          <StatBox label="回合系数" value={result.turnCoeff.toFixed(2)} />
          <StatBox label="总分" value={fmt(result.totalScore)} highlight />
        </div>
      )}
      </>)}
    </div>
  );
}

// ─── Incoming Damage (受击伤害计算) ──────────────────────────
function IncomingDamageCalc() {
  const [vit, setVit] = useState(400);
  const [spr, setSpr] = useState(400);
  const [biasType, setBiasType] = useState<'hp' | 'dp'>('hp');
  const [enemyBorder, setEnemyBorder] = useState(400);
  const [enemyPerc, setEnemyPerc] = useState(100);
  const [skillMin, setSkillMin] = useState(1000);
  const [skillMax, setSkillMax] = useState(2000);
  const [skillDiff, setSkillDiff] = useState(100);
  const [mark, setMark] = useState(false);
  const [necklace, setNecklace] = useState(false);
  const [passiveDef, setPassiveDef] = useState(0);
  const [open, setOpen] = useState(false);

  const result = useMemo(() => calcIncomingDamage({
    vit, spr, biasType, enemyBorder, enemyPerc: enemyPerc / 100, skillMin, skillMax, skillDiff, mark, necklace, passiveDef,
  }), [vit, spr, biasType, enemyBorder, enemyPerc, skillMin, skillMax, skillDiff, mark, necklace, passiveDef]);

  const x = result.biasValue;

  return (
    <div className="card">
      <CollapseHeader title={<span>受击伤害计算 <ImageInfoTip src={defensePic} alt="受击伤害说明" /></span>} open={open} setOpen={setOpen} />
      {open && (<>
        {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="体力" value={vit} onChange={setVit} />
        <Field label="精神" value={spr} onChange={setSpr} />
      </div>

      {/* Bias */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="input-label">偏向</div>
          <select className="input-field text-xs py-1.5" value={biasType}
            onChange={e => setBiasType(e.target.value as 'hp' | 'dp')}>
            <option value="hp">体偏 (体×2 + 精×1) / 3</option>
            <option value="dp">精偏 (体×1 + 精×2) / 3</option>
          </select>
        </div>
        <div className="flex items-end pb-1.5">
          <span className="text-xs text-text-muted">加权体精 = <span className="text-accent font-semibold">{x.toFixed(1)}</span></span>
        </div>
      </div>

      {/* Enemy params */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="敌方border" value={enemyBorder} onChange={setEnemyBorder} />
        <Field label="敌方伤害率%" value={enemyPerc} onChange={setEnemyPerc} step={0.1} />
      </div>

      {/* Skill params */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="技能最小强度" value={skillMin} onChange={setSkillMin} />
        <Field label="技能最大强度" value={skillMax} onChange={setSkillMax} />
        <Field label="技能差值" value={skillDiff} onChange={setSkillDiff} />
      </div>

      {/* Defense */}
      <div className="flex gap-4 items-end mb-4">
        <Toggle label="属性印记 (10%)" value={mark} onChange={setMark} />
        <Toggle label="加防项链 (10%)" value={necklace} onChange={setNecklace} />
        <div className="w-32"><Field label="其它加防%" value={passiveDef} onChange={setPassiveDef} /></div>
      </div>

      {/* Results */}
      <div className="pt-3 border-t divider">
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div className="text-xs text-text-muted">技能强度: <span className="text-accent font-mono">{result.skillPower.toFixed(2)}</span></div>
          <div className="text-xs text-text-muted">税前伤害: <span className="text-accent font-mono">{result.preTaxDmg.toFixed(2)}</span></div>
          <div className="text-xs text-text-muted">敌人白值: <span className="font-mono">{result.biasValue.toFixed(1)}</span></div>
          <div className="text-xs text-text-muted">加防乘区: <span className="font-mono">{result.defMultiplier.toFixed(4)}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="均伤" value={fmt(result.avgDmg)}highlight />
          <StatBox label="下限 (0.9×)" value={fmt(result.minDmg)} />
          <StatBox label="上限 (1.1×)" value={fmt(result.maxDmg)}  />
        </div>
      </div>
      </>)}
    </div>
  );
}

// ─── Encounter Score (遭遇战出分) ────────────────────────────
function EncounterCalc() {
  const [d1, setD1] = useState(80_000_000);
  const [d2, setD2] = useState(80_000_000);
  const [d3, setD3] = useState(40_000_000);
  const [d4, setD4] = useState(80_000_000);
  const [d5, setD5] = useState(80_000_000);
  const [difficulty, setDifficulty] = useState(40);
  const [turns, setTurns] = useState(5);
  const [difficultyScore, setDifficultyScore] = useState(65000);
  const [modifier, setModifier] = useState(1.3);
  const [open, setOpen] = useState(false);

  const result = useMemo(() => calcEncounterScore({
    damages: [d1, d2, d3, d4, d5],
    difficulty, turns, difficultyScore, modifier,
  }), [d1, d2, d3, d4, d5, difficulty, turns, difficultyScore, modifier]);

  return (
    <div className="card border-gold/20">
      <CollapseHeader title={<span>遭遇战出分计算 <span className="text-text-muted font-normal text-xs">(数据来源: 我的心情复杂 遭遇战出分计算)</span></span>} open={open} setOpen={setOpen} />
      {open && (<>
        <div className="text-xs text-text-muted mb-3">每阶段各自计算伤害分然后求和，回合分按难度和回合数衰减</div>

      {/* 5 round damages */}
      <div className="grid grid-cols-5 gap-3 mb-3">
        <Field label="1轮伤害" value={d1} onChange={v => setD1(v)} />
        <Field label="2轮伤害" value={d2} onChange={v => setD2(v)} />
        <Field label="3轮伤害" value={d3} onChange={v => setD3(v)} />
        <Field label="4轮伤害" value={d4} onChange={v => setD4(v)} />
        <Field label="5轮伤害" value={d5} onChange={v => setD5(v)} />
      </div>

      {/* Per-round scores */}
      <div className="grid grid-cols-5 gap-3 mb-3">
        {result.roundScores.map((s, i) => (
          <StatBox key={i} label={`${i + 1}轮伤害分`} value={s.toLocaleString('zh-CN')} />
        ))}
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <div className="input-label">难度</div>
          <select className="input-field text-xs py-1.5" value={difficulty}
            onChange={e => setDifficulty(parseInt(e.target.value))}>
            {Object.keys(SCORE_TABLE).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <div className="input-label">回合</div>
          <select className="input-field text-xs py-1.5" value={turns}
            onChange={e => setTurns(parseInt(e.target.value))}>
            {Object.keys(TURN_COEFF).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <Field label="难度分" value={difficultyScore} onChange={v => setDifficultyScore(v)} />
        <Field label="词条" value={modifier} onChange={v => setModifier(v)} step={0.01} />
      </div>

      {/* Summary */}
      <div className="pt-3 border-t divider">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatBox label="总伤害分" value={result.totalDamageScore.toLocaleString('zh-CN')} />
          <StatBox label="回合分" value={result.roundScore.toLocaleString('zh-CN')} />
          <StatBox label="难度分" value={result.difficultyScore.toLocaleString('zh-CN')} />
          <StatBox label="词条" value={result.modifier.toFixed(2)} />
          <StatBox label="出分" value={result.finalScore.toLocaleString('zh-CN')} highlight />
        </div>
      </div>
      </>)}
    </div>
  );
}

// ─── Shared Helpers ───────────────────────────────────────────
function Field({ label, value, onChange, step }: { label: React.ReactNode; value: number; onChange: (v: number) => void; step?: number; }) {
  const [text, setText] = useState(String(value));
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // sync from parent only when value changes externally
  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      setText(String(value));
      prevValue.current = value;
    }
  }, [value]);

  const flush = (raw: string) => {
    if (raw === '' || raw === '-') { onChange(0); setText('0'); return; }
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) { onChange(v); setText(String(v)); }
  };

  return (
    <div>
      <div className="input-label truncate">{label}</div>
      <input className="input-field text-xs py-1.5" type="text" inputMode="decimal" step={step}
        value={text}
        onChange={e => {
          const raw = e.target.value;
          setText(raw);
          clearTimeout(syncTimer.current);
          // auto-flush after 800ms idle
          syncTimer.current = setTimeout(() => flush(raw), 800);
        }}
        onBlur={e => flush(e.target.value)} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <div className="input-label">&nbsp;</div>
      <div className="flex items-center gap-1.5 cursor-pointer select-none" style={{ height: 36 }} onClick={() => onChange(!value)}>
        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${value ? 'bg-accent border-accent' : 'toggle-off'}`}>
          {value && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
    </div>
  );
}

function OdRiseTip() {
  return (
    <span className="relative inline-flex align-middle ml-0.5 group">
      <span className="text-text-muted group-hover:text-text-secondary text-[10px]"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--app-checkbox-border)', fontWeight: 700, cursor: 'help' }}>?</span>
      <div className="absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-card border border-white/10 rounded-lg p-2 shadow-xl whitespace-pre-line text-[10px] hidden group-hover:block" style={{ minWidth: 180, color: 'var(--app-text-secondary)' }}>
        如打分词条的OD上升量12%, 或baboo20%
      </div>
    </span>
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
