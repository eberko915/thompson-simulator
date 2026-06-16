import jStat from 'jstat';

// ---------------------------------------------------------------------------
// Digamma  ψ(x) = d/dx ln Γ(x)
// ---------------------------------------------------------------------------
export function digamma(x: number): number {
  if (x <= 0) throw new RangeError(`digamma requires x > 0, got ${x}`);
  let shift = 0;
  while (x < 6) { shift -= 1 / x; x += 1; }
  const t = 1 / (x * x);
  return (
    shift +
    Math.log(x) -
    0.5 / x +
    t * (-1/12 + t * (1/120 + t * (-1/252 + t * (1/240 + t * (-1/132 + t * (691/32760 + t * (-1/12)))))))
  );
}

// ---------------------------------------------------------------------------
// Trigamma  ψ'(x) = d²/dx² ln Γ(x)
// ---------------------------------------------------------------------------
export function trigamma(x: number): number {
  if (x <= 0) throw new RangeError(`trigamma requires x > 0, got ${x}`);
  let shift = 0;
  while (x < 6) { shift += 1 / (x * x); x += 1; }
  const ix = 1 / x;
  const t  = ix * ix;
  return (
    shift +
    ix +
    0.5 * t +
    ix * t * (1/6 + t * (-1/30 + t * (1/42 + t * (-1/30 + t * 5/66))))
  );
}

