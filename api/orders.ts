// Orders API - v1.0
import { OrderService, CreateOrderRequest } from "../services/OrderService";
import { PaymentService } from "../services/PaymentService";
import { Order } from "../schemas/OrderSchema";

export interface Request {
  params: Record<string, string>;
  body: any;
  user?: { id: string };
}

export interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
}

const paymentService = new PaymentService();
const orderService = new OrderService(paymentService);

export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { items, shippingAddress, billingAddress } = req.body;

    const request: CreateOrderRequest = {
      userId,
      items,
      shippingAddress,
      billingAddress,
    };

    const result = await orderService.createOrder(request);

    if (!result.success) {
      res.status(400).json({ error: result.errorMessage });
      return;
    }

    res.status(201).json({ order: result.order });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrder(orderId);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getUserOrders(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const orders = await orderService.getUserOrders(userId);
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function submitOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const { paymentMethodId } = req.body;

    const result = await orderService.submitOrder(orderId, paymentMethodId);

    if (!result.success) {
      res.status(400).json({ error: result.errorMessage });
      return;
    }

    res.status(200).json({ order: result.order });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;
    const result = await orderService.cancelOrder(orderId);

    if (!result.success) {
      res.status(400).json({ error: result.errorMessage });
      return;
    }

    res.status(200).json({ order: result.order });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}
