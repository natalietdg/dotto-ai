// schemas/PaymentSchema.ts - current production version

interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date;
}

export type { Payment };
