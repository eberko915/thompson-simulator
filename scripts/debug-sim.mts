import { runSimulation } from '../lib/simulation.ts';

// Mirror cell 0 of the notebook: 17 groups of 2 labels + 32 groups of 3 labels,
// all same Beta(3,1) — no learned/base distinction. Fair win rate = group count share.
const params = {
  nRounds: 200_000,
  signal: 4,          // α = prob*4 = 3, β = (1-prob)*4 = 1 → Beta(3,1) at baseProb=0.75
  baseProb: 0.75,
  learnedProb: 0.75,  // same as base → no signal, pure size-bias test
  correctionMethod: 'sqrt_n' as const,
  groups: [
    ...Array.from({ length: 17 }, (_, i) => ({
      id: `group_${String(i + 1).padStart(2, '0')}`,
      nLabels: 2,
      nLearned: 0,
    })),
    ...Array.from({ length: 32 }, (_, i) => ({
      id: `group_${String(i + 18).padStart(2, '0')}`,
      nLabels: 3,
      nLearned: 0,
    })),
  ],
};

const noop = () => {};
const TRIALS = 1;

for (let t = 0; t < TRIALS; t++) {
  const orig = console.log; console.log = noop;
  const results = runSimulation(params);
  console.log = orig;

  const twoLabel = results.filter(r => r.nLabels === 2);
  const threeLabel = results.filter(r => r.nLabels === 3);
  const rawTwo  = twoLabel.reduce((s, r) => s + r.rawWins, 0);
  const rawThree = threeLabel.reduce((s, r) => s + r.correctedWins, 0);  // note: using correctedWins for corrected

  // Actually compute properly
  const rawTwoTotal  = twoLabel.reduce((s, r) => s + r.rawPct * 100, 0);
  const rawThreeTotal = threeLabel.reduce((s, r) => s + r.rawPct * 100, 0);
  const corrTwoTotal  = twoLabel.reduce((s, r) => s + r.correctedPct * 100, 0);
  const corrThreeTotal = threeLabel.reduce((s, r) => s + r.correctedPct * 100, 0);

  console.log(`\n=== TRIAL ${t + 1} ===`);
  console.log(`Fair share: 2-label = ${(17/49*100).toFixed(1)}%   3-label = ${(32/49*100).toFixed(1)}%`);
  console.log(`Uncorrected:  2-label = ${rawTwoTotal.toFixed(1)}%   3-label = ${rawThreeTotal.toFixed(1)}%`);
  console.log(`√n corrected: 2-label = ${corrTwoTotal.toFixed(1)}%   3-label = ${corrThreeTotal.toFixed(1)}%`);
}
