// schemas/PaymentSchema.ts - breaking changes for billing migration
// @intent Migrate to structured payment amounts and customer ID naming

interface PaymentAmount {
  value: number;
  precision: number;
  currency: string;
}

type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

interface Payment {
  id: string;
  userId: string;
  amount: PaymentAmount;
  currency: string;
  status: PaymentStatus;
  createdAt: Date;
}

export type { Payment, PaymentAmount, PaymentStatus };
