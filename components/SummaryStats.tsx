'use client';

import type { RankFidelityResult } from '../lib/rankFidelity';

interface Props {
  data: RankFidelityResult[];
}

// ── Derived stats ────────────────────────────────────────────────────────────

interface Stats {
  correctionCrossoverSignal: number | null; // first signal where correctedRho > rawRho
  strongFidelitySignal: number | null;      // first signal where correctedRho > 0.8
  maxRawRho: number | null;
  maxCorrectedRho: number | null;
}

function deriveStats(data: RankFidelityResult[]): Stats {
  if (data.length === 0) {
    return {
      correctionCrossoverSignal: null,
      strongFidelitySignal: null,
      maxRawRho: null,
      maxCorrectedRho: null,
    };
  }

  const sorted = [...data].sort((a, b) => a.signal - b.signal);

  const crossover = sorted.find(r => r.correctedRho > r.rawRho);
  const strong    = sorted.find(r => r.correctedRho > 0.8);

  const maxRaw  = Math.max(...sorted.map(r => r.rawRho));
  const maxCorr = Math.max(...sorted.map(r => r.correctedRho));

  return {
    correctionCrossoverSignal: crossover?.signal ?? null,
    strongFidelitySignal: strong?.signal ?? null,
    maxRawRho: maxRaw,
    maxCorrectedRho: maxCorr,
  };
}

// ── Plain-English interpretation ─────────────────────────────────────────────

function buildInterpretation(data: RankFidelityResult[], stats: Stats): string {
  if (data.length === 0) return 'No data to interpret yet. Run a simulation to see results.';

  const sorted = [...data].sort((a, b) => a.signal - b.signal);

  const correctionAlwaysHelps = sorted.every(r => r.correctedRho >= r.rawRho);
  const correctionNeverHelps  = sorted.every(r => r.correctedRho <= r.rawRho);

  if (correctionNeverHelps) {
    return (
      'The correction does not improve ranking quality at any tested signal level. ' +
      'Consider a different correction method or reviewing group configuration.'
    );
  }

  if (correctionAlwaysHelps) {
    const fidelityClause =
      stats.strongFidelitySignal !== null
        ? ` Strong rank fidelity (ρ > 0.8) is achieved from signal ${stats.strongFidelitySignal} pp onward.`
        : ' Rank fidelity remains moderate across all tested signal levels.';
    return (
      `The correction consistently improves quality-based selection across all signal levels.${fidelityClause}`
    );
  }

  // There is a crossover
  const crossSig = stats.correctionCrossoverSignal;
  const hurtClause =
    crossSig !== null
      ? `At low signal the correction hurts exploration. Above signal ${crossSig} pp it consistently improves quality-based selection.`
      : 'The correction provides mixed results across signal levels.';

  const fidelityClause =
    stats.strongFidelitySignal !== null
      ? ` Strong rank fidelity (ρ > 0.8) is first achieved at signal ${stats.strongFidelitySignal} pp.`
      : '';

  return hurtClause + fidelityClause;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'blue' | 'gray';
}) {
  const valueColor =
    accent === 'blue'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-zinc-800 dark:text-zinc-100';

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SummaryStats({ data }: Props) {
  const stats = deriveStats(data);
  const interpretation = buildInterpretation(data, stats);

  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(3));
  const fmtSignal = (v: number | null) =>
    v === null ? 'Not reached' : `${v} pp`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Correction starts helping at signal ≥"
          value={fmtSignal(stats.correctionCrossoverSignal)}
          sub="first signal where corrected ρ > raw ρ"
        />
        <StatCard
          label="Strong rank fidelity achieved at signal ≥"
          value={fmtSignal(stats.strongFidelitySignal)}
          sub="first signal where corrected ρ > 0.8"
          accent="blue"
        />
        <StatCard
          label="Best raw ρ"
          value={fmt(stats.maxRawRho)}
          sub="peak Spearman ρ without correction"
        />
        <StatCard
          label="Best corrected ρ"
          value={fmt(stats.maxCorrectedRho)}
          sub="peak Spearman ρ with correction"
          accent="blue"
        />
      </div>

      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
        {interpretation}
      </div>
    </div>
  );
}
