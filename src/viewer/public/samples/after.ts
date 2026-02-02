// Reservation schema - proposed changes for multi-property expansion
// @intent Rename guestId to visitorId for unified identity across properties

interface Reservation {
  visitorId: string;
  accommodationId: AccommodationRef;
  checkIn: Date;
  checkOut: Date;
  status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
  pricing: PricingDetails;
  createdAt: Date;
}

interface AccommodationRef {
  propertyId: string;
  unitNumber: string;
  unitType: "room" | "suite" | "villa";
}

interface PricingDetails {
  baseRate: number;
  taxes: number;
  fees: number;
  currency: string;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  loyaltyTier?: "bronze" | "silver" | "gold" | "platinum";
}

interface BookingRequest {
  visitorId: string;
  accommodationId: AccommodationRef;
  checkIn: Date;
  checkOut: Date;
  specialRequests?: string;
  promoCode?: string;
}

export type { Reservation, Guest, BookingRequest, AccommodationRef, PricingDetails };
