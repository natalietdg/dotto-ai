// Payments API - v2.0 (Multi-Currency Support)
import { PaymentService, ProcessPaymentRequest, ProcessPaymentResponse } from '../services/PaymentService';
import { Payment, PaymentAmount, PaymentMetadata } from '../schemas/PaymentSchema';
import { Address } from '../schemas/OrderSchema';

export interface Request {
  params: Record<string, string>;
  body: any;
  headers: Record<string, string>;  // NEW: for idempotency key
  customer?: { id: string };  // BREAKING: renamed from user to customer
}

export interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
}

const paymentService = new PaymentService();

// BREAKING: Request body structure changed
export async function createPayment(req: Request, res: Response): Promise<void> {
  try {
    const { amount, paymentMethodId, metadata } = req.body;
    const customerId = req.customer?.id;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!customerId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Customer authentication required' } });
      return;
    }

    if (!idempotencyKey) {
      res.status(400).json({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key header is required' } });
      return;
    }

    // Validate amount structure (BREAKING: now requires PaymentAmount object)
    if (!amount || typeof amount.value !== 'number' || !amount.currency) {
      res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must include value (number) and currency (string)'
        }
      });
      return;
    }

    // Validate metadata (BREAKING: now required with orderId and merchantId)
    if (!metadata || !metadata.orderId || !metadata.merchantId) {
      res.status(400).json({
        error: {
          code: 'INVALID_METADATA',
          message: 'Metadata must include orderId and merchantId'
        }
      });
      return;
    }

    const request: ProcessPaymentRequest = {
      customerId,
      amount: amount as PaymentAmount,
      paymentMethodId,
      metadata: metadata as PaymentMetadata,
      idempotencyKey,
    };

    const result = await paymentService.processPayment(request);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: result.errorCode,
          message: result.errorDetails
        }
      });
      return;
    }

    res.status(201).json({
      payment: result.payment,
      _links: {
        self: `/payments/${result.payment.id}`,
        refund: `/payments/${result.payment.id}/refund`,
      }
    });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  try {
    const { paymentId } = req.params;
    const payment = await paymentService.getPayment(paymentId);

    if (!payment) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payment not found' } });
      return;
    }

    res.status(200).json({
      payment,
      _links: {
        self: `/payments/${payment.id}`,
        refund: `/payments/${payment.id}/refund`,
      }
    });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// BREAKING: Renamed from getUserPayments and added currency filter
export async function getCustomerPayments(req: Request, res: Response): Promise<void> {
  try {
    const customerId = req.customer?.id;
    const currency = req.params.currency; // Optional currency filter

    if (!customerId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Customer authentication required' } });
      return;
    }

    const payments = await paymentService.getCustomerPayments(customerId, currency);
    res.status(200).json({
      payments,
      count: payments.length,
      _links: {
        self: `/customers/${customerId}/payments`,
      }
    });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// BREAKING: Now requires reason in request body
export async function refundPayment(req: Request, res: Response): Promise<void> {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      res.status(400).json({
        error: {
          code: 'MISSING_REASON',
          message: 'Refund reason is required'
        }
      });
      return;
    }

    const result = await paymentService.refundPayment(paymentId, reason);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: result.errorCode,
          message: result.errorDetails
        }
      });
      return;
    }

    res.status(200).json({
      payment: result.payment,
      refundedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// NEW: Currency conversion endpoint
export async function convertCurrency(req: Request, res: Response): Promise<void> {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;

    if (typeof amount !== 'number' || !fromCurrency || !toCurrency) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Amount, fromCurrency, and toCurrency are required'
        }
      });
      return;
    }

    const converted = await paymentService.convertCurrency(amount, fromCurrency, toCurrency);
    res.status(200).json({ converted });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// NEW: Register payment method endpoint
export async function registerPaymentMethod(req: Request, res: Response): Promise<void> {
  try {
    const customerId = req.customer?.id;
    const { type, lastFour, expiryMonth, expiryYear, billingAddress } = req.body;

    if (!customerId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Customer authentication required' } });
      return;
    }

    if (!type || !lastFour || !expiryMonth || !expiryYear || !billingAddress) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'type, lastFour, expiryMonth, expiryYear, and billingAddress are required'
        }
      });
      return;
    }

    const method = await paymentService.registerPaymentMethod(
      customerId,
      type,
      lastFour,
      expiryMonth,
      expiryYear,
      billingAddress as Address
    );

    res.status(201).json({ paymentMethod: method });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}
