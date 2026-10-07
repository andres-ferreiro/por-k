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
  payment: {
    method: ReceiptPaymentMethod;
    status: "paid" | "pending";
    /** Cash received for this sale (may exceed the total: the excess paid older debt). */
    amountPaid: number;
  } | null;
  /** What the customer owes right now (read when the receipt is loaded). */
  currentBalance?: number;
  /**
   * Exact figures of the visit that was just saved. Only known right after saving
   * (added on the client, not stored), so a reprint falls back to `currentBalance`.
   */
  account?: { previousBalance: number; received: number; balance: number } | null;
};
