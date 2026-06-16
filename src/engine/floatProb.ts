/**
 * Exact float probability distribution using characteristic function approach.
 * Based on the Mathematica code from float.txt.
 *
 * Each hit's damage is independently uniform in [base*(1-0.1), base*(1+0.1)].
 * The average float deviation up = (total - base_total) / base_total.
 *
 * UpProb(hitWeights, up) = P(average float deviation ≥ up)
 *   = 1/2 - 1/π * ∫₀^∞ sin(up*T*t)/t * Π sinc(0.1*w_i*t) dt
 *
 * where T = sum(w_i), w_i are per-hit damage weights.
 */

// ─── sinc ──────────────────────────────────────────────────────
/** sin(x)/x with Taylor expansion for small |x| */
function sinc(x: number): number {
  const absX = Math.abs(x);
  if (absX < 1e-5) {
    const x2 = x * x;
    return 1 - x2 / 6 + x2 * x2 / 120;
  }
  return Math.sin(x) / x;
}

// ─── Characteristic function product ───────────────────────────
/**
 * Π(t) = ∏ sinc(d_i * t) where d_i = 0.1 * w_i
 * This is the characteristic function of the total deviation distribution.
 */
function charFuncProduct(dList: Float64Array, t: number): number {
  let prod = 1;
  for (let i = 0; i < dList.length; i++) {
    prod *= sinc(dList[i] * t);
    // Early exit if product is effectively zero
    if (Math.abs(prod) < 1e-30) return 0;
  }
  return prod;
}

// ─── UpProb ────────────────────────────────────────────────────
/**
 * Compute P(average float deviation ≥ up) using the exact formula.
 *
 * @param hitWeights - per-hit damage weights (1.0 for body hits, 0.5/0.25/0.12/0.06 for chain)
 * @param up - float deviation threshold, range [-0.1, 0.1]
 * @returns Probability that average float ≥ up
 */
export function upProb(hitWeights: number[], up: number): number {
  const T = hitWeights.reduce((a, b) => a + b, 0);
  if (T === 0) return up <= 0 ? 1 : 0;

  // Filter zero-weight hits
  const dListArr = hitWeights.map(h => 0.1 * h).filter(d => d > 1e-15);
  if (dListArr.length === 0) return up <= 0 ? 1 : 0;

  const dList = new Float64Array(dListArr);
  const minD = dListArr.reduce((a, b) => Math.min(a, b), Infinity);

  // Use symmetry: upProb(-up) = 1 - upProb(up)
  const sign = up >= 0 ? 1 : -1;
  const absUp = Math.abs(up);
  const omega = absUp * T;

  // Integration range: integrate until sinc envelope has decayed
  // Main lobe of widest sinc ends at t=π/minD; go well past that
  const tMax = Math.max(300, 4 * Math.PI / minD);
  // Simpson's rule: step count must be even; aim for ~80 points per unit of tMax
  const nStepsRaw = Math.max(4096, Math.ceil(tMax * 40));
  const nSteps = nStepsRaw % 2 === 0 ? nStepsRaw : nStepsRaw + 1;
  const h = tMax / nSteps;

  // ─── Simpson integration ───────────────────────────────────
  // I(ω) = ∫₀^∞ sin(ωt)/t * Π(t) dt
  // At t=0: lim sin(ωt)/t * Π(0) = ω
  // Simpson: I ≈ h/3 * [f(0) + 4f(h) + 2f(2h) + 4f(3h) + ... + f(Nh)]

  let sum = omega; // f(0) term

  // Precompute Π(t) at each step to avoid redundant work
  // But we process sequentially since we need Π(t) only once per t
  for (let i = 1; i < nSteps; i++) {
    const t = i * h;
    const weight = i % 2 === 0 ? 2 : 4;
    const pi = charFuncProduct(dList, t);
    if (pi === 0) {
      // Remaining integrand is effectively zero; add zero contribution
      // But sin(ωt)/t * 0 = 0, so we can skip but must maintain count for Simpson
      // The fast convergence means we can break safely
      break;
    }
    sum += weight * Math.sin(omega * t) / t * pi;
  }

  // Last point
  const tN = nSteps * h;
  const piN = charFuncProduct(dList, tN);
  if (piN !== 0) {
    sum += Math.sin(omega * tN) / tN * piN;
  }

  const integral = sum * h / 3;
  const rawResult = 0.5 - (1 / Math.PI) * integral;

  // Clip to [0, 1] and apply symmetry
  const posResult = Math.max(0, Math.min(1, rawResult));
  return sign >= 0 ? posResult : 1 - posResult;
}

// ─── Float distribution data ───────────────────────────────────
export interface FloatDistPoint {
  up: number;       // Float deviation value (-0.1 to 0.1)
  pdf: number;      // PDF value
  survival: number; // P(float ≥ up)
}

