import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { callbackRequestSchema } from "@/schemas/callback-request.schema";
import type { CallbackRequest } from "@/types/callback";

const validCallback = {
  customerName: "Maria Nilsson",
  phone: "0701234567",
  registrationNumber: "XYZ789",
  reason: "Vill veta pris på fyra nya vinterdäck.",
  notes: "Ring helst efter lunch.",
};

describe("callbackRequestSchema", () => {
  it("output type matches the CallbackRequest domain type", () => {
    expectTypeOf<z.output<typeof callbackRequestSchema>>().toEqualTypeOf<CallbackRequest>();
  });

  it("accepts a valid callback request", () => {
    const result = callbackRequestSchema.safeParse(validCallback);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validCallback);
  });

  it("accepts a callback request without a customer name", () => {
    const result = callbackRequestSchema.safeParse({
      phone: "0701234567",
      reason: "Vill prata med en människa.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing or blank phone", () => {
    const { phone: _omitted, ...withoutPhone } = validCallback;
    void _omitted;

    const missing = callbackRequestSchema.safeParse(withoutPhone);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(["phone"]);

    expect(callbackRequestSchema.safeParse({ ...validCallback, phone: "  " }).success).toBe(false);
    expect(callbackRequestSchema.safeParse({ ...validCallback, phone: null }).success).toBe(false);
  });

  it("rejects a missing or blank reason", () => {
    const { reason: _omitted, ...withoutReason } = validCallback;
    void _omitted;

    expect(callbackRequestSchema.safeParse(withoutReason).success).toBe(false);
    expect(callbackRequestSchema.safeParse({ ...validCallback, reason: "" }).success).toBe(false);
  });

  it("rejects wrongly typed optional fields", () => {
    expect(callbackRequestSchema.safeParse({ ...validCallback, customerName: 42 }).success).toBe(
      false,
    );
    expect(callbackRequestSchema.safeParse({ ...validCallback, notes: ["a"] }).success).toBe(false);
  });

  it("treats null or blank optional fields as not provided", () => {
    const result = callbackRequestSchema.parse({
      ...validCallback,
      customerName: null,
      registrationNumber: "",
    });

    expect(result.customerName).toBeUndefined();
    expect(result.registrationNumber).toBeUndefined();
  });
});
