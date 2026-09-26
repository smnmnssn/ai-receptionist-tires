// Whitespace plus ASCII hyphen and the dash variants STT/keyboards may produce.
const SEPARATORS = /[\s\-‐‑‒–—]/g;

/**
 * Deliberately small: uppercase and strip spaces/hyphens.
 * Does not validate plate format, look anything up, or fill in missing characters.
 *
 *   "abc 123" -> "ABC123", "ABC-123" -> "ABC123"
 */
export function normalizeRegistrationNumber(value: string): string {
  return value.replace(SEPARATORS, "").toUpperCase();
}
