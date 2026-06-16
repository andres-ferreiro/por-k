import * as React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip as ChartTooltipPlugin,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtQty, round2 } from "@/lib/format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  ChartTooltipPlugin,
);

const ACCENT = "#00636f";
const ACCENT_TOP = "rgba(0, 99, 111, 0.22)";
const DOWN_LINE = "#E24B4A";
const DOWN_TOP = "rgba(226, 75, 74, 0.22)";
const ACCENT_FILL = "rgba(0, 99, 111, 0.08)";

function formatSparkValue(value: number, mode: "qty" | "money") {
  return mode === "money" ? fmtMoney(value) : fmtQty(value);
}

function areaGradient(context: ScriptableContext<"line">, positive: boolean) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  if (!chartArea) return positive ? ACCENT_TOP : DOWN_TOP;
  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  if (positive) {
    gradient.addColorStop(0, "rgba(0, 99, 111, 0)");
    gradient.addColorStop(1, ACCENT_TOP);
  } else {
    gradient.addColorStop(0, "rgba(226, 75, 74, 0)");
    gradient.addColorStop(1, DOWN_TOP);
  }
  return gradient;
}

function sparkTooltip(mode: "qty" | "money"): ChartOptions<"line">["plugins"] {
  return {
    legend: { display: false },
    tooltip: {
      enabled: true,
      displayColors: false,
      backgroundColor: "rgba(26, 26, 26, 0.92)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: { top: 4, bottom: 4, left: 8, right: 8 },
      cornerRadius: 6,
      titleFont: { size: 10, weight: "500" },
      bodyFont: { size: 11, weight: "600" },
      titleMarginBottom: 2,
      caretSize: 4,
      caretPadding: 4,
      yAlign: "bottom",
      z: 60,
      callbacks: {
        title: (items) => items[0]?.label ?? "",
        label: (item) => formatSparkValue(item.parsed.y ?? 0, mode),
      },
    },
  };
}

function barTooltip(mode: "qty" | "money"): ChartOptions<"bar">["plugins"] {
  return {
    legend: { display: false },
    tooltip: {
      enabled: true,
      displayColors: false,
      backgroundColor: "rgba(26, 26, 26, 0.92)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: { top: 4, bottom: 4, left: 8, right: 8 },
      cornerRadius: 6,
      titleFont: { size: 10, weight: "500" },
      bodyFont: { size: 11, weight: "600" },
      titleMarginBottom: 2,
      caretSize: 4,
      caretPadding: 4,
      yAlign: "bottom",
      z: 60,
      callbacks: {
        title: (items) => items[0]?.label ?? "",
        label: (item) => formatSparkValue(item.parsed.y ?? 0, mode),
      },
    },
  };
}

function sparkLineOpts(mode: "qty" | "money"): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: sparkTooltip(mode),
    elements: { point: { radius: 0, hoverRadius: 3, hitRadius: 12 } },
    scales: { x: { display: false }, y: { display: false } },
  };
}

function sparkBarOpts(mode: "qty" | "money"): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "nearest", axis: "x", intersect: false },
    plugins: barTooltip(mode),
    scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
  };
}

export type StatBadgeVariant = "up" | "down" | "neutral";

