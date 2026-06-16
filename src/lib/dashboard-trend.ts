export type TrendBucket = {
  label: string;
  sold: number;
  collected: number;
  delivered: number;
  failed: number;
  pending: number;
  dispatches: number;
  dispatchUnits: number;
  soldUnits: number;
  expenses: number;
  cashNet: number;
  pendingCredit: number;
};

export type DashboardTrend = {
  granularity: "hour" | "day" | "month";
  buckets: TrendBucket[];
};

export type TrendMetric = keyof Pick<
  TrendBucket,
  | "sold"
  | "collected"
  | "delivered"
  | "failed"
  | "pending"
  | "dispatches"
  | "dispatchUnits"
  | "soldUnits"
  | "expenses"
  | "cashNet"
  | "pendingCredit"
>;

export function trendSeries(
  buckets: TrendBucket[] | undefined,
  metric: TrendMetric,
): number[] {
  if (!buckets?.length) return [0];
  return buckets.map((b) => b[metric] ?? 0);
}

export function trendLabels(buckets: TrendBucket[] | undefined): string[] {
  return buckets?.map((b) => b.label) ?? [];
}
