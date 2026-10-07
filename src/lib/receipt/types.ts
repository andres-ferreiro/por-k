export type ReceiptPaymentMethod = "cash" | "transfer" | "credit" | "other";

export type ReceiptLine = {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** quantity * unitPrice (already rounded by the server). */
  amount: number;
};

export type ReceiptData = {
  /** Short, human-friendly reference derived from the delivery id. */
  folio: string;
  businessName: string;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  /** ISO timestamp of the last update of the visit. */
  issuedAt: string;
  customerName: string;
  customerPhone: string | null;
  driverName: string | null;
  items: ReceiptLine[];
  returns: ReceiptLine[];
  grossAmount: number;
  returnAmount: number;
  total: number;
  payment: { method: ReceiptPaymentMethod; status: "paid" | "pending" } | null;
  /**
   * Customer balance owed before this visit. `settled` means the driver collected it
   * during this same visit. Added on the client, not stored.
   */
  previousBalance?: { amount: number; settled: boolean } | null;
};