export function StatGrid({
  children,
  className,
  columns = "auto",
}: {
  children: React.ReactNode;
  className?: string;
  /** Fixed column count on desktop; stacks to 2 cols on small screens */
  columns?: 2 | 3 | 4 | "auto";
}) {
  return (
    <div
      className={cn(
        "stat-grid",
        columns === 2 && "stat-grid-cols-2",
        columns === 3 && "stat-grid-cols-3",
        columns === 4 && "stat-grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SparklineChart({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="stat-sparkline-wrap" role="img" aria-label={label}>
      <div className="stat-sparkline-inner">{children}</div>
    </div>
  );
}


function StatCardLabel({ label }: { label: string }) {
  return <div className="stat-card-label">{label}</div>;
}

function StatCardChartShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function StatValueDisplay({ value, mode = "qty" }: { value: number; mode?: "qty" | "money" }) {
  if (mode === "money") {
    const formatted = fmtMoney(value);
    const dot = formatted.lastIndexOf(".");
    if (dot === -1) {
      return <span className="stat-card-value">{formatted}</span>;
    }
    return (
      <span className="stat-card-value">
        {formatted.slice(0, dot)}
        <span className="stat-card-value-decimal">{formatted.slice(dot)}</span>
      </span>
    );
  }

  const str = fmtQty(value);
  const dot = str.indexOf(".");
  if (dot === -1) {
    return <span className="stat-card-value">{str}</span>;
  }
  return (
    <span className="stat-card-value">
      {str.slice(0, dot)}
      <span className="stat-card-value-decimal">{str.slice(dot)}</span>
    </span>
  );
}

function StatBadge({
  variant,
  children,
}: {
  variant: StatBadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("stat-badge", {
      "stat-badge-up": variant === "up",
      "stat-badge-down": variant === "down",
      "stat-badge-neutral": variant === "neutral",
    })}>
      {children}
    </span>
  );
}

export function trendFromSeries(series: number[]): { pct: number; variant: StatBadgeVariant } {
  if (series.length < 2) return { pct: 0, variant: "neutral" };
  const prev = series[series.length - 2];
  const curr = series[series.length - 1];
  if (prev === 0) {
    return { pct: curr > 0 ? 100 : 0, variant: curr >= prev ? "up" : "down" };
  }
  const pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
  if (pct > 0) return { pct, variant: "up" };
  if (pct < 0) return { pct, variant: "down" };
  return { pct: 0, variant: "neutral" };
}

function deltaBadgeFromComparison(
  delta: { current: number; previous: number; inverted?: boolean },
): React.ReactNode {
  const { current, previous, inverted } = delta;
  let pct: number;
  let variant: StatBadgeVariant;
  if (previous === 0) {
    pct = current > 0 ? 100 : 0;
    variant = current >= 0 ? "up" : "down";
  } else {
    pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
    variant = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
  }
  if (inverted && variant !== "neutral") {
    variant = variant === "up" ? "down" : "up";
  }
  const text = pct === 0 ? "—" : `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`;
  return <StatBadge variant={variant}>{text}</StatBadge>;
}

function StatSparkline({
  chartType,
  series,
  seriesLabels,
  chartLabel,
  label,
  mode = "qty",
  positive,
}: {
  chartType: "area" | "bar";
  series: number[];
  seriesLabels?: string[];
  chartLabel?: string;
  label: string;
  mode?: "qty" | "money";
  positive?: boolean;
}) {
  const trendPositive = positive ?? trendFromSeries(series).variant !== "down";
  const labels = seriesLabels ?? series.map((_, i) => String(i + 1));
  const data = series.map((n) => round2(n));
  const last = data.length - 1;
  const lineOpts = React.useMemo(() => sparkLineOpts(mode), [mode]);
  const barOpts = React.useMemo(() => sparkBarOpts(mode), [mode]);

  return (
    <SparklineChart label={chartLabel ?? `${label} tendencia`}>
      {chartType === "bar" ? (
        <Bar
          data={{
            labels,
            datasets: [
              {
                data,
                backgroundColor: data.map((_, i) => (i === last ? ACCENT : ACCENT_FILL)),
                borderRadius: 3,
                borderSkipped: false,
                hoverBackgroundColor: ACCENT,
              },
            ],
          }}
          options={barOpts}
        />
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                data,
                borderColor: trendPositive ? ACCENT : DOWN_LINE,
                borderWidth: 1.5,
                fill: true,
                backgroundColor: (ctx) => areaGradient(ctx, trendPositive),
                tension: 0.4,
              },
            ],
          }}
          options={lineOpts}
        />
      )}
    </SparklineChart>
  );
}

export function StatCardSimple({
  label,
  value,
  mode = "qty",
  highlight,
  sub,
  badge,
  badgeVariant = "neutral",
  displayValue,
  delta,
  series,
  seriesLabels,
  chartType = "area",
  chartLabel,
}: {
  label: string;
  value: number;
  mode?: "qty" | "money";
  highlight?: boolean;
  sub?: string;
  badge?: string;
  badgeVariant?: StatBadgeVariant;
  /** Override formatted numeric display (e.g. "3/5") */
  displayValue?: string;
  /** Period-over-period comparison delta */
  delta?: { current: number; previous: number; inverted?: boolean };
  series?: number[];
  seriesLabels?: string[];
  chartType?: "area" | "bar";
  chartLabel?: string;
}) {
  const hasChart = !!series?.length;
  const deltaBadge = delta !== undefined ? deltaBadgeFromComparison(delta) : null;
  const statusBadge = badge ? <StatBadge variant={badgeVariant}>{badge}</StatBadge> : null;
  const rightBadges = (deltaBadge || statusBadge) ? (
    <div className="stat-card-badges">
      {deltaBadge}
      {statusBadge}
    </div>
  ) : null;

  return (
    <StatCardChartShell>
      <div className={cn("stat-card", hasChart ? "stat-card-chart" : "stat-card-simple", highlight && "stat-card-highlight")}>
        <div className="stat-card-header">
          <div className="min-w-0">
            <StatCardLabel label={label} />
          {displayValue ? (
            <span className="stat-card-value">{displayValue}</span>
          ) : (
            <StatValueDisplay value={value} mode={mode} />
          )}
          {sub && <div className="stat-card-sub">{sub}</div>}
        </div>
        {rightBadges}
      </div>
      {hasChart && (
        <StatSparkline
          chartType={chartType}
          series={series}
          seriesLabels={seriesLabels}
          chartLabel={chartLabel}
          label={label}
          mode={mode}
        />
      )}
      </div>
    </StatCardChartShell>
  );
}

