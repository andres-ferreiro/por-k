import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ReceiptSheet } from "@/components/driver/receipt-sheet";

export interface ShowReceiptArgs {
  deliveryId: string;
}

interface ReceiptContextValue {
  showReceipt: (args: ShowReceiptArgs) => void;
}

const ReceiptContext = createContext<ReceiptContextValue>({ showReceipt: () => {} });

/** One receipt screen for the whole driver panel; any screen can open it. */
export function ReceiptProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ShowReceiptArgs | null>(null);
  const [open, setOpen] = useState(false);

  const showReceipt = useCallback((args: ShowReceiptArgs) => {
    setCurrent(args);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ showReceipt }), [showReceipt]);

  return (
    <ReceiptContext.Provider value={value}>
      {children}
      <ReceiptSheet open={open} onOpenChange={setOpen} args={current} />
    </ReceiptContext.Provider>
  );
}

/** Safe to call outside the provider: it just does nothing. */
export function useReceipt() {
  return useContext(ReceiptContext);
}
