'use client';

import { useCallback } from 'react';
import type { GroupConfig, SimulationParams } from '../lib/simulation';

const SIGNAL_OPTIONS = [4, 8, 16, 40, 100] as const;

const CORRECTION_METHODS: { value: SimulationParams['correctionMethod']; label: string }[] = [
  { value: 'none',     label: 'None' },
  { value: 'sqrt_n',   label: '√n' },
  { value: 'trigamma', label: 'Trigamma' },
  { value: 'rank',     label: 'Rank' },
];

export interface ControlsValue {
  /** Selected signal levels in percentage points (e.g. 4 → 0.04 effect size). */
  signals: number[];
  correctionMethod: SimulationParams['correctionMethod'];
  baseProb: number;
  learnedProb: number;
  nRounds: number;
  groups: GroupConfig[];
}

export const DEFAULT_CONTROLS: ControlsValue = {
  signals: [4],
  correctionMethod: 'none',
  baseProb: 0.75,
  learnedProb: 0.85,
  nRounds: 50000,
  groups: [
    { id: 'group_01', nLabels: 2, nLearned: 1 },
    { id: 'group_02', nLabels: 3, nLearned: 1 },
  ],
};

interface Props {
  value: ControlsValue;
  onChange: (value: ControlsValue) => void;
  onRun: () => void;
  running: boolean;
}

export function Controls({ value, onChange, onRun, running }: Props) {
  const set = useCallback(
    <K extends keyof ControlsValue>(key: K, val: ControlsValue[K]) =>
      onChange({ ...value, [key]: val }),
    [value, onChange],
  );

  function toggleSignal(s: number) {
    const next = value.signals.includes(s)
      ? value.signals.filter(x => x !== s)
      : [...value.signals, s].sort((a, b) => a - b);
    set('signals', next);
  }

  function addGroup() {
    const id = `group_${String(value.groups.length + 1).padStart(2, '0')}`;
    set('groups', [...value.groups, { id, nLabels: 2, nLearned: 1 }]);
  }

  function removeGroup(idx: number) {
    set('groups', value.groups.filter((_, i) => i !== idx));
  }

  function updateGroup(idx: number, patch: Partial<GroupConfig>) {
    set('groups', value.groups.map((g, i) => {
      if (i !== idx) return g;
      const next = { ...g, ...patch };
      if (patch.nLabels !== undefined) {
        next.nLearned = Math.min(next.nLearned, next.nLabels);
      }
      return next;
    }));
  }

  const canRun = !running && value.signals.length > 0 && value.groups.length > 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Signal levels ── */}
      <fieldset>
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Signal level (concentration)
        </legend>
        <div className="flex flex-wrap gap-4">
          {SIGNAL_OPTIONS.map(s => (
            <label key={s} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.signals.includes(s)}
                onChange={() => toggleSignal(s)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{s}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Correction method ── */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Correction method
        </label>
        <select
          value={value.correctionMethod}
          onChange={e =>
            set('correctionMethod', e.target.value as SimulationParams['correctionMethod'])
          }
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CORRECTION_METHODS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── Base probability ── */}
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Base probability
          </label>
          <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400">
            {value.baseProb.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={0.99}
          step={0.01}
          value={value.baseProb}
          onChange={e => set('baseProb', parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-zinc-400 mt-0.5">
          <span>0.50</span><span>0.99</span>
        </div>
      </div>

      {/* ── Learned probability ── */}
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Learned probability
          </label>
          <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400">
            {value.learnedProb.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0.75}
          max={0.99}
          step={0.01}
          value={value.learnedProb}
          onChange={e => set('learnedProb', parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-zinc-400 mt-0.5">
          <span>0.75</span><span>0.99</span>
        </div>
      </div>

      {/* ── Rounds ── */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Rounds
        </label>
        <input
          type="number"
          min={1000}
          max={1_000_000}
          step={1000}
          value={value.nRounds}
          onChange={e =>
            set('nRounds', Math.max(1, parseInt(e.target.value, 10) || 0))
          }
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* ── Group configuration ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Groups</span>
          <button
            type="button"
            onClick={addGroup}
            className="text-xs px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            + Add row
          </button>
        </div>

        <div className="rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_72px_80px_36px] gap-0 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
            {['ID', 'Labels', 'Learned', ''].map(h => (
              <div key={h} className="px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {value.groups.map((g, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_72px_80px_36px] gap-0 items-center border-b border-zinc-100 dark:border-zinc-700/60 last:border-b-0"
            >
              <div className="px-1 py-1">
                <input
                  type="text"
                  value={g.id}
                  onChange={e => updateGroup(i, { id: e.target.value })}
                  className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:rounded"
                />
              </div>

              <div className="px-1 py-1">
                <select
                  value={g.nLabels}
                  onChange={e => updateGroup(i, { nLabels: parseInt(e.target.value, 10) })}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-1 py-0.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="px-1 py-1">
                <select
                  value={g.nLearned}
                  onChange={e => updateGroup(i, { nLearned: parseInt(e.target.value, 10) })}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-1 py-0.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Array.from({ length: g.nLabels + 1 }, (_, n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => removeGroup(i)}
                  disabled={value.groups.length <= 1}
                  aria-label="Remove group"
                  className="flex items-center justify-center w-7 h-7 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Run button ── */}
      <button
        type="button"
        onClick={onRun}
        disabled={!canRun}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {running ? 'Running…' : 'Run Simulation'}
      </button>

    </div>
  );
}
