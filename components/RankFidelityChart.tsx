'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { TooltipContentProps } from 'recharts/types/component/Tooltip';
import type { RankFidelityResult } from '../lib/rankFidelity';

// ── Custom tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;

  const raw  = payload.find(p => p.dataKey === 'rawRho');
  const corr = payload.find(p => p.dataKey === 'correctedRho');

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">
        Signal: {label}
      </p>
      {raw && (
        <p className="text-zinc-500 dark:text-zinc-400">
          Raw ρ:{' '}
          <span className="font-mono font-medium text-zinc-700 dark:text-zinc-200">
            {(raw.value as number).toFixed(3)}
          </span>
        </p>
      )}
      {corr && (
        <p className="text-blue-600 dark:text-blue-400">
          Corrected ρ:{' '}
          <span className="font-mono font-medium">
            {(corr.value as number).toFixed(3)}
          </span>
        </p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  data: RankFidelityResult[];
}

const SIGNAL_TICKS = [4, 8, 16, 40, 100];

export function RankFidelityChart({ data }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        Rank Fidelity: Does the correction surface true quality rankings?
      </h2>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />

          <XAxis
            dataKey="signal"
            type="number"
            scale="log"
            domain={[4, 100]}
            ticks={SIGNAL_TICKS}
            tickFormatter={v => `${v}`}
            label={{
              value: 'Signal',
              position: 'insideBottomRight',
              offset: -4,
              fontSize: 11,
              fill: '#a1a1aa',
            }}
            tick={{ fontSize: 11, fill: '#71717a' }}
            stroke="#d4d4d8"
          />

          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tickFormatter={v => v.toFixed(1)}
            label={{
              value: 'Spearman ρ',
              angle: -90,
              position: 'insideLeft',
              offset: 8,
              fontSize: 11,
              fill: '#a1a1aa',
            }}
            tick={{ fontSize: 11, fill: '#71717a' }}
            stroke="#d4d4d8"
          />

          {/* ρ = 0 baseline */}
          <ReferenceLine
            y={0}
            stroke="#a1a1aa"
            strokeDasharray="5 3"
          />

          {/* ρ = 1 perfect-rank line */}
          <ReferenceLine
            y={1}
            stroke="#d4d4d8"
            strokeDasharray="4 4"
            label={{
              value: 'perfect',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#a1a1aa',
            }}
          />

          <Tooltip content={ChartTooltip} />

          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />

          <Line
            type="monotone"
            dataKey="rawRho"
            name="Raw"
            stroke="#a1a1aa"
            strokeWidth={2}
            dot={{ r: 4, fill: '#a1a1aa', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />

          <Line
            type="monotone"
            dataKey="correctedRho"
            name="Corrected"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
