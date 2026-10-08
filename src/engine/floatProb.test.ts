import { describe, it, expect } from 'vitest';
import {
  upProb,
  upPdf,
  computeFloatDistribution,
  parseWeightString,
  buildHitWeights,
} from './floatProb';

/** mulberry32 —— 确定性 PRNG，保证 Monte Carlo 断言不 flaky */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 直接按定义做 Monte Carlo：每个 hit 的偏差 ~ U[-0.1, 0.1] */
function monteCarlo(weights: number[], up: number, samples: number, seed = 12345): number {
  const rnd = mulberry32(seed);
  const total = weights.reduce((a, b) => a + b, 0);
  let hits = 0;
  for (let s = 0; s < samples; s++) {
    let sum = 0;
    for (const w of weights) sum += w * (rnd() * 0.2 - 0.1);
    if (sum / total >= up) hits++;
  }
  return hits / samples;
}

describe('upProb — 单 hit 解析解', () => {
  it('单 hit 的浮动就是 U[-0.1, 0.1]', () => {
    for (const up of [-0.09, -0.03, 0, 0.03, 0.07, 0.099]) {
      expect(upProb([1], up)).toBeCloseTo((0.1 - up) / 0.2, 12);
    }
  });

  it('单 hit 的密度恒为 1/0.2 = 5', () => {
    for (const up of [-0.08, -0.02, 0, 0.05, 0.09]) {
      expect(upPdf([1], up)).toBeCloseTo(5, 10);
    }
  });

  it('权重等比缩放不改变分布（PrepareDist 约分）', () => {
    for (const up of [0.01, 0.03, 0.07]) {
      const a = upProb([1], up);
      expect(upProb([7], up)).toBeCloseTo(a, 12);
      expect(upProb([0.25], up)).toBeCloseTo(a, 12);
    }
  });
});

describe('upProb — 两 hit 的三角分布闭式解', () => {
  // 两个等权 hit 的平均偏差密度为三角形：f(x) = 10(1 - |x|/0.1)
  // => S(u) = 2((0.1-u)/0.2)^2  (u >= 0)
  it('生存函数匹配闭式解', () => {
    for (const up of [0, 0.002, 0.02, 0.06, 0.09]) {
      expect(upProb([1, 1], up)).toBeCloseTo(2 * ((0.1 - up) / 0.2) ** 2, 12);
    }
  });

  it('密度匹配闭式解', () => {
    for (const up of [0, 0.02, 0.05, 0.09]) {
      expect(upPdf([1, 1], up)).toBeCloseTo(10 * (1 - Math.abs(up) / 0.1), 10);
    }
  });
});

describe('upProb — 通用性质', () => {
  const cases: Array<[string, number[]]> = [
    ['5 本体 hit', [1, 1, 1, 1, 1]],
    ['10 本体 hit', Array(10).fill(1)],
    ['混合权重 8 hit', [1, 1, 1, 1, 1, 0.5, 0.25, 0.12]],
    ['自定义权重', [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.65]],
  ];

  for (const [name, weights] of cases) {
    it(`${name}：单调不增、对称、值域 [0,1]`, () => {
      let prev = Infinity;
      for (let up = -0.1; up <= 0.1001; up += 0.005) {
        const p = upProb(weights, up);
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(prev + 1e-9);
        prev = p;
      }
      // 关于 0 对称：S(up) + S(-up) = 1
      for (const up of [0.01, 0.03, 0.06]) {
        expect(upProb(weights, up) + upProb(weights, -up)).toBeCloseTo(1, 10);
      }
      expect(upProb(weights, 0)).toBeCloseTo(0.5, 10);
      expect(upProb(weights, 0.1)).toBe(0);
      expect(upProb(weights, -0.1)).toBe(1);
    });
  }

  it('密度在支撑区间上积分为 1', () => {
    const weights = [1, 1, 1, 1, 1, 0.5, 0.25, 0.12];
    const n = 4000;
    const h = 0.2 / n;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const up = -0.1 + (i + 0.5) * h;
      area += upPdf(weights, up) * h;
    }
    expect(area).toBeCloseTo(1, 3);
  });

  it('密度与生存函数的导数一致', () => {
    const weights = [1, 1, 1, 1, 0.5, 0.25];
    const h = 1e-6;
    for (const up of [-0.05, -0.01, 0.01, 0.04]) {
      const numeric = -(upProb(weights, up + h) - upProb(weights, up - h)) / (2 * h);
      expect(upPdf(weights, up)).toBeCloseTo(numeric, 5);
    }
  });
});

