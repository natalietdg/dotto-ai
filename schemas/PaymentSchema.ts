/**
 * Payment Schema - v2.0 (BREAKING CHANGES)
 *
 * @intent Add multi-currency support for international expansion
 * @intent Improve payment tracking with structured amount object
 * @intent Align customer ID naming with company-wide schema standards
 * @migration Requires coordinated rollout with OrderService and API clients
 * @risk Breaking changes to public API - external clients need migration window
 */
export interface Payment {
  id: string;
  customerId: string; // BREAKING: renamed from userId
  amount: PaymentAmount; // BREAKING: changed from number to object
  status: "initiated" | "processing" | "succeeded" | "failed" | "cancelled"; // BREAKING: changed enum values
  createdAt: Date;
  completedAt?: Date; // renamed from processedAt
  metadata: PaymentMetadata; // BREAKING: now required (was optional)
  idempotencyKey: string; // NEW required field
}

export interface PaymentAmount {
  value: number;
  currency: string;
  formatted: string;
}

export interface PaymentMetadata {
  orderId: string; // BREAKING: now required
  description?: string;
  receiptUrl?: string;
  merchantId: string; // NEW required field
}

export interface PaymentMethod {
  id: string;
  customerId: string; // BREAKING: renamed from userId
  type: "credit_card" | "debit_card" | "bank_transfer" | "digital_wallet"; // BREAKING: changed enum values
  isDefault: boolean;
  lastFour?: string;
  expiryMonth?: number; // BREAKING: changed from expiryDate string
  expiryYear?: number; // BREAKING: changed from expiryDate string
  billingAddress: Address; // NEW required field
}

// New import dependency
import { Address } from "./OrderSchema";
