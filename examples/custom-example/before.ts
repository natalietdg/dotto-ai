// E-commerce Product Catalog Schema - Before

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: Category;
  inventory: Inventory;
  images: string[];
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
}

export interface Inventory {
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
  lastRestocked: string;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  expiresAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery: string;
}
