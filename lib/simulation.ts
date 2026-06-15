import jStat from 'jstat';

// ---------------------------------------------------------------------------
// Digamma  ψ(x) = d/dx ln Γ(x)
// Recurrence  ψ(x) = ψ(x+1) - 1/x  lifts x to ≥ 6, then the asymptotic
// series (Stirling-type) converges fast enough for 1e-8 accuracy.
//
// Asymptotic:  ψ(x) ~ ln x - 1/(2x) - Σ B_{2n} / (2n · x^{2n})
// Coefficients: n=1..7, B_2=1/6, B_4=-1/30, B_6=1/42, B_8=-1/30,
//               B_10=5/66, B_12=-691/2730, B_14=7/6
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
// Recurrence  ψ'(x) = ψ'(x+1) + 1/x²  lifts x to ≥ 6, then:
//
// Asymptotic:  ψ'(x) ~ 1/x + 1/(2x²) + Σ B_{2n} / x^{2n+1}
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
  /** Observable effect size (learnedProb - baseProb) passed by the caller. */
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
  /** Analytical geometric mean of converged Beta posteriors via digamma. */
  expectedGeomean: number;
  /** Precision@nLearned: fraction of truly learned labels in the top-nLearned positions. */
  rawPct: number;
  /** Inter-group win rate after correction (correctedWins / (nGroups - 1)). */
  correctedPct: number;
  /** Number of other groups this group outscores on raw geometric mean. */
  rawWins: number;
  /** Number of other groups this group outscores after applying the correction. */
  correctedWins: number;
}

// ---------------------------------------------------------------------------
// Analytical expected geometric mean using digamma
//
// For X ~ Beta(α, β):  E[ln X] = ψ(α) - ψ(α + β)
// We approximate each label's converged posterior by assuming equal splits of
// Thompson traffic, yielding Beta(1 + p·r, 1 + (1-p)·r) after r rounds/label.
// ---------------------------------------------------------------------------
function computeExpectedGeomean(
  nLabels: number,
  nLearned: number,
  learnedProb: number,
  baseProb: number,
  nRounds: number,
): number {
  const r = nRounds / nLabels; // expected rounds per label under uniform traffic

  const alphaL = 1 + learnedProb * r,  betaL = 1 + (1 - learnedProb) * r;
  const alphaB = 1 + baseProb   * r,   betaB = 1 + (1 - baseProb)    * r;

  const eLogLearned = digamma(alphaL) - digamma(alphaL + betaL);
  const eLogBase    = digamma(alphaB) - digamma(alphaB + betaB);

  const avgLog = (nLearned * eLogLearned + (nLabels - nLearned) * eLogBase) / nLabels;
  return Math.exp(avgLog);
}

