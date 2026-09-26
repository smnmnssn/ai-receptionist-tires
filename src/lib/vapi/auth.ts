import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Verifies `Authorization: Bearer <token>` as sent by a Vapi Bearer Token credential
 * (header "Authorization", "Include Bearer Prefix" enabled).
 * Comparison is constant-time; hashing first also hides length differences.
 */
export function isAuthorized(authorizationHeader: string | null, expectedToken: string): boolean {
  if (!authorizationHeader || !expectedToken) return false;

  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;

  const received = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(received, expected);
}
