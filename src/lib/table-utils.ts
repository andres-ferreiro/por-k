export function filterBySearch<T>(
  rows: T[],
  query: string,
  getText: (row: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => getText(row).toLowerCase().includes(q));
}

export function filterByBranch<T extends { branch_id?: string | null }>(
  rows: T[],
  branchId: string | null,
): T[] {
  if (!branchId) return rows;
  return rows.filter((row) => row.branch_id === branchId);
}

export function filterByActive<T extends { is_active?: boolean }>(
  rows: T[],
  status: "all" | "active" | "inactive",
): T[] {
  if (status === "all") return rows;
  const want = status === "active";
  return rows.filter((row) => row.is_active === want);
}
