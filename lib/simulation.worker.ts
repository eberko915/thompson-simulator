// Runs in a DedicatedWorkerGlobalScope at runtime.
import {
  digamma,
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
// Helper: expected geometric mean using fixed Beta concentration.
// Mirrors computeExpectedGeomean from simulation.ts (kept local so the worker
// can compute it without importing the unexported version).
// ---------------------------------------------------------------------------
function expectedGeomean(
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
// Message handler
// ---------------------------------------------------------------------------
ctx.addEventListener('message', (event: MessageEvent<InMessage>) => {

  // ── Sweep: run one simulation per signal level, report Spearman ρ each time ──
  if (event.data.type === 'sweep') {
    const { baseParams, signals } = event.data;
    try {
      post({ type: 'progress', pct: 0 });
      const results: RankFidelityResult[] = [];

      for (let i = 0; i < signals.length; i++) {
        const signal = signals[i];

        const raw       = runSimulation({ ...baseParams, signal, correctionMethod: 'none' });
        const corrected = runSimulation({ ...baseParams, signal });

        const expectedGeomeans = baseParams.groups.map(g =>
          expectedGeomean(g.nLabels, g.nLearned, baseParams.learnedProb, baseParams.baseProb, signal)
        );

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

  // ── Single run ──
  if (event.data.type === 'run') {
    try {
      post({ type: 'progress', pct: 0 });
      const results = runSimulation(event.data.params);
      post({ type: 'result', results });
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
});