// ---------------------------------------------------------------------------
// Correction methods (applied to the group-level raw geometric mean)
// ---------------------------------------------------------------------------
function applyCorrection(
  rawGeomean: number,
  nLearned: number,
  posteriorMeans: number[],
  method: SimulationParams['correctionMethod'],
  /** log of the analytically-expected geomean — used as the reference μ for sqrt_n */
  expectedLogGeomean: number,
): number {
  switch (method) {
    case 'sqrt_n': {
      // Log-space correction matching the Python notebook formula:
      //   corrected = μ + √n · (log(geomean) − μ)
      // where μ = E[log(geomean)] for a group of this size.
      // Equalises within-group variance across sizes so groups compete on signal.
      const noise = Math.log(rawGeomean) - expectedLogGeomean;
      return expectedLogGeomean + Math.sqrt(posteriorMeans.length) * noise;
    }

    case 'trigamma': {
      // Fisher-information-based correction via trigamma variance proxy
      const variance = trigamma(Math.max(nLearned, 1) + 1);
      return rawGeomean / Math.sqrt(variance);
    }

    case 'rank': {
      // Rank-based: precision@nLearned (fraction of truly learned labels in top-nLearned)
      // Labels at index < nLearned are truly learned (matching how trueProbs are built).
      const sorted = posteriorMeans
        .map((p, i) => ({ p, i }))
        .sort((a, b) => b.p - a.p);
      const hits = sorted.slice(0, Math.max(nLearned, 1)).filter(({ i }) => i < nLearned).length;
      return hits / Math.max(nLearned, 1);
    }

    default:
      return rawGeomean;
  }
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------
export function runSimulation(params: SimulationParams): SimulationResult[] {
  const { nRounds, baseProb, learnedProb, correctionMethod, groups } = params;
  const nGroups = groups.length;

  // --- Per-group Thompson sampling ---
  const scratch = groups.map(({ id, nLabels, nLearned }) => {
    // Beta(1,1) priors for every label
    const alpha = new Array<number>(nLabels).fill(1);
    const beta  = new Array<number>(nLabels).fill(1);

    // First nLearned labels are truly learned
    const trueProbs = Array.from({ length: nLabels }, (_, i) =>
      i < nLearned ? learnedProb : baseProb,
    );

    for (let round = 0; round < nRounds; round++) {
      // Thompson sampling: draw one sample per arm
      let maxSample = -Infinity;
      let winner    = 0;
      for (let j = 0; j < nLabels; j++) {
        const s = BetaSampler.sample(alpha[j], beta[j]);
        if (s > maxSample) { maxSample = s; winner = j; }
      }

      // Bernoulli reward → update posterior
      const reward = Math.random() < trueProbs[winner] ? 1 : 0;
      alpha[winner] += reward;
      beta[winner]  += 1 - reward;
    }

    const posteriorMeans = alpha.map((a, i) => a / (a + beta[i]));

    // Geometric mean of all posterior means (guarded against log(0))
    const logSum = posteriorMeans.reduce((s, p) => s + Math.log(Math.max(p, Number.EPSILON)), 0);
    const rawGeomean = Math.exp(logSum / nLabels);

    // Precision@nLearned (within-group quality)
    const sorted = [...posteriorMeans]
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p - a.p);
    const hits = sorted.slice(0, Math.max(nLearned, 1)).filter(({ i }) => i < nLearned).length;
    const rawPct = hits / Math.max(nLearned, 1);

    const expectedGeomean = computeExpectedGeomean(nLabels, nLearned, learnedProb, baseProb, nRounds);
    const correctedScore  = applyCorrection(rawGeomean, nLearned, posteriorMeans, correctionMethod, Math.log(expectedGeomean));

    return { id, nLabels, nLearned, rawGeomean, correctedScore, rawPct, expectedGeomean };
  });

  // --- Inter-group win counts ---
  return scratch.map((g, i) => {
    let rawWins = 0, correctedWins = 0;
    for (let j = 0; j < nGroups; j++) {
      if (j === i) continue;
      if (g.rawGeomean    > scratch[j].rawGeomean)    rawWins++;
      if (g.correctedScore > scratch[j].correctedScore) correctedWins++;
    }
    const denominator  = Math.max(nGroups - 1, 1);
    return {
      groupId:       g.id,
      nLabels:       g.nLabels,
      nLearned:      g.nLearned,
      expectedGeomean: g.expectedGeomean,
      rawPct:        g.rawPct,
      correctedPct:  correctedWins / denominator,
      rawWins,
      correctedWins,
    };
  });
}

// ---------------------------------------------------------------------------
// Spearman ρ
// Ranks are averaged over ties (fractional ranking).
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
      const avg = (i + j - 1) / 2; // 0-based average rank
      for (let k = i; k < j; k++) ranks[indexed[k].i] = avg;
      i = j;
    }
    return ranks;
  }

  const rx = fractionalRanks(x);
  const ry = fractionalRanks(y);

  // Pearson r on ranks
  const meanR = (n - 1) / 2; // mean of 0-based ranks
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
