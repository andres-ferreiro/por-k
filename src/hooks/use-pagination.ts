import { useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 25;

export function usePagination<T>(
  items: readonly T[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  resetDeps: unknown[] = [],
) {
  const [page, setPage] = useState(1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when filters change
  }, resetDeps);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return {
    paginatedItems,
    page: safePage,
    setPage,
    totalItems,
    totalPages,
    pageSize,
    from,
    to,
    controls: {
      page: safePage,
      totalPages,
      totalItems,
      from,
      to,
      onPageChange: setPage,
      pageSize,
    },
  };
}
