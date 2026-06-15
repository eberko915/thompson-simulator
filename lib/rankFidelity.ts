import { SimulationParams, runSimulation, computeSpearman } from './simulation';

export interface RankFidelityResult {
  signal: number;
  rawRho: number;
  correctedRho: number;
}

/**
 * Sweeps over signal levels, running two simulations per level:
 *   1. correctionMethod = 'none'    → rawWins    → rawRho
 *   2. correctionMethod = params.correctionMethod → correctedWins → correctedRho
 *
 * Each signal level is treated as percentage points above baseProb:
 *   learnedProb = baseProb + signal / 100   (clamped to [0, 1])
 *
 * Spearman ρ is computed across groups, comparing expectedGeomean
 * (analytical, via digamma) against per-group win counts.
 */
export function sweepSignalLevels(
  baseParams: SimulationParams,
  signalLevels: number[],
): RankFidelityResult[] {
  return signalLevels.map((signal) => {
    const learnedProb = Math.min(baseParams.baseProb + signal / 100, 1);

    const sharedOverrides = { signal, learnedProb };

    const rawResults = runSimulation({
      ...baseParams,
      ...sharedOverrides,
      correctionMethod: 'none',
    });

    const correctedResults = runSimulation({
      ...baseParams,
      ...sharedOverrides,
    });

    // expectedGeomean is analytical — identical across both runs for the same params
    const expectedGeomeans = rawResults.map((r) => r.expectedGeomean);
    const rawWins          = rawResults.map((r) => r.rawWins);
    const correctedWins    = correctedResults.map((r) => r.correctedWins);

    return {
      signal,
      rawRho:       computeSpearman(expectedGeomeans, rawWins),
      correctedRho: computeSpearman(expectedGeomeans, correctedWins),
    };
  });
}
