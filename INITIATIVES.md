# Future Initiatives

## 1. Thompson Sampling Round-by-Round Simulation
Replace the current static Beta sampling approach with a full iterative Thompson Sampling simulation. Each round would: draw a Thompson sample from each label's current posterior, pick the winner, observe a Bernoulli reward, and update that label's Beta posterior. This models how the system actually runs in production and lets us study how the correction performs as posteriors evolve — not just at a fixed posterior snapshot. The challenge is that the expected geomean baseline (used for the √n correction) must then be derived from TS-weighted traffic allocation rather than the uniform-traffic digamma formula.

## 2. Signal Exploration
Investigate correction behavior across a wider range of signal configurations:
- Different base/learned probability pairs (not just 0.75/0.85)
- Asymmetric group compositions (varying nLearned/nLabels ratios, not just uniform signal)
- Interaction between signal strength and group size imbalance
- Identify the signal threshold at which the √n correction transitions from hurting to helping rank fidelity