// ---------------------------------------------------------------------------
// Beta sampler backed by jStat
// ---------------------------------------------------------------------------
export class BetaSampler {
  static sample(alpha: number, beta: number): number {
    return jStat.beta.sample(alpha, beta);
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface GroupConfig {
  id: string;
  nLabels: number;
  nLearned: number;
}

export interface SimulationParams {
  nRounds: number;
  /** Beta concentration parameter: α = prob * signal, β = (1−prob) * signal. */
  signal: number;
  baseProb: number;
  learnedProb: number;
  correctionMethod: 'none' | 'sqrt_n' | 'trigamma' | 'rank';
  groups: GroupConfig[];
}

export interface SimulationResult {
  groupId: string;
  nLabels: number;
  nLearned: number;
  /** Analytical E[geometric mean] via digamma at the given signal level. */
  expectedGeomean: number;
  /** Raw win rate: fraction of rounds won on uncorrected log-geomean. */
  rawPct: number;
  /** Corrected win rate: fraction of rounds won on corrected score. */
  correctedPct: number;
  /** Total rounds won on raw log-geomean. */
  rawWins: number;
  /** Total rounds won on corrected score. */
  correctedWins: number;
}

// ---------------------------------------------------------------------------
// Analytical expected log-geometric-mean for a group.
//
// For X ~ Beta(α, β):  E[ln X] = ψ(α) − ψ(α + β)
// With α = prob * signal and β = (1−prob) * signal → α+β = signal.
//
// Returns exp(avgELog) as the expected geometric mean.
// ---------------------------------------------------------------------------
export function computeExpectedGeomean(
  nLabels: number,
  nLearned: number,
  learnedProb: number,
  baseProb: number,
  signal: number,
): number {
  const eLogLearned = digamma(learnedProb * signal) - digamma(signal);
  const eLogBase    = digamma(baseProb    * signal) - digamma(signal);
  const avgLog = (nLearned * eLogLearned + (nLabels - nLearned) * eLogBase) / nLabels;
  return Math.exp(avgLog);
}

// ---------------------------------------------------------------------------
// Per-round correction applied to the group's log-geometric-mean sample.
//
// sqrt_n: re-scales noise around the expected log-geomean by √n, equalising
//         variance across group sizes so that size alone does not determine wins.
// ---------------------------------------------------------------------------
function applyCorrection(
  logGeomean: number,
  mu: number,
  nLabels: number,
  method: SimulationParams['correctionMethod'],
): number {
  switch (method) {
    case 'sqrt_n': {
      // mu + √n · (log_gm − mu)  [matches Python notebook formula]
      return mu + Math.sqrt(nLabels) * (logGeomean - mu);
    }
    // trigamma and rank are not meaningful in this static-sampling regime;
    // fall through to raw so they can still be selected without crashing.
    default:
      return logGeomean;
  }
}

// ---------------------------------------------------------------------------
// Main simulation  (matches notebook approach: direct Beta sampling, no TS)
//
// Each round independently draws one Beta(α,β) sample per label per group,
// computes the log-geometric-mean, applies the correction, and crowns the
// argmax winner.  Win counts accumulate over nRounds.
// ---------------------------------------------------------------------------
export function runSimulation(params: SimulationParams): SimulationResult[] {
  const { nRounds, signal, baseProb, learnedProb, correctionMethod, groups } = params;
  const nGroups = groups.length;

  const baseAlpha    = baseProb    * signal;
  const baseBeta     = (1 - baseProb)    * signal;
  const learnedAlpha = learnedProb * signal;
  const learnedBeta  = (1 - learnedProb) * signal;

  // Pre-compute per-group expected log-geomean (mu) and expected geomean.
  const mu = groups.map(({ nLabels, nLearned }) => {
    const eLogLearned = digamma(learnedAlpha) - digamma(signal);
    const eLogBase    = digamma(baseAlpha)    - digamma(signal);
    return (nLearned * eLogLearned + (nLabels - nLearned) * eLogBase) / nLabels;
  });
  const expectedGeomeans = mu.map(Math.exp);

  const rawWins       = new Array<number>(nGroups).fill(0);
  const correctedWins = new Array<number>(nGroups).fill(0);

  for (let round = 0; round < nRounds; round++) {
    let bestRaw = -Infinity, bestCorrected = -Infinity;
    let winnerRaw = 0, winnerCorrected = 0;

    for (let gi = 0; gi < nGroups; gi++) {
      const { nLabels, nLearned } = groups[gi];

      // Draw one Beta sample per label and accumulate log-sum.
      let logSum = 0;
      for (let j = 0; j < nLabels; j++) {
        const a = j < nLearned ? learnedAlpha : baseAlpha;
        const b = j < nLearned ? learnedBeta  : baseBeta;
        logSum += Math.log(Math.max(BetaSampler.sample(a, b), Number.EPSILON));
      }
      const logGm = logSum / nLabels;

      if (logGm > bestRaw) { bestRaw = logGm; winnerRaw = gi; }

      const score = applyCorrection(logGm, mu[gi], nLabels, correctionMethod);
      if (score > bestCorrected) { bestCorrected = score; winnerCorrected = gi; }
    }

    rawWins[winnerRaw]++;
    correctedWins[winnerCorrected]++;
  }

  return groups.map((g, i) => ({
    groupId:         g.id,
    nLabels:         g.nLabels,
    nLearned:        g.nLearned,
    expectedGeomean: expectedGeomeans[i],
    rawWins:         rawWins[i],
    correctedWins:   correctedWins[i],
    rawPct:          rawWins[i] / nRounds,
    correctedPct:    correctedWins[i] / nRounds,
  }));
}

// ---------------------------------------------------------------------------
// Spearman ρ  (fractional ranking, averaged ties)
// ---------------------------------------------------------------------------
export function computeSpearman(x: number[], y: number[]): number {
  if (x.length !== y.length) throw new Error('Arrays must have equal length');
  const n = x.length;
  if (n === 0) return NaN;

  function fractionalRanks(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks   = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && indexed[j].v === indexed[i].v) j++;
      const avg = (i + j - 1) / 2;
      for (let k = i; k < j; k++) ranks[indexed[k].i] = avg;
      i = j;
    }
    return ranks;
  }

  const rx = fractionalRanks(x);
  const ry = fractionalRanks(y);

  const meanR = (n - 1) / 2;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanR;
    const dy = ry[i] - meanR;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}
