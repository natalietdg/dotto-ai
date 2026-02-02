// Payment Service - v2.0 (Multi-Currency Support)
import { Payment, PaymentAmount, PaymentMethod, PaymentMetadata } from "../schemas/PaymentSchema";
import { Address } from "../schemas/OrderSchema";

// BREAKING: Request structure changed for multi-currency support
export interface ProcessPaymentRequest {
  customerId: string; // BREAKING: renamed from userId
  amount: PaymentAmount; // BREAKING: changed from number to PaymentAmount object
  paymentMethodId: string;
  metadata: PaymentMetadata; // BREAKING: now required
  idempotencyKey: string; // NEW: required for payment deduplication
}

export interface ProcessPaymentResponse {
  payment: Payment;
  success: boolean;
  errorCode?: string; // BREAKING: renamed from errorMessage to errorCode
  errorDetails?: string;
}

// NEW: Currency conversion types for multi-currency
export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: Date;
}

export class PaymentService {
  private payments: Map<string, Payment> = new Map();
  private paymentMethods: Map<string, PaymentMethod> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();
  private processedKeys: Set<string> = new Set(); // For idempotency

  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResponse> {
    const { customerId, amount, paymentMethodId, metadata, idempotencyKey } = request;

    // Check idempotency
    if (this.processedKeys.has(idempotencyKey)) {
      const existingPayment = Array.from(this.payments.values()).find(
        (p) => p.idempotencyKey === idempotencyKey
      );
      if (existingPayment) {
        return { payment: existingPayment, success: true };
      }
    }

    // Validate payment method exists
    const paymentMethod = this.paymentMethods.get(paymentMethodId);
    if (!paymentMethod || paymentMethod.customerId !== customerId) {
      return {
        payment: null as any,
        success: false,
        errorCode: "INVALID_PAYMENT_METHOD",
        errorDetails: "Payment method not found or does not belong to customer",
      };
    }

    // Validate amount
    if (amount.value <= 0) {
      return {
        payment: null as any,
        success: false,
        errorCode: "INVALID_AMOUNT",
        errorDetails: "Payment amount must be greater than zero",
      };
    }

    const payment: Payment = {
      id: `pay_${Date.now()}`,
      customerId,
      amount,
      status: "initiated",
      createdAt: new Date(),
      metadata,
      idempotencyKey,
    };

    this.payments.set(payment.id, payment);
    this.processedKeys.add(idempotencyKey);

    // Simulate payment processing
    payment.status = "processing";
    await this.simulatePaymentGateway(payment);
    payment.status = "succeeded";
    payment.completedAt = new Date();

    return { payment, success: true };
  }

  private async simulatePaymentGateway(payment: Payment): Promise<void> {
    // Simulate async payment processing
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async getPayment(paymentId: string): Promise<Payment | null> {
    return this.payments.get(paymentId) || null;
  }

  // BREAKING: Method renamed and signature changed
  async getCustomerPayments(customerId: string, currency?: string): Promise<Payment[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.customerId === customerId)
      .filter((p) => !currency || p.amount.currency === currency);
  }

  // BREAKING: Refund now requires reason
  async refundPayment(paymentId: string, reason: string): Promise<ProcessPaymentResponse> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      return {
        payment: null as any,
        success: false,
        errorCode: "PAYMENT_NOT_FOUND",
      };
    }

    if (payment.status !== "succeeded") {
      return {
        payment,
        success: false,
        errorCode: "INVALID_STATUS",
        errorDetails: "Can only refund succeeded payments",
      };
    }

    payment.status = "cancelled";
    payment.metadata.description = `Refunded: ${reason}`;
    return { payment, success: true };
  }

  // NEW: Currency conversion for multi-currency support
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<PaymentAmount> {
    const rateKey = `${fromCurrency}-${toCurrency}`;
    const rate = this.exchangeRates.get(rateKey);

    const convertedValue = rate ? amount * rate.rate : amount;

    return {
      value: convertedValue,
      currency: toCurrency,
      formatted: `${toCurrency} ${convertedValue.toFixed(2)}`,
    };
  }

  // NEW: Register payment method with billing address
  async registerPaymentMethod(
    customerId: string,
    type: PaymentMethod["type"],
    lastFour: string,
    expiryMonth: number,
    expiryYear: number,
    billingAddress: Address
  ): Promise<PaymentMethod> {
    const method: PaymentMethod = {
      id: `pm_${Date.now()}`,
      customerId,
      type,
      isDefault: false,
      lastFour,
      expiryMonth,
      expiryYear,
      billingAddress,
    };

    this.paymentMethods.set(method.id, method);
    return method;
  }
}
