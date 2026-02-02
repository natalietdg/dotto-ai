// Reservation schema - current production version

interface Reservation {
  guestId: string;
  roomNumber: number;
  checkIn: string;
  checkOut: string;
  status: "confirmed" | "cancelled" | "completed";
  totalPrice: number;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface BookingRequest {
  guestId: string;
  roomNumber: number;
  checkIn: string;
  checkOut: string;
  specialRequests?: string;
}

export type { Reservation, Guest, BookingRequest };
