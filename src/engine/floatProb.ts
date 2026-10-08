/**
 * 浮动概率分布 / Float probability distribution.
 *
 * 每个 hit 的伤害独立均匀分布于 [base·0.9, base·1.1]。
 * 总浮动偏差 up = (总伤害 − 期望总伤害) / 期望总伤害 ∈ [−0.1, 0.1]。
 *
 * UpProb(hitWeights, up) = P(加权平均浮动 ≥ up)
 *
 * 实现依据 float_ex.nb.txt 的解析（样条）公式：
 *
 *   设把权重化成互质整数 k_i（PrepareDist），K = Σk_i，n = hit 数，
 *   c_q 为 ∏(1 − z^{k_i}) 的展开系数（即子集和 q 的带符号重数），
 *   x = K(1 − 10·up)/2，则
 *
 *     S(up) = Σ_{q < x} c_q (x − q)^n / (n! · ∏k_i)
 *     f(up) = 5nK · Σ_{q < x} c_q (x − q)^{n−1} / (n! · ∏k_i),  x = K(1 − 10|up|)/2
 *
 * 该式在数学上精确，但求和的各项符号交替，随 hit 数增长会出现灾难性抵消：
 * 实测条件数 Σ|项| / |Σ项| 在 n=10 时约 9，n=48 时约 1e12，n=108（6 体多段）时约 1e16，
 * 后者在 double 下已完全丢失有效位（结果为 NaN / 负密度）。
 *
 * 因此这里做两级处理：
 *   1) 精确解析式 —— 条件数可接受时使用（覆盖绝大多数实战场景，且是逐点精确的）；
 *   2) 特征函数法 —— 条件数超限时回退（对 Monte Carlo 实测误差约 0.1%~0.2%，稳定不发散）。
 */

// ─── 有理化 / 整数化（对应 notebook 的 SimpleRational / PrepareDist） ───

const MAX_DEN = 1000;
const TOL = 1e-10;

/** 条件数上限：超过则精确式已丢失有效位，改用特征函数法 */
const COND_LIMIT = 1e8;
/** 精确式的规模上限，避免子集和 DP 爆炸 */
const MAX_EXACT_WORK = 4_000_000;
const MAX_EXACT_TERMS = 200_000;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return (a / gcd(a, b)) * b;
}

/** Mathematica 的 Round：.5 取偶 */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** 找最小分母 q ≤ MAX_DEN 使 p/q 逼近 y；失败则退化为 5 位小数约分。 */
function simpleRational(y: number): [number, number] {
  for (let q = 1; q <= MAX_DEN; q++) {
    const p = roundHalfEven(y * q);
    if (Math.abs(p / q - y) <= TOL) return [p, q];
  }
  const s = roundHalfEven(y * 1e5);
  const g = gcd(Math.abs(s), 1e5) || 1;
  return [s / g, 1e5 / g];
}

/**
 * 把任意正权重化成互质整数（notebook 的 PrepareDist）。
 * 权重含 0 / 负数 / 非有限值，或整数化后超出安全范围时返回 null。
 */
function prepareDist(dist: number[]): number[] | null {
  if (dist.length === 0) return null;
  const rats: Array<[number, number]> = [];
  for (const v of dist) {
    if (!Number.isFinite(v) || v <= 0) return null; // notebook 注释：权重不允许含 0
    rats.push(simpleRational(v));
  }
  let den = 1;
  for (const [, d] of rats) {
    den = lcm(den, d);
    if (!Number.isSafeInteger(den)) return null;
  }
  const ints = rats.map(([num, d]) => num * (den / d));
  // 权重小到 5 位小数都表达不出来时会约成 0（如 1e-6）；精确式无法表示，交给回退路径
  if (ints.some(v => v === 0)) return null;
  let g = 0;
  for (const v of ints) g = gcd(g, v);
  if (g === 0) return null;
  const out = ints.map(v => v / g);
  let K = 0;
  for (const v of out) K += v;
  if (!Number.isSafeInteger(K) || K <= 0) return null;
  return out;
}

