/**
 * Replicates Cell 3 of the Python notebook — static Beta sampling competition.
 *
 * IMPORTANT MODEL DIFFERENCE from lib/simulation.ts (Thompson bandit):
 *   In Cell 3, `signal` is the Beta CONCENTRATION parameter, not an effect size.
 *   signal=4  → base labels ~ Beta(3.0, 1.0),  learned ~ Beta(3.4, 0.6)
 *   signal=100 → base labels ~ Beta(75, 25),   learned ~ Beta(85, 15)
 *   Each round draws fresh samples from fixed distributions; posteriors never update.
 *
 * Formula structure:
 *   2 formulas  × 2 components
 *   23 formulas × 3 components
 *   10 formulas × 4 components
 *   = 35 formulas total
 *
 * Learned labels: variant 0 of each component type (5 labels across 38 total).
 *
 * Run: npx tsx scripts/test-cell3.ts
 */

import { BetaSampler, digamma, computeSpearman } from '../lib/simulation.js';

// ---------------------------------------------------------------------------
// Component structure
// ---------------------------------------------------------------------------
const COMPONENTS: [string, number][] = [
  ['Incentive',        2],
  ['ValueProposition', 9],
  ['Greeting',         6],
  ['Offering',        15],
  ['CallToAction',     6],
];

// Build label registry: each component owns a contiguous slice of global IDs
const compRanges: Record<string, number[]> = {};
let gid = 0;
for (const [name, n] of COMPONENTS) {
  compRanges[name] = Array.from({ length: n }, () => gid++);
}
const N_LABELS = gid; // 38

// Learned labels = variant 0 of every component
const LEARNED = new Set(Object.values(compRanges).map(r => r[0]));

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — analogous to numpy.random.RandomState(456)
// Results will differ from numpy bit-for-bit but share the same distribution.
// ---------------------------------------------------------------------------
let _seed = 456;
function rand(): number {
  _seed |= 0;
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickFrom = (arr: number[]) => arr[Math.floor(rand() * arr.length)];

// ---------------------------------------------------------------------------
// Formula builder (mirrors build_formulas_for_subset)
// ---------------------------------------------------------------------------
interface Formula { labelIds: number[]; nLearned: number }

function buildFormulas(compSubset: string[], n: number): Formula[] {
  const out: Formula[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (out.length < n && attempts < 10_000) {
    attempts++;
    const lids = compSubset.map(c => pickFrom(compRanges[c]));
    const key  = [...lids].sort((a, b) => a - b).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ labelIds: lids, nLearned: lids.filter(id => LEARNED.has(id)).length });
    }
  }
  return out;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return arr.flatMap((v, i) =>
    combinations(arr.slice(i + 1), k - 1).map(rest => [v, ...rest]),
  );
}

// Shuffle a copy with the seeded PRNG (Fisher-Yates)
function seededShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const compNames = COMPONENTS.map(([name]) => name);
const combos3   = seededShuffle(combinations(compNames, 3));
const combos4   = seededShuffle(combinations(compNames, 4));

const formulas: Formula[] = [
  // 2-component (predefined, same as notebook)
  ...buildFormulas(['Greeting',  'CallToAction'], 1),
  ...buildFormulas(['Incentive', 'CallToAction'], 1),
];

// 3-component: spread across all 10 combos of 3-from-5 (~2-3 formulas per combo)
let need3 = 23;
for (const combo of combos3) {
  if (need3 <= 0) break;
  const perCombo = Math.ceil(need3 / (combos3.length - combos3.indexOf(combo)));
  const f = buildFormulas(combo, Math.min(perCombo, need3));
  formulas.push(...f);
  need3 -= f.length;
}

// 4-component: spread across all 5 combos of 4-from-5 (~2 formulas per combo)
let need4 = 10;
for (const combo of combos4) {
  if (need4 <= 0) break;
  const f = buildFormulas(combo, Math.min(2, need4));
  formulas.push(...f);
  need4 -= f.length;
}

const N_GROUPS  = formulas.length;
const groupSize = formulas.map(f => f.labelIds.length);

// ---------------------------------------------------------------------------
// Simulation parameters
// ---------------------------------------------------------------------------
const SIGNAL_LEVELS = [4, 8, 16, 40, 100];
const N_ROUNDS      = 50_000;   // notebook uses 200k; halved for speed
const BASE_PROB     = 0.75;
const LEARNED_PROB  = 0.85;

