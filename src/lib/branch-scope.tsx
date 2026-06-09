import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "app.viewBranchId";

interface BranchScopeValue {
  branchId: string | null;
  setBranchId: (id: string | null) => void;
}

const BranchScopeContext = createContext<BranchScopeValue | null>(null);

export function BranchScopeProvider({
  children,
  defaultBranchId = null,
}: {
  children: React.ReactNode;
  defaultBranchId?: string | null;
}) {
  const [branchId, setBranchIdState] = useState<string | null>(defaultBranchId);

  // Hydrate from localStorage on the client (after mount to avoid SSR mismatch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return;
      setBranchIdState(stored === "" ? null : stored);
    } catch {
      // ignore
    }
  }, []);

  const setBranchId = useCallback((id: string | null) => {
    setBranchIdState(id);
    try {
      if (id === null) localStorage.setItem(STORAGE_KEY, "");
      else localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ branchId, setBranchId }), [branchId, setBranchId]);

  return <BranchScopeContext.Provider value={value}>{children}</BranchScopeContext.Provider>;
}

export function useBranchScope(): BranchScopeValue {
  const v = useContext(BranchScopeContext);
  if (!v) return { branchId: null, setBranchId: () => {} };
  return v;
}
