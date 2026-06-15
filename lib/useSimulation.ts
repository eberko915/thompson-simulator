'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationParams, SimulationResult } from './simulation';
import type { RankFidelityResult } from './rankFidelity';
import type {
  RunMessage,
  SweepMessage,
  ProgressMessage,
  ResultMessage,
  SweepResultMessage,
  ErrorMessage,
} from './simulation.worker';

type WorkerOutMessage = ProgressMessage | ResultMessage | SweepResultMessage | ErrorMessage;

export interface UseSimulationReturn {
  /** Run a single simulation through the worker. */
  run: (params: SimulationParams) => void;
  results: SimulationResult[] | null;

  /** Sweep signal levels, computing Spearman ρ at each. */
  sweep: (baseParams: SimulationParams, signals: number[]) => void;
  sweepResults: RankFidelityResult[] | null;

  running: boolean;
  /** 0–100. */
  progress: number;
}

export function useSimulation(): UseSimulationReturn {
  const workerRef = useRef<Worker | null>(null);

  const [results,      setResults]      = useState<SimulationResult[] | null>(null);
  const [sweepResults, setSweepResults] = useState<RankFidelityResult[] | null>(null);
  const [running,      setRunning]      = useState(false);
  const [progress,     setProgress]     = useState(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('./simulation.worker.ts', import.meta.url),
    );

    worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'progress':
          setProgress(msg.pct);
          break;
        case 'result':
          setResults(msg.results);
          setProgress(100);
          setRunning(false);
          break;
        case 'sweepResult':
          setSweepResults(msg.results);
          setProgress(100);
          setRunning(false);
          break;
        case 'error':
          console.error('[simulation.worker]', msg.message);
          setRunning(false);
          setProgress(0);
          break;
      }
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
      console.error('[simulation.worker] uncaught:', event.message);
      setRunning(false);
      setProgress(0);
    });

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((params: SimulationParams) => {
    const worker = workerRef.current;
    if (!worker || running) return;
    setResults(null);
    setProgress(0);
    setRunning(true);
    const msg: RunMessage = { type: 'run', params };
    worker.postMessage(msg);
  }, [running]);

  const sweep = useCallback((baseParams: SimulationParams, signals: number[]) => {
    const worker = workerRef.current;
    if (!worker || running) return;
    setSweepResults(null);
    setProgress(0);
    setRunning(true);
    const msg: SweepMessage = { type: 'sweep', baseParams, signals };
    worker.postMessage(msg);
  }, [running]);

  return { run, results, sweep, sweepResults, running, progress };
}
