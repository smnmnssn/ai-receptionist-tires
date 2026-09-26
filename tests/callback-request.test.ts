import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { z } from "zod";
import { callbackRequestSchema } from "@/schemas/callback-request.schema";
import type { CallbackRequest } from "@/types/callback";
import { CALL_CREATED_AT, testEnv, toolCallsBody, vapiRequest } from "./helpers/vapi";

// The email layer is mocked: route tests never reach Resend or the network.
const { sendCallbackMock, getServerEnvMock } = vi.hoisted(() => ({
  sendCallbackMock: vi.fn(),
  getServerEnvMock: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendBookingRequestEmail: vi.fn(),
  sendCallbackRequestEmail: sendCallbackMock,
}));
vi.mock("@/lib/env", () => ({ getServerEnv: getServerEnvMock }));

import { POST } from "@/app/api/vapi/tools/callback-request/route";

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

describe("POST /api/vapi/tools/callback-request", () => {
  const PATH = "/api/vapi/tools/callback-request";
  const TOOL = "submit_callback_request";

  const callbackArgs = {
    phone: "0701234567",
    registrationNumber: "xyz 789",
    reason: "Vill veta pris på nya sommardäck.",
  };

  const body = (args: unknown = callbackArgs, name = TOOL) =>
    toolCallsBody([{ id: "call_cb1", name, arguments: args }]);

  const post = (requestBody: unknown, authorization?: string | null) =>
    POST(vapiRequest(PATH, requestBody, authorization));

  beforeEach(() => {
    sendCallbackMock.mockReset().mockResolvedValue({ ok: true, emailId: "email_2" });
    getServerEnvMock.mockReset().mockReturnValue(testEnv);
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a valid callback request and returns success for the same toolCallId", async () => {
    const response = await post(body());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          name: TOOL,
          toolCallId: "call_cb1",
          result: '{"success":true,"message":"Callback request submitted successfully."}',
        },
      ],
    });
    expect(sendCallbackMock).toHaveBeenCalledWith({
      toolCallId: "call_cb1",
      callTime: new Date(CALL_CREATED_AT),
      request: { ...callbackArgs, registrationNumber: "XYZ789" },
    });
  });

  it("returns a tool error for a missing phone", async () => {
    const { phone: _omitted, ...withoutPhone } = callbackArgs;
    void _omitted;

    const response = await post(body(withoutPhone));

    const [result] = (await response.json()).results;
    expect(JSON.parse(result.error).invalidFields).toEqual(["phone"]);
    expect(sendCallbackMock).not.toHaveBeenCalled();
  });

  it("returns a tool error when the email fails", async () => {
    sendCallbackMock.mockResolvedValue({ ok: false, errorCategory: "rate_limited" });

    const response = await post(body());

    const [result] = (await response.json()).results;
    expect(result).not.toHaveProperty("result");
    expect(result).toHaveProperty("error");
  });

  it("returns 401 without processing for missing or invalid authentication", async () => {
    expect((await post(body(), null)).status).toBe(401);
    expect((await post(body(), "Bearer nope")).status).toBe(401);
    expect(sendCallbackMock).not.toHaveBeenCalled();
  });

  it("does not handle the booking tool", async () => {
    const response = await post(body(callbackArgs, "submit_booking_request"));

    const [result] = (await response.json()).results;
    expect(result).toHaveProperty("error");
    expect(sendCallbackMock).not.toHaveBeenCalled();
  });
});
