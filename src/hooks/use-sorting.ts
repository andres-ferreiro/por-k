import { useCallback, useState } from "react";

export type SortDirection = "asc" | "desc";

export function useSorting(defaultKey?: string) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const toggle = useCallback((key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  }, [sortKey, sortDir]);

  const sort = useCallback(<T,>(rows: T[], getValue: (row: T, key: string) => unknown): T[] => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "boolean" && typeof bv === "boolean") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), "es", { sensitivity: "base" }) * dir;
    });
  }, [sortKey, sortDir]);

  return { sortKey, sortDir, toggle, sort };
}
