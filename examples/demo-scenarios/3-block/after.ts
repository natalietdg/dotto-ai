// schemas/PaymentSchema.ts - DANGEROUS CHANGES
// NO INTENT DECLARED - multiple breaking changes without justification

interface Payment {
  id: string;
  // transactionId REMOVED
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

interface Transaction {
  id: string;
  paymentId: string;
  timestamp: string;
  type: "charge" | "refund" | "void";
  amount: number;
}

interface Order {
  id: string;
  userId: string;
  // paymentId REMOVED
  items: string[];
  total: number;
  createdAt: Date;
}

export type { Payment, Transaction, Order };