// ─── 精确式的数据（对应 notebook 的 BuildUpProbData） ───

interface UpProbData {
  n: number;
  K: number;
  logFact: number; // ln(n!)
  logProduct: number; // Σ ln(k_i)
  /** [子集和 q, 系数 c_q]，按 q 升序 */
  terms: Array<[number, number]>;
}

const dataCache = new Map<string, UpProbData | null>();

function buildUpProbData(w: number[]): UpProbData | null {
  const n = w.length;
  if (n === 0) return null;

  let K = 0;
  for (const v of w) K += v;
  if (!Number.isFinite(K) || K <= 0) return null;
  if (K * n > MAX_EXACT_WORK) return null;

  // DP：assoc[q] = ∏(1 − z^{k_i}) 中 z^q 的系数
  let assoc = new Map<number, number>([[0, 1]]);
  for (const wi of w) {
    const next = new Map<number, number>(assoc);
    for (const [q, c] of assoc) {
      const key = q + wi;
      const v = (next.get(key) ?? 0) - c;
      if (v === 0) next.delete(key);
      else next.set(key, v);
    }
    assoc = next;
    if (assoc.size > MAX_EXACT_TERMS) return null;
  }

  const terms: Array<[number, number]> = [];
  for (const [q, c] of assoc) if (c !== 0) terms.push([q, c]);
  terms.sort((a, b) => a[0] - b[0]);

  let logFact = 0;
  for (let i = 2; i <= n; i++) logFact += Math.log(i);
  let logProduct = 0;
  for (const v of w) logProduct += Math.log(v);

  return { n, K, logFact, logProduct, terms };
}

/** 按权重内容缓存的 BuildUpProbData；null 表示该权重不适合走精确式。 */
function exactDataFor(hitWeights: number[]): UpProbData | null {
  const key = hitWeights.join(',');
  const cached = dataCache.get(key);
  if (cached !== undefined) return cached;

  const reduced = prepareDist(hitWeights);
  const data = reduced ? buildUpProbData(reduced) : null;

  if (dataCache.size > 32) dataCache.clear(); // 防止无限增长
  dataCache.set(key, data);
  return data;
}

// ─── 精确式求值 ───

interface ExactEval {
  value: number;
  /** 条件数 Σ|项| / |Σ项|；越大表示抵消越严重 */
  cond: number;
}

/**
 * @param order 0 = 生存函数 S(up)（指数 n）；1 = 密度 f(up)（指数 n−1，含 5nK 系数）
 * @returns 无法求值（无有效项 / 溢出）时返回 null
 */
function evalExact(data: UpProbData, up: number, order: 0 | 1): ExactEval | null {
  const a = Math.abs(up);
  if (a >= 0.1) {
    if (order === 1) return { value: 0, cond: 1 };
    return { value: up >= 0.1 ? 0 : 1, cond: 1 };
  }

  const { n, K, logFact, logProduct, terms } = data;
  const x = (K * (1 - 10 * a)) / 2;
  if (x <= 0) return { value: 0, cond: 1 };

  const expo = order === 0 ? n : n - 1;

  // 各项量级差异极大（n 次幂 + 巨大系数），在对数域提公因子后再求和，避免上溢
  const lts: number[] = [];
  const signs: number[] = [];
  let maxLt = -Infinity;

  for (let i = 0; i < terms.length; i++) {
    const q = terms[i][0];
    if (q >= x) break; // terms 按 q 升序
    const c = terms[i][1];
    const lt = Math.log(Math.abs(c)) + expo * Math.log(x - q);
    lts.push(lt);
    signs.push(c > 0 ? 1 : -1);
    if (lt > maxLt) maxLt = lt;
  }
  if (lts.length === 0 || !Number.isFinite(maxLt)) return null;

  let inner = 0;
  let absSum = 0;
  for (let i = 0; i < lts.length; i++) {
    const t = Math.exp(lts[i] - maxLt);
    inner += signs[i] * t;
    absSum += t;
  }
  if (inner === 0) return null;

  const logScale =
    order === 0 ? -logFact - logProduct : Math.log(5 * n * K) - logFact - logProduct;
  const value = Math.exp(maxLt + logScale) * inner;

  return { value, cond: absSum / Math.abs(inner) };
}

