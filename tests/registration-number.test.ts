import { describe, expect, it } from "vitest";
import { normalizeRegistrationNumber } from "@/lib/normalization/registration-number";

describe("normalizeRegistrationNumber", () => {
  it.each([
    ["abc 123", "ABC123"],
    ["ABC-123", "ABC123"],
    ["abc123", "ABC123"],
    ["  abc  123 ", "ABC123"],
    ["abc\t123", "ABC123"],
    ["ABC 123", "ABC123"], // non-breaking space
    ["ABC–123", "ABC123"], // en dash
    ["abc 12a", "ABC12A"], // current Swedish format with trailing letter
  ])("%j -> %j", (input, expected) => {
    expect(normalizeRegistrationNumber(input)).toBe(expected);
  });

  it("does not invent or pad missing characters", () => {
    expect(normalizeRegistrationNumber("ab 12")).toBe("AB12");
  });

  it("does not reject non-standard formats", () => {
    expect(normalizeRegistrationNumber("mitt bil")).toBe("MITTBIL");
    expect(normalizeRegistrationNumber("DK 12.345")).toBe("DK12.345");
  });

  it("is idempotent", () => {
    const once = normalizeRegistrationNumber("abc-123");
    expect(normalizeRegistrationNumber(once)).toBe(once);
  });
});
