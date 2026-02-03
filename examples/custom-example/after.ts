// E-commerce Product Catalog Schema - After

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  basePrice: number;
  salePrice?: number;
  currency: string;
  category: Category;
  inventory: Inventory;
  media: ProductMedia;
  variants?: ProductVariant[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  priceAdjustment: number;
  inventory: Inventory;
}

export interface ProductMedia {
  images: MediaAsset[];
  videos?: MediaAsset[];
  thumbnail: string;
}

export interface MediaAsset {
  url: string;
  alt: string;
  width: number;
  height: number;
  format: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  level: number;
}

export interface Inventory {
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  lastRestocked: Date;
  supplier?: Supplier;
}

export interface Supplier {
  id: string;
  name: string;
  contactEmail: string;
  leadTimeDays: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  couponCode?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: Product;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier: Carrier;
  trackingNumber: string;
  status: "pending" | "shipped" | "in_transit" | "delivered" | "failed";
  estimatedDelivery: Date;
  actualDelivery?: Date;
  address: ShippingAddress;
}

export interface Carrier {
  id: string;
  name: string;
  code: string;
  trackingUrl: string;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}
