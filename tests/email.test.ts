import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingRequest } from "@/types/booking";
import type { CallbackRequest } from "@/types/callback";

// The Resend SDK is fully mocked: no test in this file can send a real email.
const { sendMock, ResendMock, getServerEnvMock } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const ResendMock = vi.fn(
    class {
      emails = { send: sendMock };
    },
  );
  return { sendMock, ResendMock, getServerEnvMock: vi.fn() };
});

vi.mock("resend", () => ({ Resend: ResendMock }));
vi.mock("@/lib/env", () => ({ getServerEnv: getServerEnvMock }));

import {
  buildIdempotencyKey,
  sendBookingRequestEmail,
  sendCallbackRequestEmail,
} from "@/lib/email/resend";
import {
  NOT_PROVIDED,
  formatCallTime,
  renderBookingRequestEmail,
  renderCallbackRequestEmail,
} from "@/lib/email/templates";

const testEnv = {
  RESEND_API_KEY: "re_test_key",
  VAPI_WEBHOOK_TOKEN: "test-webhook-token",
  BOOKING_NOTIFICATION_EMAIL: "verkstad@example.com",
  EMAIL_FROM: "AI-telefonist <noreply@example.com>",
  APP_BASE_URL: "https://example.vercel.app",
};

// 2026-09-25 18:43 in Stockholm (CEST, UTC+2).
const callTime = new Date("2026-09-25T16:43:00Z");

const booking: BookingRequest = {
  customerName: "Erik Andersson",
  phone: "070-123 45 67",
  registrationNumber: "ABC123",
  service: "TIRE_CHANGE",
  description: "Kunden vill byta till vinterdäck.",
  preferredDate: "Torsdag",
  preferredTimeOfDay: "AFTERNOON",
  tiresStoredAtShop: true,
};

const minimalBooking: BookingRequest = {
  customerName: "Anna Berg",
  phone: "0701234567",
  service: "PUNCTURE",
  description: "Punktering.",
};

const callback: CallbackRequest = {
  phone: "0709876543",
  reason: "Vill veta pris på nya sommardäck.",
};

beforeEach(() => {
  sendMock.mockReset();
  getServerEnvMock.mockReset().mockReturnValue(testEnv);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildIdempotencyKey", () => {
  it("is deterministic for the same tool call", () => {
    expect(buildIdempotencyKey("booking-request", "call_abc123")).toBe(
      "booking-request/call_abc123",
    );
    expect(buildIdempotencyKey("booking-request", "call_abc123")).toBe(
      buildIdempotencyKey("booking-request", "call_abc123"),
    );
    expect(buildIdempotencyKey("callback-request", "call_abc123")).toBe(
      "callback-request/call_abc123",
    );
  });

  it("differs between tool calls and between request kinds", () => {
    expect(buildIdempotencyKey("booking-request", "call_1")).not.toBe(
      buildIdempotencyKey("booking-request", "call_2"),
    );
    expect(buildIdempotencyKey("booking-request", "call_1")).not.toBe(
      buildIdempotencyKey("callback-request", "call_1"),
    );
  });

  it("rejects a missing or oversized tool call id", () => {
    expect(() => buildIdempotencyKey("booking-request", "")).toThrow();
    expect(() => buildIdempotencyKey("booking-request", "   ")).toThrow();
    expect(() => buildIdempotencyKey("booking-request", "x".repeat(300))).toThrow();
  });
});

