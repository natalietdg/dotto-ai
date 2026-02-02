// schemas/PaymentSchema.ts - added metadata
// @intent Add optional metadata field (similar to previous approved changes)

interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
  createdAt: Date;
}

export type { Payment };
