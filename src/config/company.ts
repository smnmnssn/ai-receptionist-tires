import type { CompanyConfig } from "@/types/company";

/**
 * Fictional demo workshop used during development and sales demos.
 * This is not a real business.
 */
export const companyConfig = {
  id: "svenssons-dack-demo",

  name: "Svenssons Däck & Bil",

  phone: "+46310000000",

  address: "Industrigatan 12, Göteborg",

  openingHours: {
    monday: "07:00-17:00",
    tuesday: "07:00-17:00",
    wednesday: "07:00-17:00",
    thursday: "07:00-17:00",
    friday: "07:00-17:00",
    saturday: null,
    sunday: null,
  },

  services: [
    "Däckskifte",
    "Däckhotell",
    "Balansering",
    "Punkteringsreparation",
    "Försäljning av däck",
  ],

  approvedPrices: {
    tireChange: 495,
  },

  tireHotel: true,

  dropInPolicy:
    "Drop-in kan vara möjligt för punktering men kan inte garanteras.",

  notificationEmail: process.env.BOOKING_NOTIFICATION_EMAIL,
} as const satisfies CompanyConfig;
