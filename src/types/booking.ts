export const BOOKING_SERVICES = [
  "TIRE_CHANGE",
  "TIRE_HOTEL",
  "PUNCTURE",
  "BALANCING",
  "NEW_TIRES",
  "OTHER",
] as const;

export type BookingService = (typeof BOOKING_SERVICES)[number];

export const PREFERRED_TIMES_OF_DAY = ["MORNING", "AFTERNOON", "ANY"] as const;

export type PreferredTimeOfDay = (typeof PREFERRED_TIMES_OF_DAY)[number];

export type BookingRequest = {
  customerName: string;
  phone: string;
  registrationNumber?: string;

  service: BookingService;

  description: string;

  preferredDate?: string;

  preferredTimeOfDay?: PreferredTimeOfDay;

  tiresStoredAtShop?: boolean;
  tireSize?: string;
  notes?: string;
};