/**
 * 生存函数 S(up)。evalExact 只对 |up| 求值，负半轴按 notebook 的
 * `If[u < 0, Return[1. - UpProbCore[w, -u]]]` 取对称补。
 */
function exactSurvival(data: UpProbData, up: number): ExactEval | null {
  if (up < 0) {
    const r = evalExact(data, -up, 0);
    if (!r) return null;
    return { value: 1 - r.value, cond: r.cond };
  }
  return evalExact(data, up, 0);
}

/**
 * 采样若干 up，判断整条曲线能否安全地走精确式。
 * 只采样视觉上有意义的区间（|up| ≤ 0.04）；更远的尾部数值≈0，即便走回退也看不出差别。
 */
function isWellConditioned(data: UpProbData): boolean {
  const probes = [0.0005, 0.002, 0.005, 0.01, 0.02, 0.04];
  for (const u of probes) {
    for (const order of [0, 1] as const) {
      const r = evalExact(data, u, order);
      if (!r || !Number.isFinite(r.value) || r.cond > COND_LIMIT) return false;
    }
  }
  return true;
}

// ─── 特征函数法（回退路径） ───

/** sin(x)/x，|x| 很小时用 Taylor 展开避免 0/0 */
function sinc(x: number): number {
  const absX = Math.abs(x);
  if (absX < 1e-5) {
    const x2 = x * x;
    return 1 - x2 / 6 + x2 * x2 / 120;
  }
  return Math.sin(x) / x;
}

/** Π(t) = ∏ sinc(0.1·w_i·t) */
function charFuncProduct(dList: Float64Array, t: number): number {
  let prod = 1;
  for (let i = 0; i < dList.length; i++) {
    prod *= sinc(dList[i] * t);
    if (Math.abs(prod) < 1e-30) return 0;
  }
  return prod;
}

/**
 * 回退：特征函数积分
 *   P(浮动 ≥ up) = 1/2 − 1/π ∫₀^∞ sin(up·T·t)/t · ∏ sinc(0.1·w_i·t) dt
 */
function upProbCF(hitWeights: number[], up: number): number {
  const positive = hitWeights.filter(h => h > 1e-15);
  if (positive.length === 0) return up <= 0 ? 1 : 0;

  const T = positive.reduce((a, b) => a + b, 0);
  if (T === 0) return up <= 0 ? 1 : 0;

  const dListArr = positive.map(h => 0.1 * h);
  const dList = new Float64Array(dListArr);
  const minD = dListArr.reduce((a, b) => Math.min(a, b), Infinity);

  const sign = up >= 0 ? 1 : -1;
  const omega = Math.abs(up) * T;

  // 积分到最宽 sinc 主瓣之外足够远处；上下限防止极小权重（如 1e-6）
  // 把 tMax 推到 1e8 量级、步数上十亿导致卡死
  const tMax = Math.min(Math.max(300, (4 * Math.PI) / minD), 1e5);
  const nStepsRaw = Math.min(Math.max(4096, Math.ceil(tMax * 40)), 200_000);
  const nSteps = nStepsRaw % 2 === 0 ? nStepsRaw : nStepsRaw + 1;
  const h = tMax / nSteps;

  // Simpson；t=0 处极限为 ω
  let sum = omega;
  for (let i = 1; i < nSteps; i++) {
    const t = i * h;
    const pi = charFuncProduct(dList, t);
    if (pi === 0) break;
    sum += (i % 2 === 0 ? 2 : 4) * (Math.sin(omega * t) / t) * pi;
  }
  const tN = nSteps * h;
  const piN = charFuncProduct(dList, tN);
  if (piN !== 0) sum += (Math.sin(omega * tN) / tN) * piN;

  const raw = 0.5 - (1 / Math.PI) * ((sum * h) / 3);
  const pos = Math.max(0, Math.min(1, raw));
  return sign >= 0 ? pos : 1 - pos;
}

