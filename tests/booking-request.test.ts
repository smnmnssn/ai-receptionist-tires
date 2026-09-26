import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { bookingRequestSchema } from "@/schemas/booking-request.schema";
import type { BookingRequest } from "@/types/booking";

const validBooking = {
  customerName: "Erik Andersson",
  phone: "070-123 45 67",
  registrationNumber: "ABC123",
  service: "TIRE_HOTEL",
  description: "Kunden vill byta till vinterdäck.",
  preferredDate: "torsdag",
  preferredTimeOfDay: "AFTERNOON",
  tiresStoredAtShop: true,
  tireSize: "225/45 R18",
  notes: "Volvo V60",
};

describe("bookingRequestSchema", () => {
  it("output type matches the BookingRequest domain type", () => {
    expectTypeOf<z.output<typeof bookingRequestSchema>>().toEqualTypeOf<BookingRequest>();
  });

  it("accepts a valid booking request", () => {
    const result = bookingRequestSchema.safeParse(validBooking);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validBooking);
  });

  it("accepts a minimal booking request with only required fields", () => {
    const result = bookingRequestSchema.safeParse({
      customerName: "Anna",
      phone: "0701234567",
      service: "PUNCTURE",
      description: "Punktering på höger framdäck.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid booking request", () => {
    expect(bookingRequestSchema.safeParse({}).success).toBe(false);
    expect(bookingRequestSchema.safeParse(null).success).toBe(false);
    expect(bookingRequestSchema.safeParse("not an object").success).toBe(false);
    expect(
      bookingRequestSchema.safeParse({ ...validBooking, tiresStoredAtShop: "yes" }).success,
    ).toBe(false);
    expect(
      bookingRequestSchema.safeParse({ ...validBooking, preferredTimeOfDay: "EVENING" }).success,
    ).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...validBooking, description: "" }).success).toBe(
      false,
    );
    expect(
      bookingRequestSchema.safeParse({ ...validBooking, description: "x".repeat(2001) }).success,
    ).toBe(false);
  });

  it("rejects a missing or blank customer name", () => {
    const { customerName: _omitted, ...withoutName } = validBooking;
    void _omitted;

    const missing = bookingRequestSchema.safeParse(withoutName);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(["customerName"]);

    expect(bookingRequestSchema.safeParse({ ...validBooking, customerName: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a missing phone", () => {
    const { phone: _omitted, ...withoutPhone } = validBooking;
    void _omitted;

    expect(bookingRequestSchema.safeParse(withoutPhone).success).toBe(false);
  });

  it("rejects a service outside the strict enum", () => {
    for (const service of ["OIL_CHANGE", "tire_change", "Däckskifte", "", 1]) {
      const result = bookingRequestSchema.safeParse({ ...validBooking, service });
      expect(result.success, String(service)).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["service"]);
    }
  });

  it("trims required and optional text", () => {
    const result = bookingRequestSchema.parse({
      ...validBooking,
      customerName: "  Erik Andersson ",
      tireSize: " 225/45 R18 ",
    });

    expect(result.customerName).toBe("Erik Andersson");
    expect(result.tireSize).toBe("225/45 R18");
  });

  it("treats null or blank optional fields as not provided", () => {
    const result = bookingRequestSchema.parse({
      ...validBooking,
      registrationNumber: null,
      preferredDate: "",
      preferredTimeOfDay: null,
      tiresStoredAtShop: null,
      notes: "   ",
    });

    expect(result.registrationNumber).toBeUndefined();
    expect(result.preferredDate).toBeUndefined();
    expect(result.preferredTimeOfDay).toBeUndefined();
    expect(result.tiresStoredAtShop).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });

  it("strips unknown fields", () => {
    const result = bookingRequestSchema.parse({ ...validBooking, confirmedSlot: "14:30" });

    expect(result).not.toHaveProperty("confirmedSlot");
  });
});
