// Order Service - v1.1 (Updated for Payment v2.0 compatibility)
import { Order, OrderItem, Address } from '../schemas/OrderSchema';
import { PaymentService, ProcessPaymentRequest } from './PaymentService';
import { PaymentAmount, PaymentMetadata } from '../schemas/PaymentSchema';

export interface CreateOrderRequest {
  customerId: string;  // BREAKING: renamed from userId for consistency with Payment v2.0
  items: Omit<OrderItem, 'subtotal'>[];
  shippingAddress: Address;
  billingAddress?: Address;
  merchantId: string;  // NEW: required for payment processing
}

export interface OrderResponse {
  order: Order;
  success: boolean;
  errorCode?: string;  // BREAKING: renamed from errorMessage for consistency
  errorDetails?: string;
}

export class OrderService {
  private orders: Map<string, Order> = new Map();
  private paymentService: PaymentService;

  constructor(paymentService: PaymentService) {
    this.paymentService = paymentService;
  }

  async createOrder(request: CreateOrderRequest): Promise<OrderResponse> {
    const { customerId, items, shippingAddress, billingAddress, merchantId } = request;

    // Calculate item subtotals and total
    const orderItems: OrderItem[] = items.map(item => ({
      ...item,
      subtotal: item.quantity * item.unitPrice,
    }));

    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const order: Order = {
      id: `order_${Date.now()}`,
      userId: customerId, // Map customerId to internal userId field
      items: orderItems,
      total,
      status: 'draft',
      shippingAddress,
      billingAddress,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(order.id, order);

    return { order, success: true };
  }

  // BREAKING: Now requires currency for multi-currency payments
  async submitOrder(
    orderId: string,
    paymentMethodId: string,
    currency: string = 'USD',
    merchantId: string
  ): Promise<OrderResponse> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        order: null as any,
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorDetails: 'Order not found'
      };
    }

    if (order.status !== 'draft') {
      return {
        order,
        success: false,
        errorCode: 'INVALID_ORDER_STATUS',
        errorDetails: 'Order already submitted'
      };
    }

    // Build PaymentAmount object (v2.0 format)
    const amount: PaymentAmount = {
      value: order.total,
      currency,
      formatted: `${currency} ${order.total.toFixed(2)}`,
    };

    // Build required PaymentMetadata (v2.0 format)
    const metadata: PaymentMetadata = {
      orderId: order.id,
      merchantId,
      description: `Order ${order.id} - ${order.items.length} items`,
    };

    // Process payment with v2.0 interface
    const paymentRequest: ProcessPaymentRequest = {
      customerId: order.userId,
      amount,
      paymentMethodId,
      metadata,
      idempotencyKey: `order-${order.id}-${Date.now()}`,
    };

    const paymentResult = await this.paymentService.processPayment(paymentRequest);
    if (!paymentResult.success) {
      return {
        order,
        success: false,
        errorCode: paymentResult.errorCode,
        errorDetails: paymentResult.errorDetails
      };
    }

    order.status = 'submitted';
    order.updatedAt = new Date();

    return { order, success: true };
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  // BREAKING: Renamed from getUserOrders for consistency
  async getCustomerOrders(customerId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(o => o.userId === customerId);
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<OrderResponse> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        order: null as any,
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorDetails: 'Order not found'
      };
    }

    order.status = status;
    order.updatedAt = new Date();

    return { order, success: true };
  }

  async cancelOrder(orderId: string, reason?: string): Promise<OrderResponse> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        order: null as any,
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorDetails: 'Order not found'
      };
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return {
        order,
        success: false,
        errorCode: 'CANNOT_CANCEL',
        errorDetails: 'Cannot cancel shipped orders'
      };
    }

    order.status = 'cancelled';
    order.updatedAt = new Date();

    return { order, success: true };
  }
}