// Print setup summary
console.log('Component structure:');
for (const [name, n] of COMPONENTS) {
  const r = compRanges[name];
  const lrn = r.filter(id => LEARNED.has(id)).length;
  console.log(`  ${name.padEnd(20)} ${n} labels  (${lrn} learned)`);
}
console.log(`Total labels: ${N_LABELS}`);
console.log(`Learned label IDs: [${[...LEARNED].sort((a, b) => a - b).join(', ')}]`);
console.log(`\nFormulas: ${N_GROUPS} total`);
for (const size of [2, 3, 4]) {
  const count = formulas.filter(f => f.labelIds.length === size).length;
  console.log(`  ${size}-component: ${count} formulas`);
}
const learnedCounts = formulas.map(f => f.nLearned);
console.log(`Learned labels per formula: min=${Math.min(...learnedCounts)}, max=${Math.max(...learnedCounts)}, mean=${(learnedCounts.reduce((a, b) => a + b, 0) / N_GROUPS).toFixed(1)}`);
console.log(`\nRounds per signal: ${N_ROUNDS.toLocaleString()}  (notebook: 200,000)`);

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(50));
console.log('RANK FIDELITY: Spearman ρ (E[geomean] vs win rate)');
console.log('='.repeat(50));
console.log(`\n${'Signal'.padStart(8)} ${'learnedProb'.padStart(12)} ${'Raw ρ'.padStart(8)} ${'√n ρ'.padStart(8)}`);
console.log('-'.repeat(40));

const t0 = Date.now();

for (const signal of SIGNAL_LEVELS) {
  // Per-label Beta parameters
  const alphas = new Float64Array(N_LABELS).fill(BASE_PROB    * signal);
  const betas  = new Float64Array(N_LABELS).fill((1 - BASE_PROB) * signal);
  for (const lid of LEARNED) {
    alphas[lid] = LEARNED_PROB    * signal;
    betas[lid]  = (1 - LEARNED_PROB) * signal;
  }

  // Analytical E[log X] per label → expected log-geomean per group → μ_g
  const eLogPerLabel = Float64Array.from({ length: N_LABELS }, (_, lid) =>
    digamma(alphas[lid]) - digamma(alphas[lid] + betas[lid]),
  );
  const mu_g = formulas.map(f =>
    f.labelIds.reduce((s, lid) => s + eLogPerLabel[lid], 0) / f.labelIds.length,
  );
  const eGeomean = mu_g.map(Math.exp);

  // Sampling competition
  const rawWins  = new Int32Array(N_GROUPS);
  const sqrtWins = new Int32Array(N_GROUPS);

  for (let r = 0; r < N_ROUNDS; r++) {
    let bestRaw  = -Infinity, bestRawIdx  = 0;
    let bestSqrt = -Infinity, bestSqrtIdx = 0;

    for (let gi = 0; gi < N_GROUPS; gi++) {
      const { labelIds } = formulas[gi];
      const n = labelIds.length;

      // Draw one Beta sample per label, compute log-geomean
      let logSum = 0;
      for (const lid of labelIds) {
        logSum += Math.log(BetaSampler.sample(alphas[lid], betas[lid]));
      }
      const logGeoMean = logSum / n;
      const geomean    = Math.exp(logGeoMean);

      // Raw score
      if (geomean > bestRaw) { bestRaw = geomean; bestRawIdx = gi; }

      // √n corrected score: μ + √n · (logGeoMean − μ)
      const corrected = mu_g[gi] + Math.sqrt(n) * (logGeoMean - mu_g[gi]);
      if (corrected > bestSqrt) { bestSqrt = corrected; bestSqrtIdx = gi; }
    }

    rawWins[bestRawIdx]++;
    sqrtWins[bestSqrtIdx]++;
  }

  // Spearman ρ
  const rawRho  = computeSpearman(eGeomean, Array.from(rawWins));
  const sqrtRho = computeSpearman(eGeomean, Array.from(sqrtWins));

  console.log(
    `${String(signal).padStart(8)} ${String(Math.min(BASE_PROB + signal / 100, 1).toFixed(2)).padStart(12)}` +
    ` ${rawRho.toFixed(3).padStart(8)} ${sqrtRho.toFixed(3).padStart(8)}`,
  );
}

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('\nNOTE: Formula assignments differ from numpy (different PRNG) — patterns');
console.log('should match the notebook direction but exact ρ values will vary.');
console.log('Paste the notebook\'s "RANK FIDELITY" table here to compare.');
