import { useState, useMemo, useRef, useCallback } from 'react';
import { DamageResultData, SkillInput } from '../../types';
import { computeFloatDistribution, buildHitWeights, parseWeightString, FloatDistData } from '../../engine/floatProb';

function fmtRaw(n: number): string {
  return Math.round(n).toLocaleString('zh-CN');
}

export default function DamageResult({ result, skill, floatVal,
  superChainHits, setSuperChainHits, bigChainHits, setBigChainHits,
  midChainHits, setMidChainHits, smallChainHits, setSmallChainHits,
  bodyWeightStr, setBodyWeightStr,
}: {
  result: DamageResultData; skill: SkillInput;
  floatVal: number;
  superChainHits: number; setSuperChainHits: (v: number) => void;
  bigChainHits: number; setBigChainHits: (v: number) => void;
  midChainHits: number; setMidChainHits: (v: number) => void;
  smallChainHits: number; setSmallChainHits: (v: number) => void;
  bodyWeightStr: string; setBodyWeightStr: (v: string) => void;
}) {
  // 打分由引擎 calculateAll 计算（已含 bonusDmg），UI 直接引用 result.score

  // Parse custom body weights from user input
  const customBodyWeights = useMemo(
    () => parseWeightString(bodyWeightStr),
    [bodyWeightStr]
  );

  // Float distribution — exact formula via characteristic function (float.txt)
  const bodyHitCount = customBodyWeights ? customBodyWeights.length : (skill.hitCount || 1);
  const totalHits = bodyHitCount + superChainHits + bigChainHits + midChainHits + smallChainHits;
  const hitWeights = useMemo(
    () => buildHitWeights(skill.hitCount || 1, superChainHits, bigChainHits, midChainHits, smallChainHits, customBodyWeights),
    [skill.hitCount, superChainHits, bigChainHits, midChainHits, smallChainHits, customBodyWeights]
  );
  const floatDist: FloatDistData = useMemo(
    () => computeFloatDistribution(hitWeights, 200),
    [hitWeights]
  );

  const [hover, setHover] = useState<{ x: number; y: number; pdfVal: number; survivalVal: number; dmg: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 400, H = 200, L = 45, R = 20, T = 15, B = 35;
  const pw = W - L - R, ph = H - T - B;

  // Plot range: up from -0.1 to 0.1
  const upMin = -0.1, upMax = 0.1;
  const sx = (up: number) => L + ((up - upMin) / (upMax - upMin)) * pw;
  const sy = (pdf: number) => T + (1 - pdf / floatDist.maxPdf) * ph;
  const ix = (mx: number) => ((mx - L) / pw) * (upMax - upMin) + upMin;

  // Build SVG path for PDF curve
  const pdfPathD = useMemo(() => {
    if (floatDist.points.length === 0) return '';
    const pts = floatDist.points;
    let d = `M ${sx(pts[0].up)} ${sy(0)}`;
    for (const p of pts) {
      d += ` L ${sx(p.up)} ${sy(p.pdf)}`;
    }
    d += ` L ${sx(pts[pts.length - 1].up)} ${sy(0)} Z`;
    return d;
  }, [floatDist]);

  // Build SVG path for survival curve (thin overlay line)
  const survivalPathD = useMemo(() => {
    if (floatDist.points.length === 0) return '';
    const pts = floatDist.points;
    const sMax = 1;
    const sy2 = (s: number) => T + (1 - s / sMax) * ph;
    let d = `M ${sx(pts[0].up)} ${sy2(pts[0].survival)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${sx(pts[i].up)} ${sy2(pts[i].survival)}`;
    }
    return d;
  }, [floatDist]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgW = rect.width;
    const vbx = ((e.clientX - rect.left) / svgW) * W;
    if (vbx < L || vbx > L + pw) { setHover(null); return; }
    const up = ix(vbx);
    let best = floatDist.points[0];
    let bestDist = Infinity;
    for (const p of floatDist.points) {
      const d = Math.abs(p.up - up);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    const dmgEstimate = result.postAttenuation * (1 + best.up) / floatVal;
    setHover({ x: best.up, y: best.pdf, pdfVal: best.pdf, survivalVal: best.survival, dmg: dmgEstimate });
  }, [floatDist, result.postAttenuation, floatVal, W, L, pw]);

  return (
    <div className="space-y-4">
      {/* Float Probability Visualization + Score */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Float Visualization */}
        <div className="card">
          <div className="card-header">浮动概率分布</div>
          <div className="text-xs text-text-muted mb-2">
            {customBodyWeights
              ? <span>本体权重 [{customBodyWeights.join(', ')}]</span>
              : <span>{skill.hitCount || 1}本体</span>
            }
            {' + '}{superChainHits}特大 + {bigChainHits}大 + {midChainHits}中 + {smallChainHits}小 = {totalHits} hits
            <span className="ml-1 text-[10px] opacity-60">（精确公式：特征函数法）</span>
          </div>

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
            <line x1={L} y1={T + ph} x2={L + pw} y2={T + ph} stroke="var(--app-glass-border)" strokeWidth={1} />
            <line x1={sx(0)} y1={T} x2={sx(0)} y2={T + ph} stroke="rgba(245,158,11,0.3)" strokeWidth={1} strokeDasharray="4,2" />
            <path d={pdfPathD} fill="rgba(99,102,241,0.25)" stroke="rgba(99,102,241,0.7)" strokeWidth={1} />
            <path d={survivalPathD} fill="none" stroke="rgba(245,158,11,0.5)" strokeWidth={1} strokeDasharray="2,2" />
            {[-0.1, -0.05, 0, 0.05, 0.1].map(x => (
              <text key={x} x={sx(x)} y={T + ph + 14} textAnchor="middle" fill="var(--app-text-muted)" fontSize={9}>
                {x === 0 ? '0%' : `${Math.round(x * 100)}%`}
              </text>
            ))}
            <rect x={L} y={T} width={pw} height={ph} fill="transparent"
              onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)} />
            {hover && (
              <>
                <line x1={sx(hover.x)} y1={T} x2={sx(hover.x)} y2={T + ph} stroke="var(--app-text-secondary)" strokeWidth={1} />
                <circle cx={sx(hover.x)} cy={sy(hover.y)} r={4} fill="#f59e0b" stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
              </>
            )}
          </svg>

          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>-10%</span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-0.5 bg-indigo-400/70 rounded" /> PDF
              <span className="inline-block w-2.5 h-0.5 bg-amber-400/50 rounded" style={{ borderTop: '1px dashed rgba(245,158,11,0.5)' }} /> P(≥up)
            </span>
            <span>+10%</span>
          </div>

          {hover && (
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs stat-box">
              <div><span className="text-text-muted">浮动:</span> <span className="font-mono">{(hover.x * 100).toFixed(2)}%</span></div>
              <div><span className="text-text-muted">概率密度:</span> <span className="font-mono">{hover.pdfVal.toFixed(3)}</span></div>
              <div><span className="text-text-muted">P(≥浮动):</span> <span className="font-mono text-amber-300">{(hover.survivalVal * 100).toFixed(2)}%</span></div>
              <div><span className="text-text-muted">伤害:</span> <span className="font-mono text-gold">{fmtRaw(hover.dmg)}</span></div>
            </div>
          )}

          {/* Chain hit inputs for float probability */}
          <div className="mt-3 pt-3 border-t divider">
            <div className="text-xs text-text-muted mb-2">连击Hit数（用于浮动概率，伤害倍率同破坏计算）</div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <div className="text-[10px] text-text-muted mb-0.5">特大连击 (50%)</div>
                <input className="input-field text-xs py-1" type="number" value={superChainHits} onChange={e => setSuperChainHits(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <div className="text-[10px] text-text-muted mb-0.5">大连击 (25%)</div>
                <input className="input-field text-xs py-1" type="number" value={bigChainHits} onChange={e => setBigChainHits(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <div className="text-[10px] text-text-muted mb-0.5">中连击 (12%)</div>
                <input className="input-field text-xs py-1" type="number" value={midChainHits} onChange={e => setMidChainHits(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <div className="text-[10px] text-text-muted mb-0.5">小连击 (6%)</div>
                <input className="input-field text-xs py-1" type="number" value={smallChainHits} onChange={e => setSmallChainHits(parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Custom body hit weight distribution */}
          <div className="mt-3 pt-3 border-t divider">
            <div className="text-xs text-text-muted mb-1.5">本体hit权重分布</div>
            <input
              className="input-field text-xs py-1.5 w-full font-mono"
              type="text"
              placeholder="留空则均分，如: 0.3, 0.3, 0.4"
              value={bodyWeightStr}
              onChange={e => setBodyWeightStr(e.target.value)}
            />
            {customBodyWeights && (
              <div className="text-[10px] text-text-muted mt-1">
                已设置 {customBodyWeights.length} 个本体hit权重（总和 {customBodyWeights.reduce((a, b) => a + b, 0).toFixed(2)}），替换了技能hit数
              </div>
            )}
            {!customBodyWeights && bodyWeightStr.trim() && (
              <div className="text-[10px] text-red-400/70 mt-1">
                格式无效，请输入正数，以逗号/空格分隔
              </div>
            )}
          </div>
        </div>

        {/* Score */}
        {result.score && (
          <div className="card border-gold/20">
            <div className="card-header">打分预估</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center stat-box">
                <div className="input-label">基础分</div>
                <div className="font-bold">{fmtRaw(result.score.baseScore)}</div>
              </div>
              <div className="text-center stat-box">
                <div className="input-label">伤害分</div>
                <div className="font-bold">{fmtRaw(result.score.damageScore)}</div>
              </div>
              <div className="text-center stat-box">
                <div className="input-label">盾分</div>
                <div className="font-bold">{fmtRaw(result.score.shieldScore)}</div>
              </div>
              <div className="text-center stat-box">
                <div className="input-label">回合系数</div>
                <div className="font-bold">{result.score.turnCoeff.toFixed(2)}</div>
              </div>
            </div>
            <div className="text-center pt-3 mt-3 border-t divider">
              <div className="text-xs text-text-muted mb-1">预估总分</div>
              <div className="result-value text-gold">{fmtRaw(result.score.totalScore)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
