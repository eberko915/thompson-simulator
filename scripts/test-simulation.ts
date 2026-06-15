/**
 * Replicates Cell 1 of the Python notebook:
 *   17 groups × 2 labels  +  32 groups × 3 labels
 *   All arms sampled from Beta(3,1), 200 000 rounds.
 *
 * Run:  npx tsx scripts/test-simulation.ts
 *   or  npx ts-node --esm scripts/test-simulation.ts
 *
 * === Interpretation confirmed by this script ===
 *
 * "200 000 rounds" = 200 000 independent sampling competitions (no learning).
 * Each competition:
 *   – draw n fresh Beta(3,1) samples for each group (n = nLabels)
 *   – compute geometric mean for each group
 *   – apply correction (optional)
 *   – group with highest (corrected) geomean wins the competition
 * Metric = fraction of the 200 000 competitions won by each size class.
 *
 * === Formula (from Python notebook Cell 1) ===
 *
 * mu = E[log X] for X ~ Beta(alpha, beta) = digamma(alpha) - digamma(alpha+beta)
 * corrected = mu + sqrt(n) * (log(geomean) - mu)
 *
 * This amplifies deviation from the expected log value by sqrt(n), equalising
 * within-group variance across sizes. After normalisation the 3-label class
 * wins more often simply because it has more groups (32 vs 17 → higher order-
 * statistic max).
 *
 * Expected (notebook Cell 1):
 *   Uncorrected — 2-label ~60.6 %, 3-label ~39.5 %   ✓
 *   sqrt_n      — 2-label ~14.1 %, 3-label ~85.9 %   ✓
 */

import { BetaSampler, digamma } from '../lib/simulation.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const ALPHA    = 3;
const BETA_SHP = 1;
const N_REPS   = 200_000;

// E[log X] for X ~ Beta(ALPHA, BETA_SHP)
const MU = digamma(ALPHA) - digamma(ALPHA + BETA_SHP);
const N_2LABEL = 17;
const N_3LABEL = 32;

// ---------------------------------------------------------------------------
// Sampling competition
// ---------------------------------------------------------------------------
interface CompetitionResult {
  raw:       { two: number; three: number };
  corrected: { two: number; three: number };
  /** corrected formula description, for the report */
  corrLabel: string;
}

function sampleGeomean(n: number): number {
  let logSum = 0;
  for (let i = 0; i < n; i++) logSum += Math.log(BetaSampler.sample(ALPHA, BETA_SHP));
  return Math.exp(logSum / n);
}

function runCompetition(
  nReps: number,
  corrFn: (g: number, n: number) => number,
  corrLabel: string,
): CompetitionResult {
  let wins2Raw = 0, wins2Corr = 0;

  for (let r = 0; r < nReps; r++) {
    let max2Raw = -Infinity, max3Raw = -Infinity;
    let max2Corr = -Infinity, max3Corr = -Infinity;

    for (let i = 0; i < N_2LABEL; i++) {
      const g = sampleGeomean(2);
      if (g                  > max2Raw)  max2Raw  = g;
      if (corrFn(g, 2)       > max2Corr) max2Corr = corrFn(g, 2);
    }
    for (let i = 0; i < N_3LABEL; i++) {
      const g = sampleGeomean(3);
      if (g                  > max3Raw)  max3Raw  = g;
      if (corrFn(g, 3)       > max3Corr) max3Corr = corrFn(g, 3);
    }

    if (max2Raw  > max3Raw)  wins2Raw++;
    if (max2Corr > max3Corr) wins2Corr++;
  }

  return {
    raw:       { two: wins2Raw  / nReps, three: 1 - wins2Raw  / nReps },
    corrected: { two: wins2Corr / nReps, three: 1 - wins2Corr / nReps },
    corrLabel,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

console.log(`Running ${N_REPS.toLocaleString()} Beta(${ALPHA},${BETA_SHP}) sampling competitions…`);
const t0 = Date.now();

const result = runCompetition(
  N_REPS,
  (g, n) => MU + Math.sqrt(n) * (Math.log(g) - MU),
  'μ + √n · (log(geomean) − μ)',
);

console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('Uncorrected (raw geometric mean):');
console.log(`  2-label: ${pct(result.raw.two).padStart(7)}   expected ~60.6 %`);
console.log(`  3-label: ${pct(result.raw.three).padStart(7)}   expected ~39.5 %`);

console.log(`\nCorrected (${result.corrLabel}):`);
console.log(`  2-label: ${pct(result.corrected.two).padStart(7)}   expected ~14.1 %`);
console.log(`  3-label: ${pct(result.corrected.three).padStart(7)}   expected ~85.9 %`);

// ---------------------------------------------------------------------------
// Tolerance checks
// ---------------------------------------------------------------------------
const TOLERANCE_UNCORR = 5;  // pp
const TOLERANCE_CORR   = 5;  // pp

interface Check { label: string; got: number; want: number; tol: number }

function check({ label, got, want, tol }: Check): boolean {
  const diff = Math.abs(got * 100 - want);
  const ok   = diff <= tol;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${pct(got)} vs ~${want} %  Δ=${diff.toFixed(1)} pp  [tol ±${tol} pp]`);
  return ok;
}

console.log('\nTolerance checks:');
const checks = [
  { label: 'uncorrected 2-label', got: result.raw.two,       want: 60.6, tol: TOLERANCE_UNCORR },
  { label: 'uncorrected 3-label', got: result.raw.three,     want: 39.5, tol: TOLERANCE_UNCORR },
  { label: 'corrected 2-label',   got: result.corrected.two, want: 14.1, tol: TOLERANCE_CORR   },
  { label: 'corrected 3-label',   got: result.corrected.three, want: 85.9, tol: TOLERANCE_CORR },
];
const allPass = checks.map(check).every(Boolean);

if (!allPass) {
  console.log('\nOne or more checks failed — review the formula or expected values.');
}

process.exit(allPass ? 0 : 1);
