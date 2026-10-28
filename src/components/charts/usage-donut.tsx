'use client';

import { Cell, Pie, PieChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

// Shared by the dashboard home card (lifetime trial-budget usage) and the
// mentor controls rail (rolling-window usage) -- same visual, different
// value/max fed in by each caller. The percentage is an absolutely
// positioned div centered over the chart rather than an SVG <text>
// element, which sidesteps recharts' own centering math entirely -- plain
// CSS, no coordinate guessing.
const chartConfig: ChartConfig = {
  used: { label: 'Used' },
  remaining: { label: 'Remaining' },
};

interface UsageDonutProps {
  value: number;
  max: number;
  label: string;
  size?: number;
  className?: string;
}

export function UsageDonut({ value, max, label, size = 72, className }: UsageDonutProps) {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? Math.round((clampedValue / max) * 100) : 0;
  const data = [
    { key: 'used', amount: clampedValue },
    { key: 'remaining', amount: Math.max(max - clampedValue, 0) },
  ];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ChartContainer config={chartConfig} className="h-full w-full">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="key"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill="var(--primary)" />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
          {percent}%
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
