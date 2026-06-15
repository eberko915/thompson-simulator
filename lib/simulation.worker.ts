// Runs in a DedicatedWorkerGlobalScope at runtime.
// We avoid referencing that type directly (not in the project's lib) and instead
// narrow self to a minimal interface covering only what this file needs.
import {
  BetaSampler,
  digamma,
  trigamma,
  runSimulation,
  computeSpearman,
  SimulationParams,
  SimulationResult,
} from './simulation';
import type { RankFidelityResult } from './rankFidelity';

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------
export interface RunMessage        { type: 'run';         params: SimulationParams }
export interface SweepMessage      { type: 'sweep';       baseParams: SimulationParams; signals: number[] }
export interface ProgressMessage   { type: 'progress';    pct: number }
export interface ResultMessage     { type: 'result';      results: SimulationResult[] }
export interface SweepResultMessage{ type: 'sweepResult'; results: RankFidelityResult[] }
export interface ErrorMessage      { type: 'error';       message: string }

type InMessage  = RunMessage | SweepMessage;
type OutMessage = ProgressMessage | ResultMessage | SweepResultMessage | ErrorMessage;

interface WorkerCtx {
  addEventListener(type: 'message', handler: (ev: MessageEvent<InMessage>) => void): void;
  postMessage(data: OutMessage): void;
}
const ctx = self as unknown as WorkerCtx;

function post(msg: OutMessage): void {
  ctx.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Mirrors the unexported helpers in simulation.ts (same logic, needed here
// so we can interleave per-group progress posts inside the loop).
// ---------------------------------------------------------------------------
function expectedGeomean(
  nLabels: number,
  nLearned: number,
  learnedProb: number,
  baseProb: number,
  nRounds: number,
): number {
  const r      = nRounds / nLabels;
  const alphaL = 1 + learnedProb * r,  betaL = 1 + (1 - learnedProb) * r;
  const alphaB = 1 + baseProb    * r,  betaB = 1 + (1 - baseProb)    * r;
  const avgLog =
    (nLearned * (digamma(alphaL) - digamma(alphaL + betaL)) +
    (nLabels - nLearned) * (digamma(alphaB) - digamma(alphaB + betaB))) /
    nLabels;
  return Math.exp(avgLog);
}

function applyCorrection(
  raw: number,
  nLearned: number,
  posteriorMeans: number[],
  method: SimulationParams['correctionMethod'],
  expectedLogGeomean: number,
): number {
  switch (method) {
    case 'sqrt_n': {
      const noise = Math.log(raw) - expectedLogGeomean;
      return expectedLogGeomean + Math.sqrt(posteriorMeans.length) * noise;
    }
    case 'trigamma':
      return raw / Math.sqrt(trigamma(Math.max(nLearned, 1) + 1));
    case 'rank': {
      const sorted = posteriorMeans.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
      const hits   = sorted.slice(0, Math.max(nLearned, 1)).filter(({ i }) => i < nLearned).length;
      return hits / Math.max(nLearned, 1);
    }
    default:
      return raw;
  }
}

// ---------------------------------------------------------------------------
// Simulation with per-group progress
// Phase 1 (0–90 %): Thompson sampling, one group at a time
// Phase 2 (90–100 %): inter-group win counts → result
// ---------------------------------------------------------------------------
ctx.addEventListener('message', (event: MessageEvent<InMessage>) => {
  if (event.data.type === 'sweep') {
    const { baseParams, signals } = event.data;
    try {
      post({ type: 'progress', pct: 0 });
      const results: RankFidelityResult[] = [];

      for (let i = 0; i < signals.length; i++) {
        const signal      = signals[i];
        const learnedProb = Math.min(baseParams.baseProb + signal / 100, 1);
        const overrides   = { signal, learnedProb };

        const raw       = runSimulation({ ...baseParams, ...overrides, correctionMethod: 'none' });
        const corrected = runSimulation({ ...baseParams, ...overrides });

        const expectedGeomeans = raw.map(r => r.expectedGeomean);
        results.push({
          signal,
          rawRho:       computeSpearman(expectedGeomeans, raw.map(r => r.rawWins)),
          correctedRho: computeSpearman(expectedGeomeans, corrected.map(r => r.correctedWins)),
        });

        post({ type: 'progress', pct: Math.round(((i + 1) / signals.length) * 100) });
      }

      post({ type: 'sweepResult', results });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (event.data.type !== 'run') return;

  const { nRounds, baseProb, learnedProb, correctionMethod, groups } = event.data.params;
  const nGroups = groups.length;

  try {
    post({ type: 'progress', pct: 0 });

    // --- Phase 1: per-group Thompson sampling ---
    type Scratch = {
      id: string; nLabels: number; nLearned: number;
      rawGeomean: number; correctedScore: number;
      rawPct: number; geomean: number;
    };

    const scratch: Scratch[] = [];

    for (let gi = 0; gi < nGroups; gi++) {
      const { id, nLabels, nLearned } = groups[gi];

      const alpha = new Array<number>(nLabels).fill(1);
      const beta  = new Array<number>(nLabels).fill(1);

      const trueProbs = Array.from({ length: nLabels }, (_, i) =>
        i < nLearned ? learnedProb : baseProb,
      );

      for (let round = 0; round < nRounds; round++) {
        let maxSample = -Infinity, winner = 0;
        for (let j = 0; j < nLabels; j++) {
          const s = BetaSampler.sample(alpha[j], beta[j]);
          if (s > maxSample) { maxSample = s; winner = j; }
        }
        const reward = Math.random() < trueProbs[winner] ? 1 : 0;
        alpha[winner] += reward;
        beta[winner]  += 1 - reward;
      }

      const posteriorMeans = alpha.map((a, i) => a / (a + beta[i]));

      const logSum     = posteriorMeans.reduce((s, p) => s + Math.log(Math.max(p, Number.EPSILON)), 0);
      const rawGeomean = Math.exp(logSum / nLabels);

      const sorted = posteriorMeans.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
      const hits   = sorted.slice(0, Math.max(nLearned, 1)).filter(({ i }) => i < nLearned).length;
      const rawPct = hits / Math.max(nLearned, 1);

      const geomean       = expectedGeomean(nLabels, nLearned, learnedProb, baseProb, nRounds);
      const correctedScore = applyCorrection(rawGeomean, nLearned, posteriorMeans, correctionMethod, Math.log(geomean));

      scratch.push({ id, nLabels, nLearned, rawGeomean, correctedScore, rawPct, geomean });

      post({ type: 'progress', pct: Math.round(((gi + 1) / nGroups) * 90) });
    }

    // --- Phase 2: inter-group win counts ---
    const results: SimulationResult[] = scratch.map((g, i) => {
      let rawWins = 0, correctedWins = 0;
      for (let j = 0; j < nGroups; j++) {
        if (j === i) continue;
        if (g.rawGeomean     > scratch[j].rawGeomean)     rawWins++;
        if (g.correctedScore > scratch[j].correctedScore) correctedWins++;
      }
      const denom = Math.max(nGroups - 1, 1);
      return {
        groupId:        g.id,
        nLabels:        g.nLabels,
        nLearned:       g.nLearned,
        expectedGeomean: g.geomean,
        rawPct:         g.rawPct,
        correctedPct:   correctedWins / denom,
        rawWins,
        correctedWins,
      };
    });

    post({ type: 'result', results });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
