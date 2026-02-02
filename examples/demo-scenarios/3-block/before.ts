// schemas/PaymentSchema.ts - current production version

interface Payment {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

interface Transaction {
  id: string;
  paymentId: string;
  timestamp: Date;
  type: "charge" | "refund" | "void";
  amount: number;
}

interface Order {
  id: string;
  userId: string;
  paymentId: string;
  items: string[];
  total: number;
  createdAt: Date;
}

export type { Payment, Transaction, Order };
