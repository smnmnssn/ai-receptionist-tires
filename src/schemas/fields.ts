import { z } from "zod";

// Upper bounds keep model-generated input from bloating emails/logs.
// They are far above anything a real caller would dictate.
export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;

export function requiredText(max: number) {
  return z.string().trim().min(1).max(max);
}

/**
 * The model may send `null` or "" for a field it has no value for.
 * Treat both as "not provided" instead of failing the whole request.
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

/**
 * 7–15 digits, optionally with a leading "+" (E.164 caller ID such as +46701234567).
 * Deliberately not Swedish-specific. Rejects text, blanks and unresolved template
 * placeholders such as "{{customer.number}}".
 */
export const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

// Spaces and hyphens are separators the model often adds ("070-123 45 67").
const PHONE_SEPARATORS = /[\s-]/g;

export function phoneNumber() {
  return z
    .string()
    .trim()
    .transform((value) => value.replace(PHONE_SEPARATORS, ""))
    .pipe(z.string().regex(PHONE_PATTERN));
}

export function optionalOf<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}