describe('upProb — 与 Monte Carlo 对照', () => {
  const cases: Array<[string, number[]]> = [
    ['5 本体 hit', [1, 1, 1, 1, 1]],
    ['混合 8 hit', [1, 1, 1, 1, 1, 0.5, 0.25, 0.12]],
    [
      '6 体 × 18 hit（n=108）',
      Array.from({ length: 6 }, () =>
        [...Array(10).fill(1), 0.5, 0.5, 0.25, 0.25, 0.12, 0.12, 0.06, 0.06],
      ).flat(),
    ],
  ];

  // 20 万样本时标准误 <= 0.0012，3σ 容差 0.005
  const TOL = 0.005;
  const SAMPLES = 200_000;

  for (const [name, weights] of cases) {
    it(`${name} 落在 3σ 内`, () => {
      for (const up of [0.002, 0.01, 0.03]) {
        const mc = monteCarlo(weights, up, SAMPLES);
        expect(Math.abs(upProb(weights, up) - mc)).toBeLessThan(TOL);
      }
    });
  }
});

describe('upProb — 大规模 hit 不发散', () => {
  it('n=108（6 体多段）条件数超限时回退但仍有限', () => {
    const weights = Array.from({ length: 6 }, () =>
      [...Array(10).fill(1), 0.5, 0.5, 0.25, 0.25, 0.12, 0.12, 0.06, 0.06],
    ).flat();
    expect(weights).toHaveLength(108);

    for (const up of [0, 0.005, 0.01, 0.03, 0.06, 0.09]) {
      const p = upProb(weights, up);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('极端权重不产生 NaN / Infinity', () => {
    for (const weights of [[1, 1e-6], [1000, 1], [1e6, 1, 1], Array(50).fill(1)]) {
      for (const up of [-0.05, 0, 0.05]) {
        expect(Number.isFinite(upProb(weights, up))).toBe(true);
      }
    }
  });

  it('非法权重（0 / 负数）被拒绝而不崩溃', () => {
    expect(Number.isFinite(upProb([0, 1, 1], 0.01))).toBe(true);
    expect(Number.isFinite(upProb([-1, 1, 1], 0.01))).toBe(true);
  });
});

describe('computeFloatDistribution', () => {
  it('返回 numPoints 个点，且 pdf 峰值为正', () => {
    const d = computeFloatDistribution([1, 1, 1, 1, 1], 200);
    expect(d.points).toHaveLength(200);
    expect(d.exact).toBe(true);
    expect(d.maxPdf).toBeGreaterThan(0);
    expect(d.totalWeight).toBe(5);
  });

  it('生存曲线单调不增，pdf 非负且左右对称', () => {
    const d = computeFloatDistribution([1, 1, 1, 0.5], 200);
    for (let i = 1; i < d.points.length; i++) {
      expect(d.points[i].survival).toBeLessThanOrEqual(d.points[i - 1].survival + 1e-12);
    }
    for (const p of d.points) {
      expect(p.pdf).toBeGreaterThanOrEqual(0);
      expect(p.survival).toBeGreaterThanOrEqual(0);
      expect(p.survival).toBeLessThanOrEqual(1);
    }
    // pdf 关于 up=0 对称
    const left = d.points[10].pdf;
    const right = d.points[d.points.length - 11].pdf;
    expect(left).toBeCloseTo(right, 8);
  });

  it('空权重返回空结果', () => {
    const d = computeFloatDistribution([], 200);
    expect(d.points).toHaveLength(0);
    expect(d.maxPdf).toBe(0);
  });
});

describe('parseWeightString', () => {
  it('支持逗号 / 空白 / 中文逗号分隔', () => {
    expect(parseWeightString('0.3, 0.3, 0.4')).toEqual([0.3, 0.3, 0.4]);
    expect(parseWeightString('0.5 0.5')).toEqual([0.5, 0.5]);
    expect(parseWeightString('1，1；0.5')).toEqual([1, 1, 0.5]);
  });

  it('空串 / 非正数 / 非法输入返回 null', () => {
    expect(parseWeightString('')).toBeNull();
    expect(parseWeightString('   ')).toBeNull();
    expect(parseWeightString('1, 0, 2')).toBeNull();
    expect(parseWeightString('1, -2')).toBeNull();
    expect(parseWeightString('abc')).toBeNull();
  });
});

describe('buildHitWeights', () => {
  it('默认本体 hit 权重为 1.0，连击按倍率追加', () => {
    expect(buildHitWeights(3, 1, 1, 1, 1)).toEqual([1, 1, 1, 0.5, 0.25, 0.12, 0.06]);
  });

  it('自定义本体权重直接替换本体部分，不缩放', () => {
    expect(buildHitWeights(7, 0, 0, 0, 0, [0.05, 0.65])).toEqual([0.05, 0.65]);
    expect(buildHitWeights(7, 1, 0, 0, 0, [0.05, 0.65])).toEqual([0.05, 0.65, 0.5]);
  });
});
