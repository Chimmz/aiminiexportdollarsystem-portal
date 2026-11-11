'use client';

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

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
  // Height override -- the mentor controls rail's narrow column wants the
  // original compact height, but the dashboard home page has room to show
  // this chart much bigger; defaults to the original h-28 so the rail
  // (and any other existing caller) is unaffected.
  className?: string;
}

export function UsageLineChart({ data, granularity = 'day', className }: UsageLineChartProps) {
  const formatLabel = granularity === 'hour' ? formatHour : formatShortDate;
  // Scoped to this instance -- this chart renders in two places at once
  // (dashboard home, mentor controls rail), and an SVG gradient's id has
  // to be unique in the document or the second instance would silently
  // reuse (or fight over) the first one's <linearGradient>.
  const gradientId = `usage-tokens-gradient-${useId()}`;

  return (
    <ChartContainer config={chartConfig} className={cn('h-28 w-full', className)}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.175} />
            <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          minTickGap={28}
          // Default interval mode preserves the end and drops from the
          // start under tight spacing -- with a short range (the earliest-
          // usage clamp in getTokenUsageTimeline can make that as few as a
          // handful of points), that silently dropped the very first,
          // real start-of-usage date. preserveStartEnd always keeps both
          // ends labeled, only auto-skipping in between.
          interval="preserveStartEnd"
          tickFormatter={formatLabel}
          fontSize={10}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatLabel(String(v))} />} />
        <Area
          dataKey="tokens"
          type="monotone"
          stroke="var(--color-tokens)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          // recharts' default 1500ms morph is tuned for a chart appearing
          // once, not one that re-renders mid-session on every
          // 'refresh-usage' push (see mentor-controls-rail.tsx) -- at that
          // length each new data point reads as the whole line lurching,
          // not updating. 300ms is enough to still feel like a transition
          // rather than a hard cut, without drawing attention to itself.
          animationDuration={300}
        />
      </AreaChart>
    </ChartContainer>
  );
}