export interface FloatDistData {
  points: FloatDistPoint[];
  maxPdf: number;
  hitWeights: number[];
  totalWeight: number;
}

/**
 * Compute the full float PDF + survival curve.
 *
 * @param hitWeights - per-hit damage weights
 * @param numPoints - number of up sample points (default 200)
 */
export function computeFloatDistribution(
  hitWeights: number[],
  numPoints: number = 200,
): FloatDistData {
  const totalWeight = hitWeights.reduce((a, b) => a + b, 0);

  if (hitWeights.length === 0 || totalWeight === 0) {
    return { points: [], maxPdf: 0, hitWeights, totalWeight };
  }

  const upMin = -0.1;
  const upMax = 0.1;
  const step = (upMax - upMin) / (numPoints - 1);

  // Compute survival only for up ≥ 0 (use symmetry for up < 0)
  const halfCount = Math.ceil(numPoints / 2);
  const survNonNeg: Float64Array = new Float64Array(halfCount + 1);

  for (let i = 0; i <= halfCount; i++) {
    const up = i * step;
    survNonNeg[i] = upProb(hitWeights, up);
  }

  const points: FloatDistPoint[] = [];
  let maxPdf = 0;

  for (let i = 0; i < numPoints; i++) {
    const up = upMin + i * step;

    // Survival via symmetry
    let survival: number;
    if (up >= 0) {
      const idx = Math.round(up / step);
      survival = survNonNeg[Math.min(idx, halfCount)];
    } else {
      const idx = Math.round(-up / step);
      survival = 1 - survNonNeg[Math.min(idx, halfCount)];
    }

    // PDF = -d(survival)/d(up) via central difference on survival
    let pdf: number;
    const absIdx = Math.round(Math.abs(up) / step);

    if (absIdx === 0) {
      // at up=0, one-sided difference using non-negative side
      pdf = (survNonNeg[0] - survNonNeg[1]) / step;
    } else if (absIdx >= halfCount) {
      // at boundary
      const a = survNonNeg[halfCount - 1];
      const b = survNonNeg[halfCount];
      pdf = (a - b) / step;
    } else {
      const sMinus = survNonNeg[absIdx - 1];
      const sPlus = survNonNeg[absIdx + 1];
      pdf = (sMinus - sPlus) / (2 * step);
    }

    // PDF is symmetric: pdf(up) = pdf(-up)
    // For up < 0, survival = 1 - survNonNeg(-up), so -d(survival)/d(up)
    //   = -d(1 - survNonNeg(v))/dv * dv/d(up) where v = -up
    //   = -(-survNonNeg'(v)) * (-1) = survNonNeg'(v)
    // Since survNonNeg is decreasing, survNonNeg' < 0, so PDF > 0 ✓
    // But for up < 0, survival increases with up, so -d(survival)/d(up) < 0
    // Let me just use the absolute value of the central difference
    pdf = Math.abs(pdf);
    maxPdf = Math.max(maxPdf, pdf);

    points.push({ up, pdf, survival });
  }

  return { points, maxPdf, hitWeights, totalWeight };
}

// ─── Parse custom body weight string ─────────────────────────
/**
 * Parse a user-provided weight distribution string into an array of numbers.
 * Accepts comma, semicolon, space, or Chinese comma as separators.
 * Returns null if the string is empty or invalid.
 *
 * Examples: "0.3, 0.3, 0.4", "0.5 0.5", "1,1,1,0.5"
 */
export function parseWeightString(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Split on commas, semicolons, Chinese commas, or whitespace
  const parts = trimmed.split(/[,;，；\s]+/).filter(s => s.length > 0);
  if (parts.length === 0) return null;

  const weights: number[] = [];
  for (const part of parts) {
    const n = parseFloat(part);
    if (isNaN(n) || n <= 0) return null; // reject invalid or non-positive
    weights.push(n);
  }
  return weights;
}

// ─── Build hit weights from UI inputs ──────────────────────────
/**
 * Build the array of per-hit damage weights from body hit count / custom weights
 * and chain hit counts.
 *
 * If customBodyWeights is provided, it replaces the default uniform 1.0 body hits.
 * Chain hits have weights equal to their damage multiplier:
 *   Super = 0.5, Big = 0.25, Mid = 0.12, Small = 0.06
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
    const sum = customBodyWeights.reduce((a, b) => a + b, 0);
    const scale = hitCount / sum;
    for (const w of customBodyWeights) weights.push(w * scale);
  } else {
    for (let i = 0; i < hitCount; i++) weights.push(1.0);
  }
  for (let i = 0; i < superC; i++) weights.push(0.5);
  for (let i = 0; i < bigC; i++) weights.push(0.25);
  for (let i = 0; i < midC; i++) weights.push(0.12);
  for (let i = 0; i < smallC; i++) weights.push(0.06);
  return weights;
}
