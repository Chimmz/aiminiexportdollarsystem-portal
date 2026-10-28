'use client';

import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const chartConfig: ChartConfig = {
  tokens: { label: 'Tokens', color: 'var(--primary)' },
};

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Hour-mode points are full ISO timestamps (see getTokenUsageTimeline's
// bucketByHour), unlike day-mode's plain "YYYY-MM-DD" -- new Date(value)
// parses either, but only this one needs a clock-time label, "2 PM" not
// "Oct 26."
function formatHour(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric' });
}

interface UsageLineChartProps {
  data: { date: string; tokens: number }[];
  // Defaults to 'day' so existing/cached callers that haven't threaded the
  // new field through yet still render the chart they always have.
  granularity?: 'hour' | 'day';
}

export function UsageLineChart({ data, granularity = 'day' }: UsageLineChartProps) {
  const formatLabel = granularity === 'hour' ? formatHour : formatShortDate;
  return (
    <ChartContainer config={chartConfig} className="h-28 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          minTickGap={28}
          tickFormatter={formatLabel}
          fontSize={10}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatLabel(String(v))} />} />
        <Line
          dataKey="tokens"
          type="monotone"
          stroke="var(--color-tokens)"
          strokeWidth={2}
          dot={false}
          // recharts' default 1500ms morph is tuned for a chart appearing
          // once, not one that re-renders mid-session on every
          // 'refresh-usage' push (see mentor-controls-rail.tsx) -- at that
          // length each new data point reads as the whole line lurching,
          // not updating. 300ms is enough to still feel like a transition
          // rather than a hard cut, without drawing attention to itself.
          animationDuration={300}
        />
      </LineChart>
    </ChartContainer>
  );
}
