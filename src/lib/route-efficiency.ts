export type EfficiencyStop = {
  customer_id: string;
  position: number;
  status: "unvisited" | "pending" | "delivered" | "failed";
  updated_at: string | null;
};

export type RouteEfficiencyMetrics = {
  completed_stops: number;
  completion_pct: number;
  failed_pct: number;
  active_minutes: number | null;
  stops_per_hour: number | null;
  avg_minutes_per_stop: number | null;
  sequence_score: number | null;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Kendall-tau style sequence score: 100 = perfect planned order, 0 = fully reversed. */
export function computeSequenceScore(stops: EfficiencyStop[]): number | null {
  const completed = stops
    .filter(
      (s) => (s.status === "delivered" || s.status === "failed") && s.updated_at,
    )
    .sort(
      (a, b) =>
        new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime(),
    );

  const n = completed.length;
  if (n === 0) return null;
  if (n === 1) return 100;

  const positionByCustomer = new Map(stops.map((s) => [s.customer_id, s.position]));
  const ranks = completed.map((s) => positionByCustomer.get(s.customer_id) ?? 0);

  let inversions = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (ranks[i] > ranks[j]) inversions++;
    }
  }
  const maxInversions = (n * (n - 1)) / 2;
  return Math.round((1 - inversions / maxInversions) * 100);
}

export function computeRouteEfficiency(
  stops: EfficiencyStop[],
  dispatchedAt: string | null,
): RouteEfficiencyMetrics {
  const total = stops.length;
  const delivered = stops.filter((s) => s.status === "delivered").length;
  const failed = stops.filter((s) => s.status === "failed").length;
  const completed = stops.filter(
    (s) => (s.status === "delivered" || s.status === "failed") && s.updated_at,
  );

  const completion_pct = total === 0 ? 0 : Math.round(((delivered + failed) / total) * 100);
  const failed_pct = total === 0 ? 0 : Math.round((failed / total) * 100);
  const sequence_score = computeSequenceScore(stops);

  if (completed.length === 0) {
    return {
      completed_stops: 0,
      completion_pct,
      failed_pct,
      active_minutes: null,
      stops_per_hour: null,
      avg_minutes_per_stop: null,
      sequence_score,
    };
  }

  const visitTimes = completed.map((s) => new Date(s.updated_at!).getTime());
  const lastVisit = Math.max(...visitTimes);
  const startTime = dispatchedAt
    ? new Date(dispatchedAt).getTime()
    : Math.min(...visitTimes);

  const active_minutes = Math.max(1, (lastVisit - startTime) / 60_000);
  const completed_stops = completed.length;

  return {
    completed_stops,
    completion_pct,
    failed_pct,
    active_minutes: Math.round(active_minutes),
    stops_per_hour: round1(completed_stops / (active_minutes / 60)),
    avg_minutes_per_stop: round1(active_minutes / completed_stops),
    sequence_score,
  };
}
