import { TurnPlannerState, ComputedTurnResult } from '../types';

/**
 * Compute per-turn SP, OD, and DR.
 * OD is deducted simply during the OD turn (no 前置/后置 distinction).
 */
export function computeTurnPlanner(state: TurnPlannerState): ComputedTurnResult[] {
  const { odMode, characters, turns, defaultPassiveOD } = state;
  const results: ComputedTurnResult[] = [];

  const sp: number[] = characters.map(c => c.sp);
  let odAssist = 0;
  let odCap = 0;
  let cumulativeDR = 0;
  let totalBossDR = 0;

  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    totalBossDR += turn.bossDR;

    const odLevel = getODLevel(turn.roundLabel);
    const odCost = odLevel ? (odMode / 3) * odLevel : 0;

    // ── SP ────────────────────────────────────────────────
    for (const fa of turn.frontActions) {
      if (fa.charIndex >= 0 && fa.charIndex < 6) {
        sp[fa.charIndex] = sp[fa.charIndex] - fa.spCost + fa.spGain;
      }
    }
    const frontIndices = new Set(turn.frontActions.map(a => a.charIndex).filter(i => i >= 0));
    for (let i = 0; i < 6; i++) {
      if (!frontIndices.has(i)) {
        const backIdx = [0, 1, 2, 3, 4, 5].filter(j => !frontIndices.has(j)).indexOf(i);
        if (backIdx >= 0 && backIdx < 3) sp[i] += turn.backSPGain[backIdx];
      }
    }

    // ── OD (前/后置无区别，统一在回合中扣减) ──────────────
    const frontOD = turn.frontActions.reduce((s, a) => s + a.odGain, 0);
    const isOD = isODRound(turn.roundLabel);

    // OD turn: deduct cost
    if (isOD) {
      odAssist = odCap - odCost;
    }

    // Add gains
    const passiveBonus = ti === 0 ? defaultPassiveOD : 0;
    odAssist += frontOD + turn.jailOD + turn.passiveOD + passiveBonus;

    // Cap
    odCap = Math.min(odAssist, odMode);

    // ── DR ────────────────────────────────────────────────
    const frontDR = turn.frontActions.reduce((s, a) => s + a.dr, 0);
    cumulativeDR += frontDR;
    const remainingDR = totalBossDR > 0 ? Math.max(0, totalBossDR - cumulativeDR) : 0;

    results.push({
      sp: [...sp],
      odAssist: odAssist,
      odCapped: odCap,
      cumulativeDR,
      remainingDR,
    });
  }

  return results;
}

function isODRound(label: string): boolean { return label.includes('OD'); }

function getODLevel(label: string): number {
  if (label.includes('OD3')) return 3;
  if (label.includes('OD2')) return 2;
  if (label.includes('OD1')) return 1;
  return 0;
}

export function createDefaultState(): TurnPlannerState {
  const emptyChar = { name: '', sp: 0 };
  const emptyFA = { charIndex: -1, action: '', spCost: 0, spGain: 0, odGain: 0, dr: 0 };
  const defaultTurns = Array.from({ length: 10 }, (_, i) => ({
    roundLabel: String(i + 1),
    turnType: 'normal' as const,
    frontActions: [emptyFA, emptyFA, emptyFA] as [typeof emptyFA, typeof emptyFA, typeof emptyFA],
    backSPGain: [0, 0, 0] as [number, number, number],
    jailOD: 0, passiveOD: 0, bossDR: 0,
  }));

  return {
    odMode: 300,
    defaultPassiveOD: 0,
    showBreak: false,
    characters: [emptyChar, emptyChar, emptyChar, emptyChar, emptyChar, emptyChar] as TurnPlannerState['characters'],
    turns: defaultTurns,
  };
}