// ─── 公开 API ───

/**
 * P(加权平均浮动 ≥ up)，up ∈ [−0.1, 0.1]。
 *
 * @param hitWeights 每个 hit 的伤害权重（本体 1.0；连击 0.5 / 0.25 / 0.12 / 0.06）
 * @param up 浮动阈值
 */
export function upProb(hitWeights: number[], up: number): number {
  const totalWeight = hitWeights.reduce((a, b) => a + b, 0);
  if (hitWeights.length === 0 || totalWeight === 0) return up <= 0 ? 1 : 0;

  if (up <= -0.1) return 1;
  if (up >= 0.1) return 0;
  if (up === 0) return 0.5;

  const data = exactDataFor(hitWeights);
  if (data) {
    const r = exactSurvival(data, up);
    if (r && Number.isFinite(r.value) && r.cond <= COND_LIMIT) {
      return Math.max(0, Math.min(1, r.value));
    }
  }
  return upProbCF(hitWeights, up);
}

/**
 * 浮动密度 f(up)（关于 up 的概率密度），up ∈ [−0.1, 0.1]。
 */
export function upPdf(hitWeights: number[], up: number): number {
  const totalWeight = hitWeights.reduce((a, b) => a + b, 0);
  if (hitWeights.length === 0 || totalWeight === 0) return 0;
  if (Math.abs(up) >= 0.1) return 0;

  const data = exactDataFor(hitWeights);
  if (data) {
    const r = evalExact(data, up, 1);
    if (r && Number.isFinite(r.value) && r.value >= 0 && r.cond <= COND_LIMIT) {
      return r.value;
    }
  }

  // 回退：对生存函数做中心差分
  const h = 1e-5;
  const lo = Math.max(-0.1, up - h);
  const hi = Math.min(0.1, up + h);
  return Math.max(0, (upProb(hitWeights, lo) - upProb(hitWeights, hi)) / (hi - lo));
}

// ─── Float distribution data ───────────────────────────────────

export interface FloatDistPoint {
  up: number; // 浮动偏差 (-0.1 ~ 0.1)
  pdf: number; // 概率密度
  survival: number; // P(浮动 ≥ up)
}

export interface FloatDistData {
  points: FloatDistPoint[];
  maxPdf: number;
  hitWeights: number[];
  totalWeight: number;
  /** 本次曲线是否使用了精确解析式（false = 走了特征函数回退） */
  exact: boolean;
}

/**
 * 计算完整的浮动 PDF + 生存曲线。
 *
 * @param hitWeights 每个 hit 的伤害权重
 * @param numPoints up 采样点数（默认 200）
 */