export function StatCardArea({
  label,
  value,
  mode = "qty",
  series,
  seriesLabels,
  trendLabel,
  chartLabel,
  sub,
  delta,
}: {
  label: string;
  value: number;
  mode?: "qty" | "money";
  series: number[];
  seriesLabels?: string[];
  trendLabel?: string;
  chartLabel?: string;
  sub?: string;
  /** Period-over-period comparison; takes precedence over sparkline trend badge */
  delta?: { current: number; previous: number; inverted?: boolean };
}) {
  const { pct, variant } = trendFromSeries(series);
  const sparkBadgeText =
    trendLabel ??
    (pct === 0 ? "—" : `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`);
  const deltaBadge = delta !== undefined ? deltaBadgeFromComparison(delta) : null;
  const rightBadge = deltaBadge ?? <StatBadge variant={variant}>{sparkBadgeText}</StatBadge>;

  return (
    <StatCardChartShell>
      <div className="stat-card stat-card-chart">
        <div className="stat-card-header">
          <div className="min-w-0">
            <StatCardLabel label={label} />
          <StatValueDisplay value={value} mode={mode} />
          {sub && <div className="stat-card-sub">{sub}</div>}
        </div>
        {rightBadge}
      </div>
      <StatSparkline
        chartType="area"
        series={series}
        seriesLabels={seriesLabels}
        chartLabel={chartLabel}
        label={label}
        mode={mode}
        positive={variant !== "down"}
      />
      </div>
    </StatCardChartShell>
  );
}

export function StatCardBar({
  label,
  value,
  mode = "qty",
  bars,
  barLabels,
  compareMode,
  chartLabel,
  showIcon = true,
  delta,
  sub,
  displayValue,
  highlight,
}: {
  label: string;
  value: number;
  mode?: "qty" | "money";
  bars: number[];
  barLabels?: string[];
  /** Two-bar comparison: first accent, second muted accent */
  compareMode?: boolean;
  chartLabel?: string;
  showIcon?: boolean;
  delta?: { current: number; previous: number; inverted?: boolean };
  sub?: string;
  displayValue?: string;
  highlight?: boolean;
}) {
  const labels = barLabels ?? bars.map((_, i) => String(i + 1));
  const last = bars.length - 1;
  const deltaBadge = delta !== undefined ? deltaBadgeFromComparison(delta) : null;
  const barOpts = React.useMemo(() => sparkBarOpts(mode), [mode]);

  return (
    <StatCardChartShell>
      <div className={cn("stat-card stat-card-chart", highlight && "stat-card-highlight")}>
        <div className="stat-card-header">
          <div className="min-w-0">
            <StatCardLabel label={label} />
          {displayValue ? (
            <span className="stat-card-value">{displayValue}</span>
          ) : (
            <StatValueDisplay value={value} mode={mode} />
          )}
          {sub && <div className="stat-card-sub">{sub}</div>}
        </div>
        {deltaBadge ?? (showIcon ? (
          <BarChart3 className="h-[18px] w-[18px] shrink-0 text-[#9AA3B0]" aria-hidden />
        ) : null)}
      </div>
      <SparklineChart label={chartLabel ?? `${label} comparación`}>
        <Bar
          data={{
            labels,
            datasets: [
              {
                data: bars.map((n) => round2(n)),
                backgroundColor: bars.map((_, i) => {
                  if (compareMode) {
                    return i === 0 ? ACCENT : "rgba(0, 99, 111, 0.25)";
                  }
                  return i === last ? ACCENT : ACCENT_FILL;
                }),
                hoverBackgroundColor: ACCENT,
                borderRadius: 3,
                borderSkipped: false,
              },
            ],
          }}
          options={barOpts}
        />
      </SparklineChart>
      </div>
    </StatCardChartShell>
  );
}
