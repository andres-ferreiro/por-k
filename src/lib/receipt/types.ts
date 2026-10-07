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
    /** Part of `total` already received (== total when paid). */
    received: number;
  } | null;
  /**
   * Customer account at the time of the visit, read from the ledger by the server.
   * null when it cannot be computed reliably (receipt of a past day).
   */
  account?: {
    /** Owed before this visit. */
    previousBalance: number;
    /** Received during this visit for the OLD debt (not for this sale). */
    debtPaid: number;
    /** Total the customer owes now (old debt + unpaid part of this sale). */
    balanceAfter: number;
  } | null;
};
