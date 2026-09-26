import { describe, expect, it } from "vitest";
import { EnvValidationError, parseServerEnv } from "@/lib/env";

const validEnv = {
  RESEND_API_KEY: "re_test_key",
  VAPI_WEBHOOK_TOKEN: "test-webhook-token",
  BOOKING_NOTIFICATION_EMAIL: "verkstad@example.com",
  EMAIL_FROM: "AI-telefonist <noreply@example.com>",
  APP_BASE_URL: "https://example.vercel.app",
};

describe("parseServerEnv", () => {
  it("accepts a complete, valid environment", () => {
    expect(parseServerEnv(validEnv)).toEqual(validEnv);
  });

  it("reports missing variables by name", () => {
    const { RESEND_API_KEY: _omitted, ...rest } = validEnv;
    void _omitted;

    expect(() => parseServerEnv(rest)).toThrow(EnvValidationError);
    expect(() => parseServerEnv(rest)).toThrow(/RESEND_API_KEY/);
  });

  it("rejects empty and malformed values", () => {
    try {
      parseServerEnv({
        ...validEnv,
        VAPI_WEBHOOK_TOKEN: "   ",
        BOOKING_NOTIFICATION_EMAIL: "not-an-email",
        APP_BASE_URL: "not-a-url",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).invalidKeys.sort()).toEqual([
        "APP_BASE_URL",
        "BOOKING_NOTIFICATION_EMAIL",
        "VAPI_WEBHOOK_TOKEN",
      ]);
    }
  });

  it("never includes secret values in the error message", () => {
    const secret = "super-secret-token-value";
    try {
      parseServerEnv({ ...validEnv, VAPI_WEBHOOK_TOKEN: secret, APP_BASE_URL: "" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain(validEnv.RESEND_API_KEY);
    }
  });

  it("ignores unrelated variables such as optional setup keys", () => {
    const parsed = parseServerEnv({ ...validEnv, VAPI_API_KEY: "irrelevant" });
    expect(parsed).not.toHaveProperty("VAPI_API_KEY");
  });
});