export function computeFloatDistribution(
  hitWeights: number[],
  numPoints: number = 200,
): FloatDistData {
  const totalWeight = hitWeights.reduce((a, b) => a + b, 0);

  if (hitWeights.length === 0 || totalWeight === 0) {
    return { points: [], maxPdf: 0, hitWeights, totalWeight, exact: false };
  }

  const upMin = -0.1;
  const upMax = 0.1;
  const step = (upMax - upMin) / (numPoints - 1);

  const data = exactDataFor(hitWeights);
  const exactPoints: FloatDistPoint[] = [];
  let exactMaxPdf = 0;

  // 精确解析式：整条曲线要么全走精确式，要么整体回退 —— 逐点混用会在
  // 切换处产生不连续，画出来的曲线会出现折角
  if (data && isWellConditioned(data)) {
    let ok = true;
    for (let i = 0; i < numPoints; i++) {
      const up = upMin + i * step;
      const s = exactSurvival(data, up);
      const p = evalExact(data, up, 1);
      if (
        !s ||
        !p ||
        !Number.isFinite(s.value) ||
        !Number.isFinite(p.value) ||
        s.cond > COND_LIMIT ||
        p.cond > COND_LIMIT ||
        p.value < 0
      ) {
        ok = false;
        break;
      }
      const pdf = p.value;
      if (pdf > exactMaxPdf) exactMaxPdf = pdf;
      exactPoints.push({
        up,
        pdf,
        survival: Math.max(0, Math.min(1, s.value)),
      });
    }
    if (ok) {
      return {
        points: exactPoints,
        maxPdf: exactMaxPdf,
        hitWeights,
        totalWeight,
        exact: true,
      };
    }
  }

  const points: FloatDistPoint[] = [];
  let maxPdf = 0;

  // 回退：生存函数走特征函数法，PDF 用中心差分
  const halfCount = Math.ceil(numPoints / 2);
  const survNonNeg = new Float64Array(halfCount + 1);
  for (let i = 0; i <= halfCount; i++) {
    survNonNeg[i] = upProb(hitWeights, i * step);
  }

  for (let i = 0; i < numPoints; i++) {
    const up = upMin + i * step;

    let survival: number;
    if (up >= 0) {
      survival = survNonNeg[Math.min(Math.round(up / step), halfCount)];
    } else {
      survival = 1 - survNonNeg[Math.min(Math.round(-up / step), halfCount)];
    }

    // PDF = −d(survival)/d(up)，用非负侧的差分并取绝对值
    const absIdx = Math.round(Math.abs(up) / step);
    let pdf: number;
    if (absIdx === 0) {
      pdf = (survNonNeg[0] - survNonNeg[1]) / step;
    } else if (absIdx >= halfCount) {
      pdf = (survNonNeg[halfCount - 1] - survNonNeg[halfCount]) / step;
    } else {
      pdf = (survNonNeg[absIdx - 1] - survNonNeg[absIdx + 1]) / (2 * step);
    }
    pdf = Math.abs(pdf);
    if (pdf > maxPdf) maxPdf = pdf;

    points.push({ up, pdf, survival });
  }

  return { points, maxPdf, hitWeights, totalWeight, exact: false };
}

// ─── 自定义本体权重字符串 ─────────────────────────────────────

/**
 * 解析用户输入的本体权重串。支持逗号 / 分号 / 中文逗号 / 空白分隔。
 * 空串或含非正数时返回 null。
 *
 * 例："0.3, 0.3, 0.4"、"0.5 0.5"、"1,1,1,0.5"
 */
export function parseWeightString(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/[,;，；\s]+/).filter(s => s.length > 0);
  if (parts.length === 0) return null;

  const weights: number[] = [];
  for (const part of parts) {
    const n = parseFloat(part);
    if (isNaN(n) || n <= 0) return null;
    weights.push(n);
  }
  return weights;
}

// ─── 由 UI 输入构造 hit 权重 ───────────────────────────────────

/**
 * 由本体 hit 数 / 自定义权重与连击次数构造每个 hit 的伤害权重。
 *
 * 提供 customBodyWeights 时直接替代默认的均匀 1.0 本体；
 * 连击权重等于其伤害倍率：Super = 0.5，Big = 0.25，Mid = 0.12，Small = 0.06。
 */
export function buildHitWeights(
  hitCount: number,
  superC: number,
  bigC: number,
  midC: number,
  smallC: number,
  customBodyWeights?: number[] | null,
): number[] {
  const weights: number[] = [];
  if (customBodyWeights && customBodyWeights.length > 0) {
    // 自定义权重直接按用户输入的比例使用（如 [0.05×7, 0.65] 表示各 hit 的相对伤害占比，
    // 总和 1.0），不再按 hitCount/sum 缩放 —— 缩放会破坏本体与连击(0.5/0.25/…)的相对比例。
    for (const w of customBodyWeights) weights.push(w);
  } else {
    for (let i = 0; i < hitCount; i++) weights.push(1.0);
  }
  for (let i = 0; i < superC; i++) weights.push(0.5);
  for (let i = 0; i < bigC; i++) weights.push(0.25);
  for (let i = 0; i < midC; i++) weights.push(0.12);
  for (let i = 0; i < smallC; i++) weights.push(0.06);
  return weights;
}
