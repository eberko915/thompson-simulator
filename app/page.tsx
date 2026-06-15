'use client';

import { useState, useCallback } from 'react';
import { Controls, DEFAULT_CONTROLS } from '../components/Controls';
import type { ControlsValue } from '../components/Controls';
import { RankFidelityChart } from '../components/RankFidelityChart';
import { SummaryStats } from '../components/SummaryStats';
import { useSimulation } from '../lib/useSimulation';
import type { SimulationParams } from '../lib/simulation';

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-zinc-500 dark:text-zinc-400">
      <svg
        className="h-10 w-10 animate-spin text-blue-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium">Running simulation…</p>
        {progress > 0 && progress < 100 && (
          <p className="mt-1 text-xs text-zinc-400">{progress}% complete</p>
        )}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-400 dark:text-zinc-500">
      <svg
        className="h-10 w-10 opacity-40"
        xmlns="http://www.w3.org/2000/svg"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 3v18h18M7 16l4-4 4 4 4-6" />
      </svg>
      <p className="text-sm">Configure parameters and click <span className="font-medium text-zinc-600 dark:text-zinc-300">Run Simulation</span> to see results.</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [controls, setControls] = useState<ControlsValue>(DEFAULT_CONTROLS);
  const { sweep, sweepResults, running, progress } = useSimulation();

  const handleRun = useCallback(() => {
    const baseParams: SimulationParams = {
      nRounds:          controls.nRounds,
      signal:           0,               // overridden per sweep step in the worker
      baseProb:         controls.baseProb,
      learnedProb:      controls.learnedProb,
      correctionMethod: controls.correctionMethod,
      groups:           controls.groups,
    };
    sweep(baseParams, controls.signals);
  }, [controls, sweep]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Thompson Sampling De-bias Simulator
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Rank fidelity analysis across signal levels
          </p>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">

          {/* ── Left: Controls ── */}
          <aside className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 lg:self-start">
            <Controls
              value={controls}
              onChange={setControls}
              onRun={handleRun}
              running={running}
            />
          </aside>

          {/* ── Right: Results ── */}
          <main className="flex flex-col gap-6">
            {running ? (
              <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <Spinner progress={progress} />
              </div>
            ) : sweepResults && sweepResults.length > 0 ? (
              <>
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <RankFidelityChart data={sweepResults} />
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <SummaryStats data={sweepResults} />
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <EmptyState />
              </div>
            )}
          </main>

        </div>
      </div>

    </div>
  );
}
