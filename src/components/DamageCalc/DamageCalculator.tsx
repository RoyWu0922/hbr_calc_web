import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  SkillInput, Stats, BuffSkill, DebuffSkill, WeaknessSkill,
  Equipment, BonusArea, BonusEntry, ODParams, BreakParams, ScoreParams, DamageInput, DamageResultData, CalcHistoryEntry,
} from '../../types';
import { calculateAll, calcPassiveAtkSum, calcPassiveDefSum, calcBuffPower, calcBuffPowerDetail, calcDebuffPower, calcDebuffPowerDetail } from '../../engine/damage';
import { BUFF_SKILLS, DEBUFF_SKILLS, WEAKNESS_SKILLS, SCORE_TABLE, TURN_COEFF } from '../../engine/skillDb';
import { getCustomSkills, getDeletedBuiltins, getBuiltinOverrides } from '../../engine/customSkills';
import { saveToHistory, updateHistoryEntry } from '../../utils/storage';
import { saveUserDefaults, loadUserDefaults, clearUserDefaults, UserDefaults } from '../../engine/userDefaults';
import { encodeShareData, decodeShareData } from '../../utils/shareUrl';
import DamageResult from './DamageResult';
import ImageInfoTip from '../ImageInfoTip';
import FloatingBiasCalc from '../FloatingBiasCalc';
import saPic from '/SA_pic.png';

const defaultSkill: SkillInput = {
  sp: 0, skillLevel: 0, deviation: 1, token: 1,
  special: 1, orb: 0, maxPower: 0, baseDiff: 0, whiteBonus: 0,
  currentWeighted: 0, enemyAttr: 0, isCrit: true,
  weaponWeak: 0, elementWeak: 0, hitCount: 0,
};

const defaultStats: Stats = { str: 0, spr: 0, int: 0, luk: 0 };

function emptyBuff(): BuffSkill { return { name: '', maxPower: 0, border: 0, orb: 0, currentAttr: 0, moraleFighting: 0, skillLevel: 0, passive: 0, layers: 0 }; }
function emptyDebuff(): DebuffSkill { return { name: '', maxPower: 0, minPower: 0, border: 0, orb: 0, currentAttr: 0, moraleDebuffs: 0, skillLevel: 0, passive: 0, layers: 0 }; }
function emptyWeakness(): WeaknessSkill { return { name: '', maxPower: 0, minPower: 0, border: 0, orb: 0, currentAttr: 0, moraleDebuffs: 0, skillLevel: 0, passive: 0, layers: 0 }; }
function emptyBonusEntry(): BonusEntry { return { name: '', value: 0 }; }

const defaultEquipment: Equipment = { ring: false, hpEarring: false, silverNecklace: false };
const defaultBonus: BonusArea = { passiveAtkEntries: [], passiveDefEntries: [], critDmgBase: 0, critDmgBonus: 0, critDmgExtraEntries: [{ name: '基础暴击', value: 100 }, { name: '暴击', value: 50 }] };
const defaultOD: ODParams = { origHit: 0, addHit: 0, fixedOD: 0, earringCoeff: 0 };
const defaultBreak: BreakParams = { skillDR: 0, enemyDR: 0, origHits: 0, earring: 0, necklace: 0, otherDR: 0, superChain: 0, bigChain: 0, midChain: 0, smallChain: 0, maxDR: undefined, initDR: undefined, dists: [] };
const defaultScore: ScoreParams = { difficulty: 40, turns: 2, hasShield: true, damageCoeff: 0.01, modifier: 1.35 };

function buildLookup(builtins: any[], category: 'buff' | 'debuff' | 'weakness') {
  const deleted = getDeletedBuiltins(category); const overrides = getBuiltinOverrides(category);
  return [...builtins.filter(s => !deleted.has(s.name)).map(s => {
    const ov = overrides[s.name];
    if (ov && !ov.deleted) return { ...s, max: ov.max ?? s.max, min: ov.min ?? s.min, border: ov.border ?? s.border };
    return s;
  }), ...getCustomSkills(category)];
}

interface Props { initialData: CalcHistoryEntry | null; }

function loadInitialState() {
  const saved = loadUserDefaults();
  if (!saved) return null;
  return saved;
}

