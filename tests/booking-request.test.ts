import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { z } from "zod";
import { bookingRequestSchema } from "@/schemas/booking-request.schema";
import type { BookingRequest } from "@/types/booking";
import { CALL_CREATED_AT, TEST_TOKEN, testEnv, toolCallsBody, vapiRequest } from "./helpers/vapi";

// The email layer is mocked: route tests never reach Resend or the network.
const { sendBookingMock, getServerEnvMock } = vi.hoisted(() => ({
  sendBookingMock: vi.fn(),
  getServerEnvMock: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendBookingRequestEmail: sendBookingMock,
  sendCallbackRequestEmail: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ getServerEnv: getServerEnvMock }));

import { POST } from "@/app/api/vapi/tools/booking-request/route";

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
    // Phone separators are stripped; everything else is unchanged.
    expect(result.data).toEqual({ ...validBooking, phone: "0701234567" });
  });

  it("accepts preferredTime alongside preferredTimeOfDay", () => {
    const result = bookingRequestSchema.parse({
      ...validBooking,
      preferredTime: " 14:00 ",
      preferredTimeOfDay: "AFTERNOON",
    });

    expect(result.preferredTime).toBe("14:00");
    expect(result.preferredTimeOfDay).toBe("AFTERNOON");
    expectTypeOf(result.preferredTime).toEqualTypeOf<string | undefined>();
  });

  it("treats preferredTime as optional and caps its length", () => {
    expect(bookingRequestSchema.parse({ ...validBooking, preferredTime: null }).preferredTime).toBe(
      undefined,
    );
    expect(
      bookingRequestSchema.safeParse({ ...validBooking, preferredTime: "x".repeat(201) }).success,
    ).toBe(false);
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

  it.each([
    ["unresolved caller-ID placeholder", "{{customer.number}}"],
    ["template text with spaces", "{{ customer.number }}"],
    ["arbitrary text", "ring mig"],
    ["digits mixed with text", "070 tel 1234567"],
    ["blank", "   "],
    ["empty", ""],
    ["too short", "12345"],
    ["too long", "1234567890123456"],
    ["plus in the middle", "070+1234567"],
  ])("rejects an invalid phone: %s", (_label, phone) => {
    const result = bookingRequestSchema.safeParse({ ...validBooking, phone });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it.each([
    ["0701234567", "0701234567"],
    ["070-123 45 67", "0701234567"],
    ["+46701234567", "+46701234567"],
    [" 031-00 00 00 ", "031000000"],
  ])("accepts a plausible phone %j as %j", (phone, expected) => {
    expect(bookingRequestSchema.parse({ ...validBooking, phone }).phone).toBe(expected);
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

describe("POST /api/vapi/tools/booking-request", () => {
  const PATH = "/api/vapi/tools/booking-request";
  const TOOL = "submit_booking_request";

  const bookingArgs = {
    customerName: "Erik Andersson",
    phone: "070-123 45 67",
    registrationNumber: "abc-123",
    service: "TIRE_HOTEL",
    description: "Byta till vinterdäck.",
    preferredDate: "torsdag",
    preferredTimeOfDay: "AFTERNOON",
    tiresStoredAtShop: true,
  };

  const body = (args: unknown = bookingArgs, id = "call_abc123", name = TOOL) =>
    toolCallsBody([{ id, name, arguments: args }]);

  const post = (requestBody: unknown, authorization?: string | null) =>
    POST(vapiRequest(PATH, requestBody, authorization));

  let logs: unknown[][];

  beforeEach(() => {
    sendBookingMock.mockReset().mockResolvedValue({ ok: true, emailId: "email_1" });
    getServerEnvMock.mockReset().mockReturnValue(testEnv);
    logs = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a valid request and returns success for the same toolCallId", async () => {
    const response = await post(body());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          name: TOOL,
          toolCallId: "call_abc123",
          result: '{"success":true,"message":"Booking request submitted successfully."}',
        },
      ],
    });
    expect(sendBookingMock).toHaveBeenCalledTimes(1);
  });

  it("passes the toolCallId, stable call time and normalized registration number to the email layer", async () => {
    await post(body());

    const input = sendBookingMock.mock.calls[0][0];
    expect(input.toolCallId).toBe("call_abc123");
    expect(input.callTime).toEqual(new Date(CALL_CREATED_AT));
    expect(input.request).toEqual({
      ...bookingArgs,
      phone: "0701234567",
      registrationNumber: "ABC123",
    });
  });

  it("rejects an unresolved caller-ID placeholder as phone without sending email", async () => {
    const response = await post(body({ ...bookingArgs, phone: "{{customer.number}}" }));

    expect(response.status).toBe(200);
    const [result] = (await response.json()).results;
    expect(result).not.toHaveProperty("result");
    expect(JSON.parse(result.error).invalidFields).toEqual(["phone"]);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("passes preferredTime through to the email layer", async () => {
    await post(body({ ...bookingArgs, preferredTime: "14:00" }));

    expect(sendBookingMock.mock.calls[0][0].request).toMatchObject({
      preferredTime: "14:00",
      preferredTimeOfDay: "AFTERNOON",
    });
  });

  it("accepts arguments sent as a JSON string", async () => {
    const response = await post(body(JSON.stringify(bookingArgs)));

    expect((await response.json()).results[0].result).toContain('"success":true');
    expect(sendBookingMock).toHaveBeenCalledTimes(1);
  });

  it("passes identical inputs when the same tool call is retried", async () => {
    await post(body());
    await post(body());

    const [first, second] = sendBookingMock.mock.calls.map((call) => call[0]);
    expect(second).toEqual(first);
  });

  it("returns 401 and does no processing when authentication is missing", async () => {
    const request = vapiRequest(PATH, body(), null);
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(request.bodyUsed).toBe(false);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns 401 and does no processing when authentication is invalid", async () => {
    for (const authorization of ["Bearer wrong-token", TEST_TOKEN, `Basic ${TEST_TOKEN}`]) {
      const request = vapiRequest(PATH, body(), authorization);
      const response = await POST(request);

      expect(response.status, authorization).toBe(401);
      expect(request.bodyUsed).toBe(false);
    }
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns 500 without processing when the server env is invalid", async () => {
    getServerEnvMock.mockImplementation(() => {
      throw new Error("Missing or invalid environment variables: VAPI_WEBHOOK_TOKEN");
    });

    const response = await post(body());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Server misconfigured" });
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON", async () => {
    const response = await post("{not json");

    expect(response.status).toBe(400);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a message that is not tool-calls", async () => {
    const response = await post({ message: { type: "status-update", status: "in-progress" } });

    expect(response.status).toBe(400);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns a tool error listing invalid fields for an invalid request", async () => {
    const { customerName: _omitted, ...withoutName } = bookingArgs;
    void _omitted;

    const response = await post(body(withoutName));

    expect(response.status).toBe(200);
    const [result] = (await response.json()).results;
    expect(result).toEqual({ name: TOOL, toolCallId: "call_abc123", error: expect.any(String) });
    expect(JSON.parse(result.error)).toEqual({
      success: false,
      message: "Could not submit the request.",
      invalidFields: ["customerName"],
    });
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid service enum", async () => {
    const response = await post(body({ ...bookingArgs, service: "OIL_CHANGE" }));

    const [result] = (await response.json()).results;
    expect(JSON.parse(result.error).invalidFields).toEqual(["service"]);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("rejects unparsable argument strings", async () => {
    const response = await post(body("{not json"));

    const [result] = (await response.json()).results;
    expect(JSON.parse(result.error).invalidFields).toEqual(["arguments"]);
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("returns a tool error and never success when the email fails", async () => {
    sendBookingMock.mockResolvedValue({ ok: false, errorCategory: "provider_unavailable" });

    const response = await post(body());

    expect(response.status).toBe(200);
    const [result] = (await response.json()).results;
    expect(result).not.toHaveProperty("result");
    expect(result.toolCallId).toBe("call_abc123");
    expect(JSON.parse(result.error)).toEqual({
      success: false,
      message: "Could not submit the request.",
    });
  });

  it("returns a tool error when the email layer throws unexpectedly", async () => {
    sendBookingMock.mockRejectedValue(new Error("boom at /internal/path.ts:12"));

    const response = await post(body());

    const text = await response.text();
    expect(text).not.toContain("boom");
    expect(text).not.toContain("internal");
    expect(JSON.parse(text).results[0]).toHaveProperty("error");
  });

  it("fails instead of using the current time when the payload has no call time", async () => {
    const requestBody = toolCallsBody(
      [{ id: "call_abc123", name: TOOL, arguments: bookingArgs }],
      null,
    );
    delete (requestBody.message as { timestamp?: number }).timestamp;

    const response = await post(requestBody);

    const [result] = (await response.json()).results;
    expect(result).toHaveProperty("error");
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("rejects a tool call for a different tool without processing it", async () => {
    const response = await post(body(bookingArgs, "call_other", "submit_callback_request"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          name: "submit_callback_request",
          toolCallId: "call_other",
          error: '{"success":false,"message":"Could not submit the request."}',
        },
      ],
    });
    expect(sendBookingMock).not.toHaveBeenCalled();
  });

  it("only answers its own tool calls when the message contains several tools", async () => {
    const response = await post(
      toolCallsBody([
        { id: "call_transfer", name: "transferCall", arguments: {} },
        { id: "call_booking", name: TOOL, arguments: bookingArgs },
      ]),
    );

    const { results } = await response.json();
    expect(results.map((r: { toolCallId: string }) => r.toolCallId)).toEqual(["call_booking"]);
    expect(sendBookingMock).toHaveBeenCalledTimes(1);
  });

  it("does not log customer data, arguments or secrets", async () => {
    sendBookingMock.mockResolvedValue({ ok: false, errorCategory: "invalid_request" });
    await post(body());
    await post(body({ ...bookingArgs, service: "NOPE" }));
    await post(body(), "Bearer wrong-token");

    const logged = JSON.stringify(logs);
    expect(logged).toContain("call_abc123");
    for (const sensitive of [
      bookingArgs.customerName,
      bookingArgs.phone,
      bookingArgs.description,
      "abc-123",
      "ABC123",
      TEST_TOKEN,
      "wrong-token",
    ]) {
      expect(logged).not.toContain(sensitive);
    }
  });
});