describe("booking email template", () => {
  it("matches the PROJECT.md subject and body format", () => {
    const email = renderBookingRequestEmail(booking, callTime);

    expect(email.subject).toBe("Ny AI-bokningsförfrågan – Däckskifte – ABC123");
    expect(email.text).toContain("Ny bokningsförfrågan");
    expect(email.text).toContain("Kund:\nErik Andersson");
    expect(email.text).toContain("Telefon:\n070-123 45 67");
    expect(email.text).toContain("Registreringsnummer:\nABC123");
    expect(email.text).toContain("Ärende:\nDäckskifte");
    expect(email.text).toContain("Däck på däckhotell:\nJa");
    expect(email.text).toContain("Önskemål:\nTorsdag, eftermiddag");
    expect(email.text).toContain("Beskrivning:\nKunden vill byta till vinterdäck.");
    expect(email.text).toContain("Samtal:\n25 september 2026 18:43");
  });

  it("states that the time is not confirmed", () => {
    const email = renderBookingRequestEmail(booking, callTime);
    expect(email.text).toMatch(/inte bekräftad/);
  });

  it("marks missing optional fields as not provided instead of inferring them", () => {
    const email = renderBookingRequestEmail(minimalBooking, callTime);

    expect(email.subject).toBe("Ny AI-bokningsförfrågan – Punktering");
    expect(email.text).toContain(`Registreringsnummer:\n${NOT_PROVIDED}`);
    // Unknown must not become "Nej".
    expect(email.text).toContain(`Däck på däckhotell:\n${NOT_PROVIDED}`);
    expect(email.text).toContain(`Önskemål:\n${NOT_PROVIDED}`);
    expect(email.text).toContain(`Däckdimension:\n${NOT_PROVIDED}`);
    expect(email.text).not.toContain("undefined");
    expect(email.html).not.toContain("undefined");
  });

  it("renders an exact preferred time together with day and time of day", () => {
    const email = renderBookingRequestEmail({ ...booking, preferredTime: "14:00" }, callTime);

    expect(email.text).toContain("Önskemål:\nTorsdag, 14:00 (eftermiddag)");
    expect(email.html).toContain("Torsdag, 14:00 (eftermiddag)");
  });

  it("renders an exact preferred time on its own without inventing a day", () => {
    const email = renderBookingRequestEmail(
      { ...minimalBooking, preferredTime: "08:30" },
      callTime,
    );

    expect(email.text).toContain("Önskemål:\n08:30");
  });

  it("renders an explicit false as Nej", () => {
    const email = renderBookingRequestEmail({ ...booking, tiresStoredAtShop: false }, callTime);
    expect(email.text).toContain("Däck på däckhotell:\nNej");
  });

  it("escapes caller-supplied text in HTML", () => {
    const email = renderBookingRequestEmail(
      { ...booking, description: '<script>alert("x")</script> & co' },
      callTime,
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
  });

  it("renders identically for identical input", () => {
    expect(renderBookingRequestEmail(booking, callTime)).toEqual(
      renderBookingRequestEmail(booking, callTime),
    );
  });
});

describe("callback email template", () => {
  it("renders provided fields and marks missing ones as not provided", () => {
    const email = renderCallbackRequestEmail(callback, callTime);

    expect(email.subject).toBe("Ny AI-återuppringning");
    expect(email.text).toContain("Ny förfrågan om återuppringning");
    expect(email.text).toContain(`Kund:\n${NOT_PROVIDED}`);
    expect(email.text).toContain("Telefon:\n0709876543");
    expect(email.text).toContain("Anledning:\nVill veta pris på nya sommardäck.");
    expect(email.text).toContain("Samtal:\n25 september 2026 18:43");
    expect(email.text).not.toContain("undefined");
  });

  it("includes name and registration number in the subject when known", () => {
    const email = renderCallbackRequestEmail(
      { ...callback, customerName: "Maria Nilsson", registrationNumber: "XYZ789" },
      callTime,
    );
    expect(email.subject).toBe("Ny AI-återuppringning – Maria Nilsson – XYZ789");
  });
});

describe("formatCallTime", () => {
  it("formats in Swedish local time, including winter time", () => {
    expect(formatCallTime(new Date("2026-09-25T16:43:00Z"))).toBe("25 september 2026 18:43");
    expect(formatCallTime(new Date("2026-01-05T07:05:00Z"))).toBe("5 januari 2026 08:05");
  });
});

describe("sendBookingRequestEmail", () => {
  it("returns success with the email id when Resend accepts the email", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });

    const result = await sendBookingRequestEmail({
      toolCallId: "call_abc123",
      request: booking,
      callTime,
    });

    expect(result).toEqual({ ok: true, emailId: "email_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);

    const [payload, options] = sendMock.mock.calls[0];
    expect(payload).toMatchObject({
      from: testEnv.EMAIL_FROM,
      to: testEnv.BOOKING_NOTIFICATION_EMAIL,
      subject: "Ny AI-bokningsförfrågan – Däckskifte – ABC123",
    });
    expect(payload.text).toContain("Erik Andersson");
    expect(payload.html).toContain("Erik Andersson");
    expect(options).toEqual({ idempotencyKey: "booking-request/call_abc123" });
    expect(ResendMock).toHaveBeenCalledWith(testEnv.RESEND_API_KEY);
  });

  it("reuses the same key and identical payload when the same tool call is retried", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });

    const input = { toolCallId: "call_retry", request: booking, callTime };
    await sendBookingRequestEmail(input);
    await sendBookingRequestEmail({ ...input, request: { ...booking } });

    expect(sendMock).toHaveBeenCalledTimes(2);
    const [first, second] = sendMock.mock.calls;
    expect(second[1].idempotencyKey).toBe("booking-request/call_retry");
    expect(second[1]).toEqual(first[1]);
    expect(second[0]).toEqual(first[0]);
  });

  it("returns failure when Resend returns an error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 },
      headers: null,
    });

    const result = await sendBookingRequestEmail({
      toolCallId: "call_fail",
      request: booking,
      callTime,
    });

    expect(result).toEqual({ ok: false, errorCategory: "invalid_request" });
  });

  it.each([
    ["invalid_api_key", "configuration"],
    ["invalid_idempotent_request", "idempotency_conflict"],
    ["concurrent_idempotent_requests", "idempotency_conflict"],
    ["rate_limit_exceeded", "rate_limited"],
    ["application_error", "provider_unavailable"],
    ["something_new", "unknown"],
  ])("maps Resend error %s to %s", async (name, errorCategory) => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name, message: "x", statusCode: 400 },
      headers: null,
    });

    const result = await sendBookingRequestEmail({ toolCallId: "call_x", request: booking, callTime });

    expect(result).toEqual({ ok: false, errorCategory });
  });

  it("returns failure when the SDK throws", async () => {
    sendMock.mockRejectedValue(new Error("socket hang up"));

    const result = await sendBookingRequestEmail({ toolCallId: "call_x", request: booking, callTime });

    expect(result).toEqual({ ok: false, errorCategory: "provider_unavailable" });
  });

  it("returns failure when Resend returns neither data nor error", async () => {
    sendMock.mockResolvedValue({ data: null, error: null, headers: null });

    const result = await sendBookingRequestEmail({ toolCallId: "call_x", request: booking, callTime });

    expect(result).toEqual({ ok: false, errorCategory: "unknown" });
  });

  it("returns a configuration failure without calling Resend when env is invalid", async () => {
    getServerEnvMock.mockImplementation(() => {
      throw new Error("Missing or invalid environment variables: RESEND_API_KEY");
    });

    const result = await sendBookingRequestEmail({ toolCallId: "call_x", request: booking, callTime });

    expect(result).toEqual({ ok: false, errorCategory: "configuration" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns failure without calling Resend when the tool call id is missing", async () => {
    const result = await sendBookingRequestEmail({ toolCallId: "", request: booking, callTime });

    expect(result).toEqual({ ok: false, errorCategory: "invalid_request" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not log customer data or provider messages on failure", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Bad address verkstad@example.com", statusCode: 422 },
      headers: null,
    });

    await sendBookingRequestEmail({ toolCallId: "call_log", request: booking, callTime });

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("call_log");
    expect(logged).toContain("validation_error");
    for (const sensitive of [
      booking.customerName,
      booking.phone,
      booking.description,
      testEnv.BOOKING_NOTIFICATION_EMAIL,
      testEnv.RESEND_API_KEY,
    ]) {
      expect(logged).not.toContain(sensitive);
    }
  });
});

describe("sendCallbackRequestEmail", () => {
  it("sends with a callback-specific idempotency key", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_456" }, error: null, headers: null });

    const result = await sendCallbackRequestEmail({
      toolCallId: "call_cb1",
      request: callback,
      callTime,
    });

    expect(result).toEqual({ ok: true, emailId: "email_456" });
    const [payload, options] = sendMock.mock.calls[0];
    expect(payload.subject).toBe("Ny AI-återuppringning");
    expect(options).toEqual({ idempotencyKey: "callback-request/call_cb1" });
  });

  it("returns failure when Resend fails", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "x", statusCode: 500 },
      headers: null,
    });

    const result = await sendCallbackRequestEmail({
      toolCallId: "call_cb2",
      request: callback,
      callTime,
    });

    expect(result).toEqual({ ok: false, errorCategory: "provider_unavailable" });
  });
});