export default function DamageCalculator({ initialData }: Props) {
  const init = !initialData ? loadInitialState() : null;
  const [skill, setSkill] = useState<SkillInput>(init?.skill ? { ...defaultSkill, ...init.skill } : defaultSkill);
  const [stats] = useState<Stats>(defaultStats);
  const [buffs, setBuffs] = useState<BuffSkill[]>([]);
  const [debuffs, setDebuffs] = useState<DebuffSkill[]>([]);
  const [weaknesses, setWeaknesses] = useState<WeaknessSkill[]>([]);
  const [equipment, setEquipment] = useState<Equipment>(init?.equipment ? { ...defaultEquipment, ...init.equipment } : defaultEquipment);
  const [bonus, setBonus] = useState<BonusArea>(init?.bonus ? { ...defaultBonus, ...init.bonus } : defaultBonus);
  const [od, setOd] = useState<ODParams>(init?.od ? { ...defaultOD, ...init.od } : defaultOD);
  const [breakParams, setBreakParams] = useState<BreakParams>(init?.break_ ? { ...defaultBreak, ...init.break_ } : defaultBreak);
  const [score, setScore] = useState<ScoreParams>(init?.score ? { ...defaultScore, ...init.score } : defaultScore);
  const [result, setResult] = useState<DamageResultData | null>(null);
  const [calcLabel, setCalcLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [chainMul, setChainMul] = useState(init?.chainMul ?? 1);
  // breakMul stored as % (e.g. 300 = 300%). Old decimal values (< 50) auto-migrate.
  const [breakMul, setBreakMul] = useState(() => {
    const raw = init?.breakMul ?? 100;
    return raw < 50 ? raw * 100 : raw;
  });
  const [odMul, setOdMul] = useState(init?.odMul ?? 1);
  const [floatVal, setFloatVal] = useState(init?.floatVal ?? 1);
  const [bonusDmg, setBonusDmg] = useState(init?.bonusDmg ?? 0);
  const [superChainHits, setSuperChainHits] = useState(init?.superChainHits ?? 0);
  const [bigChainHits, setBigChainHits] = useState(init?.bigChainHits ?? 0);
  const [midChainHits, setMidChainHits] = useState(init?.midChainHits ?? 0);
  const [smallChainHits, setSmallChainHits] = useState(init?.smallChainHits ?? 0);
  const [bodyWeightStr, setBodyWeightStr] = useState(init?.bodyWeightStr ?? '');
  const [loadedEntryId, setLoadedEntryId] = useState<number | null>(null);

  useEffect(() => {
    if (initialData) {
      const d = initialData.input;
      setSkill(d.skill); setBuffs(d.buffs); setDebuffs(d.debuffs); setWeaknesses(d.weaknesses);
      setEquipment(d.equipment); setBonus(d.bonus); setScore(d.score);
      setSuperChainHits(d.superChainHits ?? 0); setBigChainHits(d.bigChainHits ?? 0);
      setMidChainHits(d.midChainHits ?? 0); setSmallChainHits(d.smallChainHits ?? 0);
      setBodyWeightStr(d.bodyWeightStr ?? '');
      setResult(initialData.result); setCalcLabel(initialData.label);
      setLoadedEntryId(initialData.id ?? null);
    }
  }, [initialData]);

  const runCalc = useCallback(() => {
    const r = calculateAll({ skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, break_: breakParams, score, chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg });
    setResult(r);
  }, [skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, breakParams, score, chainMul, breakMul, odMul, floatVal, bonusDmg]);

  useEffect(() => { runCalc(); }, [runCalc]);

  const handleSave = async () => {
    if (!result) return; setSaving(true);
    const label = calcLabel.trim() || new Date().toLocaleString('zh-CN');
    const input = { skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, break_: breakParams, score, chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg, superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr };
    try {
      if (loadedEntryId) {
        // 从历史加载后修改 → 提供更新/另存选项
        const action = confirm('检测到从历史记录加载的数据。\n点击"确定"更新原记录，点击"取消"另存为新记录。');
        if (action) {
          await updateHistoryEntry(loadedEntryId, label, input, result);
          alert('已更新原历史记录');
        } else {
          await saveToHistory(label, input, result);
          alert('已另存为新历史记录');
        }
      } else {
        await saveToHistory(label, input, result);
        alert('已保存到历史记录');
      }
    } catch (e) {
      console.error('保存失败', e);
      alert('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    } setSaving(false);
  };

  const handleShare = async () => {
    const input = { skill, stats, buffs, debuffs, weaknesses, equipment, bonus, od, break_: breakParams, score, chainMul, breakMul: breakMul / 100, odMul, floatVal, bonusDmg, superChainHits, bigChainHits, midChainHits, smallChainHits, bodyWeightStr };
    const code = encodeShareData(input);
    try {
      await navigator.clipboard.writeText(code);
      alert('分享码已复制到剪贴板！');
    } catch {
      prompt('复制以下分享码:', code);
    }
  };

  const handleImport = () => {
    const code = prompt('粘贴分享码:');
    if (!code || !code.trim()) return;
    const decoded = decodeShareData(code.trim());
    if (!decoded) { alert('无效的分享码'); return; }
    setSkill(decoded.skill);
    setBuffs(decoded.buffs);
    setDebuffs(decoded.debuffs);
    setWeaknesses(decoded.weaknesses);
    setEquipment(decoded.equipment);
    setBonus(decoded.bonus);
    setOd(decoded.od);
    setBreakParams(decoded.break_);
    setScore(decoded.score);
    setChainMul(decoded.chainMul);
    setBreakMul(decoded.breakMul < 50 ? decoded.breakMul * 100 : decoded.breakMul);
    setOdMul(decoded.odMul);
    setFloatVal(decoded.floatVal);
    setBonusDmg(decoded.bonusDmg ?? 0);
    setCalcLabel('导入');
  };

  const handleSaveDefaults = () => {
    const defaults: UserDefaults = {
      skill,
      equipment,
      bonus,
      od,
      break_: breakParams,
      score,
      chainMul,
      breakMul,
      odMul,
      floatVal,
      bonusDmg,
      superChainHits,
      bigChainHits,
      midChainHits,
      smallChainHits,
      bodyWeightStr,
    };
    saveUserDefaults(defaults);
    alert('当前数值已保存为默认值，刷新页面后生效');
  };

  const handleClearDefaults = () => {
    if (!confirm('确定要清除自定义默认值吗？将恢复为程序原始默认值。')) return;
    clearUserDefaults();
    setSkill(defaultSkill);
    setEquipment(defaultEquipment);
    setBonus(defaultBonus);
    setScore(defaultScore);
    setOd(defaultOD);
    setBreakParams(defaultBreak);
    setChainMul(1);
    setBreakMul(100);
    setOdMul(1);
    setFloatVal(1);
    setBonusDmg(0);
    setSuperChainHits(0); setBigChainHits(0); setMidChainHits(0); setSmallChainHits(0);
    setBodyWeightStr('');
    alert('已清除自定义默认值');
  };

  const updateSkill = (k: keyof SkillInput, v: unknown) => setSkill(s => ({ ...s, [k]: v }));
  const updateScore = (k: keyof ScoreParams, v: unknown) => setScore(s => ({ ...s, [k]: v }));

  const atkSum = calcPassiveAtkSum(bonus);
  const defSum = calcPassiveDefSum(bonus);
  const critSum = bonus.critDmgExtraEntries.reduce((s, e) => s + e.value, 0);
  const earringBonus = equipment.hpEarring ? (skill.hitCount >= 10 ? 5 : Math.max(5, 15 - skill.hitCount * 10 / 9 + 10 / 9)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">伤害计算器</h2>
        <div className="flex gap-2 items-center">
          <input className="input-field w-40" placeholder="计算标签（可选）" value={calcLabel} onChange={e => setCalcLabel(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={() => {
            setSkill(defaultSkill); setBuffs([]); setDebuffs([]); setWeaknesses([]);
            setEquipment(defaultEquipment); setBonus(defaultBonus);
            setOd(defaultOD); setBreakParams(defaultBreak);
            setChainMul(1); setBreakMul(100); setOdMul(1); setFloatVal(1); setBonusDmg(0);
            setScore(defaultScore); setCalcLabel(''); setResult(null);
          }} title="重置" style={{ padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0111.4-2.8M14 8a6 6 0 01-11.4 2.8M2 2v3h3M14 14v-3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saving || !result}
            title="保存到历史" style={{ padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13V2.5z" stroke="currentColor" strokeWidth="1.2"/><path d="M10 2.5V5a.5.5 0 00.5.5H13" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 8.5h5M5.5 11h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleShare} title="导出分享码"
            style={{ padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/><circle cx="5" cy="11.5" r="1.8" stroke="currentColor" strokeWidth="1.1"/><circle cx="11" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.1"/><line x1="6.7" y1="5.5" x2="9.3" y2="7.2" stroke="currentColor" strokeWidth="1.1"/><line x1="6.7" y1="10.5" x2="9.3" y2="8.8" stroke="currentColor" strokeWidth="1.1"/></svg>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleImport} title="导入分享码"
            style={{ padding: '6px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 9.5v3a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-3M5 6l3 3 3-3M8 9V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
        <div className="flex gap-1.5 items-center ml-auto">
          <button className="btn btn-primary btn-xs" onClick={handleSaveDefaults} title="将当前所有输入的数值保存为默认值，下次打开页面自动填入">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="mr-0.5"><path d="M10.5 1.5H3a.5.5 0 00-.5.5v10a.5.5 0 00.5.5h8a.5.5 0 00.5-.5V4l-2.5-2.5z" stroke="currentColor" strokeWidth="1.2"/><path d="M9.5 1.5V4a.5.5 0 00.5.5h2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 9.5V7l2 2.5L9 7v2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            保存为默认值
          </button>
          <button className="btn btn-danger btn-xs" onClick={handleClearDefaults} title="清除自定义默认值，恢复程序原始默认">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="mr-0.5"><path d="M1 2h8M3 2V1.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V2M3.5 4v3M6.5 4v3M1.5 2l.5 6.5h6l.5-6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            清除默认值
          </button>
        </div>
      </div>

      <CollapsibleSection title="敌方属性" defaultOpen>
        <div className="grid grid-cols-3 gap-3">
          <Field label="敌方属性" value={skill.enemyAttr} onChange={v => updateSkill('enemyAttr', v)} />
          <Field label="武器弱点" value={skill.weaponWeak} onChange={v => updateSkill('weaponWeak', v)} step={0.1} />
          <Field label="属性弱点" value={skill.elementWeak} onChange={v => updateSkill('elementWeak', v)} step={0.1} />
        </div>
      </CollapsibleSection>

      <SkillParamsSection skill={skill} updateSkill={updateSkill} result={result} />

      <CollapsibleSection title={<span>主动加攻区 <InfoTip id="buff" /></span>} defaultOpen>
        <SkillListCard skills={buffs} lookup={buildLookup(BUFF_SKILLS, 'buff')}
          onUpdate={(i, s) => { const n = [...buffs]; n[i] = s as BuffSkill; setBuffs(n); }}
          onAdd={() => setBuffs([...buffs, emptyBuff()])}
          onRemove={i => setBuffs(buffs.filter((_, j) => j !== i))} type="buff" enemyAttr={skill.enemyAttr} />
      </CollapsibleSection>

      <CollapsibleSection title={<span>主动减防区 <InfoTip id="debuff" /></span>} defaultOpen>
        <SkillListCard skills={debuffs} lookup={buildLookup(DEBUFF_SKILLS, 'debuff')}
          onUpdate={(i, s) => { const n = [...debuffs]; n[i] = s as DebuffSkill; setDebuffs(n); }}
          onAdd={() => setDebuffs([...debuffs, emptyDebuff()])}
          onRemove={i => setDebuffs(debuffs.filter((_, j) => j !== i))} type="debuff" enemyAttr={skill.enemyAttr} />
      </CollapsibleSection>

      <CollapsibleSection title={<span>弱点加深区 <InfoTip id="weakness" /></span>} defaultOpen>
        <SkillListCard skills={weaknesses} lookup={buildLookup(WEAKNESS_SKILLS, 'weakness')}
          onUpdate={(i, s) => { const n = [...weaknesses]; n[i] = s as WeaknessSkill; setWeaknesses(n); }}
          onAdd={() => setWeaknesses([...weaknesses, emptyWeakness()])}
          onRemove={i => setWeaknesses(weaknesses.filter((_, j) => j !== i))} type="weakness" enemyAttr={skill.enemyAttr} />
      </CollapsibleSection>

      <CollapsibleSection title="被动加攻/减防 & 装备" defaultOpen>
        <BonusSection bonus={bonus} setBonus={setBonus} equipment={equipment} setEquipment={setEquipment}
          skill={skill} updateSkill={updateSkill} atkSum={atkSum} defSum={defSum} critSum={critSum} earringBonus={earringBonus} />
      </CollapsibleSection>

      <CollapsibleSection title="其它乘区" defaultOpen>
        <div className="grid grid-cols-4 gap-3">
          <Field label="连击 (例: 3特大=(1+3*0.5)=2.5)" value={chainMul} onChange={setChainMul} step={0.01} />
          <Field label="破坏率%" value={breakMul} onChange={setBreakMul} step={1} />
          <div>
            <div className="input-label">OD</div>
            <select className="input-field" value={odMul} onChange={e => setOdMul(parseFloat(e.target.value))}>
              <option value={1}>无</option>
              <option value={1.1}>1OD (1.1x)</option>
              <option value={1.2}>2OD (1.2x)</option>
              <option value={1.3}>3OD (1.3x)</option>
            </select>
          </div>
          <Field label="浮动(0.9~1.1)" value={floatVal} onChange={setFloatVal} step={0.01} />
        </div>
      </CollapsibleSection>

      {/* Result header row - moved above score */}
      {result && (
        <ResultHeaderRow result={result} />
      )}

      <CollapsibleSection title={<span>打分计算 <ImageInfoTip src={saPic} alt="打分计算说明" /></span>} defaultOpen>
        <ScoreSection score={score} updateScore={updateScore} bonusDmg={bonusDmg} setBonusDmg={setBonusDmg} />
      </CollapsibleSection>

      {result && (
        <DamageResult result={result} skill={skill} floatVal={floatVal}
          superChainHits={superChainHits} setSuperChainHits={setSuperChainHits}
          bigChainHits={bigChainHits} setBigChainHits={setBigChainHits}
          midChainHits={midChainHits} setMidChainHits={setMidChainHits}
          smallChainHits={smallChainHits} setSmallChainHits={setSmallChainHits}
          bodyWeightStr={bodyWeightStr} setBodyWeightStr={setBodyWeightStr} />
      )}
      <FloatingBiasCalc />
    </div>
  );
}

// ─── Result Header Row ─────────────────────────────────────
function ResultHeaderRow({ result }: { result: DamageResultData }) {
  return (
    <div className="card border-accent/30">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-3 flex-wrap text-xs text-text-muted flex-1">
          <div>技能倍率 <span className="text-text-primary font-mono">{result.multiplier.toFixed(2)}</span></div>
          <div className="text-white/20">|</div>
          <div>加攻区 <span className="text-text-primary font-mono">{result.atkFactor.toFixed(3)}</span></div>
          <div className="text-white/20">|</div>
          <div>减防区 <span className="text-text-primary font-mono">{result.defFactor.toFixed(3)}</span></div>
          <div className="text-white/20">|</div>
          <div>弱点区 <span className="text-text-primary font-mono">{result.weaknessFactor.toFixed(3)}</span></div>
          <div className="text-white/20">|</div>
          <div>爆伤区 <span className="text-text-primary font-mono">{result.critFactor.toFixed(1)}</span></div>
        </div>
        <div className="text-right flex-shrink-0 relative">
          <div className="text-xs text-text-muted">最终伤害</div>
          <div className="text-3xl font-bold text-gold">{Math.round(result.postAttenuation).toLocaleString('zh-CN')}</div>
          {result.attenuationApplied && (
            <div className="text-[10px] text-danger absolute -bottom-3 right-0 whitespace-nowrap">
              衰减前: {Math.round(result.preAttenuation).toLocaleString('zh-CN')}
            </div>
          )}
          {result.attenuationApplied && <div className="pb-3" />}
        </div>
      </div>
    </div>
  );
}

import CollapsibleSection from '../CollapsibleSection';

// ─── Skill Parameters ───────────────────────────────────────
function SkillParamsSection({ skill, updateSkill, result }: {
  skill: SkillInput; updateSkill: (k: keyof SkillInput, v: unknown) => void; result: DamageResultData | null;
}) {
  const [showDetail, setShowDetail] = useState(false);
  return (
    <CollapsibleSection title="技能参数" defaultOpen>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="初始加权" value={skill.currentWeighted} onChange={v => updateSkill('currentWeighted', v)} />
        <Field label="白值加成(包括士气, 灾厄等)（有-100的话请在这+50）" value={skill.whiteBonus} onChange={v => updateSkill('whiteBonus', v)} />
      </div>
      <div className="grid grid-cols-5 gap-3 mb-3">
        <Field label="最大威力" value={skill.maxPower} onChange={v => updateSkill('maxPower', v)} />
        <Field label="技能等级" value={skill.skillLevel} onChange={v => updateSkill('skillLevel', v)} />
        <Field label="基础差值" value={skill.baseDiff} onChange={v => updateSkill('baseDiff', v)} />
        <Field label="Hit数" value={skill.hitCount} onChange={v => updateSkill('hitCount', v)} />
        <Toggle label="暴击" value={skill.isCrit} onChange={v => updateSkill('isCrit', v)} />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Field label="宝珠" value={skill.orb} onChange={v => updateSkill('orb', v)} />
        <Field label="偏向(例: 月哥王ub打hp=2)" value={skill.deviation} onChange={v => updateSkill('deviation', v)} step={0.1} />
        <Field label="Token" value={skill.token} onChange={v => updateSkill('token', v)} step={0.1} />
        <Field label="特殊（例: 冰奏1.25, 雷吹雪1.75）" value={skill.special} onChange={v => updateSkill('special', v)} step={0.01} />
      </div>
      {result && (
        <div className="pt-3 border-t divider">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">最终倍率: <span className="text-gold text-lg">{result.multiplier.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</span></span>
            <button className="btn btn-secondary btn-xs" onClick={() => setShowDetail(!showDetail)}>{showDetail ? '收起 ▲' : '展开 ▼'}</button>
          </div>
          {showDetail && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <DetailItem label="最小倍率" value={result.minPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
              <DetailItem label="最大倍率" value={result.maxPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
              <DetailItem label="当前倍率" value={result.currentPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
              <DetailItem label="宝珠倍率" value={result.orbPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
              <DetailItem label="超差值倍率" value={result.overDiffPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
              <DetailItem label="最终倍率" value={result.multiplier.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} highlight />
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─── Skill List Card ────────────────────────────────────────
function SkillListCard({ skills, lookup, onUpdate, onAdd, onRemove, type, enemyAttr }: {
  skills: any[]; lookup: any[]; onUpdate: (i: number, s: any) => void;
  onAdd: () => void; onRemove: (i: number) => void; type: 'buff' | 'debuff' | 'weakness';
  enemyAttr: number;
}) {
  const isBuff = type === 'buff';

  // 引用 engine 函数：总面板用汇总函数，单条用详细版（拆解 base/orb/overDiff）
  const calcPower = (sk: any) => {
    if (!sk.name || !sk.maxPower) return 0;
    return isBuff ? calcBuffPower(sk) : calcDebuffPower(sk, enemyAttr);
  };
  const calcDetail = (sk: any) => {
    if (!sk.name || !sk.maxPower) return null;
    return isBuff ? calcBuffPowerDetail(sk) : calcDebuffPowerDetail(sk, enemyAttr);
  };

  // Section total
  const sectionTotal = skills.reduce((sum, sk) => sum + calcPower(sk), 0);

  //change default
  return (
    <div>
      <div className="space-y-2">
        {skills.map((skill, i) => {
          const hasSkill = skill.name && skill.maxPower > 0;
          const detail = hasSkill ? calcDetail(skill) : null;
          const finalPower = detail ? detail.finalPower : 0;
          const showMin = !isBuff && (skill.minPower !== undefined);
          return (
            <div key={i} className="glass-row p-2.5">
              <div className="flex items-end gap-2">
                <select className="input-field text-xs py-1.5" style={{ width: 140, flexShrink: 0 }} value={skill.name}
                  onChange={e => {
                    const found = lookup.find(s => s.name === e.target.value);
                    if (found) {
                      const u: any = { ...skill, name: found.name, maxPower: found.max, border: found.border, passive: 1, layers: 1, skillLevel: 1 };
                      if (!isBuff) u.minPower = found.min; onUpdate(i, u);
                    } else onUpdate(i, { ...skill, name: e.target.value });
                  }}>
                  <option value="">— 技能 —</option>
                  {lookup.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
                 <Num label="初始属性" value={skill.currentAttr || 0}
                  onChange={v => { const u: any = { ...skill, currentAttr: v }; onUpdate(i, u); }} />
                <Num label={isBuff ? '白值加成' : '白值加成(包括士气, 灾厄等)'} value={isBuff ? skill.moraleFighting : skill.moraleDebuffs}
                  onChange={v => { const u: any = { ...skill }; if (isBuff) u.moraleFighting = v; else u.moraleDebuffs = v; onUpdate(i, u); }} />
                <Num label="宝珠" value={skill.orb || 0}
                  onChange={v => { const u: any = { ...skill, orb: v }; onUpdate(i, u); }} />
                <Num label="等级" value={skill.skillLevel || 1}
                  onChange={v => { const u: any = { ...skill, skillLevel: v }; onUpdate(i, u); }} />
                <Num label="被动" value={skill.passive || 1} step={0.01}
                  onChange={v => { const u: any = { ...skill, passive: v }; onUpdate(i, u); }} />
                <div className="w-12 flex-shrink-0">
                  <div className="text-[10px] text-text-muted mb-0.5 leading-tight">层数</div>
                  <select className="input-field text-xs py-1.5" value={skill.layers || 1}
                    onChange={e => { const u: any = { ...skill, layers: parseInt(e.target.value) }; onUpdate(i, u); }}>
                    <option value={1}>1</option><option value={2}>2</option>
                  </select>
                </div>
                {/* Result in proper cell */}
                <div className="flex-shrink-0" style={{ minWidth: 70 }}>
                  <div className="text-[10px] text-text-muted mb-0.5 leading-tight">结果</div>
                  <div className="flex items-center gap-0.5">
                    <span className={`text-xs font-semibold whitespace-nowrap tag ${finalPower > 0 ? 'text-accent' : 'text-text-muted'}`}>
                      {finalPower > 0 ? finalPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—'}
                    </span>
                    {detail && <PopoverDetail type={type} detail={detail} />}
                  </div>
                </div>
                <IconBtn color="danger" title="删除" onClick={() => onRemove(i)}>
                  <path d="M2 3.5h8M4.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 5.5v3M7 5.5v3M3 3.5l.5 6.5h5l.5-6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </IconBtn>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-2">
        <button className="btn btn-secondary btn-sm" onClick={onAdd}>+ 添加技能</button>
        <span className="text-xs text-text-muted">总和: <span className="text-accent font-semibold">{sectionTotal.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}</span></span>
      </div>
    </div>
  );
}

function PopoverDetail({ type, detail }: { type: string; detail: { basePower: number; orbPower: number; overDiffPower: number; finalPower: number } }) {
  const [show, setShow] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isDebuff = type !== 'buff';
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const toggle = () => {
    if (!show && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right });
    }
    setShow(!show);
  };

  return (
    <div className="relative flex-shrink-0">
      <button ref={btnRef} className="text-[10px] text-text-muted hover:text-text-secondary leading-none px-0.5" onClick={toggle}>
        {show ? '▲' : '▼'}
      </button>
      {show && createPortal(
        <div className="fixed bg-bg-card border border-white/10 rounded-lg p-2 shadow-xl" style={{ zIndex: 99999, top: pos.top, left: pos.left, minWidth: 180, transform: 'translateX(-100%)' }}>
          <div className="grid gap-1 text-[10px]">
            {isDebuff && <PopItem label="基础倍率" value={detail.basePower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />}
            <PopItem label="宝珠倍率" value={detail.orbPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
            <PopItem label="超差倍率" value={detail.overDiffPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} />
            <PopItem label="最终倍率" value={detail.finalPower.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} highlight />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function PopItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${highlight ? 'text-gold' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Bonus Section ──────────────────────────────────────────
function BonusSection({ bonus, setBonus, equipment, setEquipment, skill, updateSkill, atkSum, defSum, critSum, earringBonus }: {
  bonus: BonusArea; setBonus: (b: BonusArea) => void;
  equipment: Equipment; setEquipment: (e: Equipment) => void;
  skill: SkillInput; updateSkill: (k: keyof SkillInput, v: unknown) => void;
  atkSum: number; defSum: number; critSum: number; earringBonus: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <PassiveBlock title={<span>被动加攻区% <InfoTip id="passiveAtk" /></span>} entries={bonus.passiveAtkEntries} total={atkSum} totalClass="text-heal"
        onUpdate={e => setBonus({ ...bonus, passiveAtkEntries: e })} placeholder="加攻被动名" />
      <PassiveBlock title="被动减防区%" entries={bonus.passiveDefEntries} total={defSum} totalClass="text-accent"
        onUpdate={e => setBonus({ ...bonus, passiveDefEntries: e })} placeholder="减防被动名" />
      <PassiveBlock title="爆伤区%" entries={bonus.critDmgExtraEntries} total={critSum} totalClass="text-gold"
        onUpdate={e => setBonus({ ...bonus, critDmgExtraEntries: e })} placeholder="爆伤项名" />
      <div className="stat-box-left">
        <div className="card-header text-xs mb-2">装备区</div>
        <div className="space-y-2">
          <Toggle label="HP/DP耳环" value={equipment.hpEarring} onChange={v => setEquipment({ ...equipment, hpEarring: v })} />
          <div className="text-xs text-text-muted pl-7">耳环加攻: <span className="text-gold font-semibold">{earringBonus.toFixed(2)}</span></div>
          <Toggle label="恒星战项链" value={equipment.silverNecklace} onChange={v => setEquipment({ ...equipment, silverNecklace: v })} />
          
        </div>
      </div>
    </div>
  );
}

function PassiveBlock({ title, entries, total, totalClass, onUpdate, placeholder }: {
  title: React.ReactNode; entries: BonusEntry[]; total: number; totalClass: string;
  onUpdate: (e: BonusEntry[]) => void; placeholder: string;
}) {
  return (
    <div className="stat-box">
      <div className="card-header text-xs mb-2">{title}</div>
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-1.5 items-center mb-1.5">
          <input className="input-field text-xs py-1.5 flex-1" type="text" value={entry.name}
            placeholder={placeholder} spellCheck={false}
            onChange={e => { const n = [...entries]; n[i] = { name: e.target.value, value: n[i].value }; onUpdate(n); }} />
          <input className="input-field text-xs py-1.5" style={{ width: 52 }} type="text" inputMode="decimal"
            value={entry.value === 0 ? '' : String(entry.value)}
            placeholder="数值"
            onChange={e => {
              const raw = e.target.value;
              const n = [...entries];
              if (raw === '' || raw === '-') { n[i] = { ...n[i], value: 0 }; onUpdate(n); return; }
              const parsed = parseFloat(raw);
              if (!isNaN(parsed)) { n[i] = { ...n[i], value: parsed }; onUpdate(n); }
            }} />
          <IconBtn color="danger" title="删除" onClick={() => onUpdate(entries.filter((_, j) => j !== i))}>
            <path d="M2 3.5h8M4.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 5.5v3M7 5.5v3M3 3.5l.5 6.5h5l.5-6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </IconBtn>
        </div>
      ))}
      <div className="flex justify-between items-center mt-2">
        <button className="btn btn-secondary btn-xs" onClick={() => onUpdate([...entries, emptyBonusEntry()])}>+</button>
        <span className="text-[10px] text-text-muted">总和: <span className={`font-semibold ${totalClass}`}>{total.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}</span></span>
      </div>
    </div>
  );
}

// ─── Score Section ──────────────────────────────────────────
function ScoreSection({ score, updateScore, bonusDmg, setBonusDmg }: {
  score: ScoreParams; updateScore: (k: keyof ScoreParams, v: unknown) => void;
  bonusDmg: number; setBonusDmg: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-3 items-end">
      <div>
        <div className="input-label">难度</div>
        <select className="input-field text-xs py-1.5" value={score.difficulty} onChange={e => updateScore('difficulty', parseInt(e.target.value))}>
          {Object.keys(SCORE_TABLE).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <div className="input-label">回合</div>
        <select className="input-field text-xs py-1.5" value={score.turns} onChange={e => updateScore('turns', parseInt(e.target.value))}>
          {Object.keys(TURN_COEFF).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <div className="input-label">伤害系数</div>
        <input className="input-field text-xs py-1.5" type="number" step={0.001} value={score.damageCoeff}
          onChange={e => updateScore('damageCoeff', parseFloat(e.target.value) || 0)} />
      </div>
      <div>
        <div className="input-label">词条倍率</div>
        <input className="input-field text-xs py-1.5" type="number" step={0.01} value={score.modifier}
          onChange={e => updateScore('modifier', parseFloat(e.target.value) || 0)} />
      </div>
      <div>
        <div className="input-label">伤害阈值</div>
        <input className="input-field text-xs py-1.5" type="number"  value={score.thresholdOverride || ''}
          onChange={e => updateScore('thresholdOverride', e.target.value ? parseFloat(e.target.value) : undefined)} />
      </div>
      <div>
        <div className="input-label">垫刀</div>
        <input className="input-field text-xs py-1.5" type="number" value={bonusDmg || ''}
          onChange={e => { const v = e.target.value; setBonusDmg(v === '' ? 0 : parseFloat(v) || 0); }} />
      </div>
      <Toggle label="盾分" value={score.hasShield} onChange={v => updateScore('hasShield', v)} />
    </div>
  );
}

// ─── Icon Button ────────────────────────────────────────────
function IconBtn({ color, title, onClick, children }: { color: 'danger' | 'secondary'; title: string; onClick: () => void; children: React.ReactNode }) {
  const cls = color === 'danger'
    ? 'btn btn-xs'
    : 'icon-btn';
  const btnStyle = color === 'danger'
    ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)', width: 22, height: 22, padding: 0, display: 'inline-flex' as const, alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }
    : { width: 22, height: 22, padding: 0, display: 'inline-flex' as const, alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', flexShrink: 0 };
  return (
    <button className={cls} style={btnStyle}
      onClick={onClick} title={title}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">{children}</svg>
    </button>
  );
}

// ─── Shared Helpers ────────────────────────────────────────
function Field({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number; }) {
  return (
    <div>
      <div className="input-label truncate">{label}</div>
      <input className="input-field" type="number" step={step} value={value || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number; }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] text-text-muted mb-0.5 leading-tight truncate">{label}</div>
      <input className="input-field text-xs py-1.5 w-full" type="number" step={step || 1} value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)} />
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

function DetailItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="tag flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${highlight ? 'text-gold' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Info Tip Popover ───────────────────────────────────────
const INFO_NOTES: Record<string, string> = {
  buff: `被动包含勿忘+、高阶增强、31f共鸣被动、机灵被动，填写时叠加，例如存在勿忘，填写1.2
速查: 勿忘+：20％ 高阶增强/boost：20％ 机灵：25%，初始共鸣:15/18/20/22/25, 条件共鸣:20/22/25/27/30
场地为固定值，不吃任何加成，请填写在加攻被动区
心眼不吃宝珠，被动
指挥, 蓄力可吃所有正常加攻吃的被动和宝珠`,
  debuff: `被动包含月光+，高阶增强，31e共鸣被动，侵蚀被动，填写时叠加，例如存在侵蚀，填写1.25
速查: 勿忘+：20％ 高阶增强/boost：20％ 机灵：25%，樱花箭: 20%, 初始共鸣:15/18/20/22/25, 条件共鸣:20/22/25/27/30
脆弱可享受樱花箭, 宝珠, 月光+，高阶，boost, 不享受共鸣被动，侵蚀`,
  weakness: `弱点可享受宝珠以及爆裂和高阶增强的加深区`,
  passiveAtk: `包括高阶/爆裂的加攻、场地、角色被动等`,
};

function InfoTip({ id }: { id: string }) {
  const text = INFO_NOTES[id];
  if (!text) return null;
  return (
    <span className="relative inline-flex align-middle group ml-1">
      <span className="text-text-muted group-hover:text-text-secondary text-xs"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--app-checkbox-border)', fontSize: 10, fontWeight: 700, cursor: 'help' }}>?</span>
      <div className="absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-card border border-white/10 rounded-lg p-3 shadow-xl whitespace-pre-line text-xs hidden group-hover:block" style={{ minWidth: 280, maxWidth: 360, color: 'var(--app-text-secondary)' }}>
        {text}
      </div>
    </span>
  );
}
