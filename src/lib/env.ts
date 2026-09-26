import { z } from "zod";

/**
 * Server-side environment variables the backend actually requires.
 *
 * Validation is lazy (on first use, not at import/build time) so that
 * `/api/health` and `next build` work before secrets are configured.
 * Never read these through `NEXT_PUBLIC_*`.
 */
const serverEnvSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  VAPI_WEBHOOK_TOKEN: z.string().trim().min(1),
  BOOKING_NOTIFICATION_EMAIL: z.email(),
  // Resend accepts either "addr@example.com" or "Name <addr@example.com>".
  EMAIL_FROM: z.string().trim().min(1),
  APP_BASE_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly invalidKeys: string[]) {
    // Only variable names are reported, never values.
    super(`Missing or invalid environment variables: ${invalidKeys.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const invalidKeys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(invalidKeys);
  }
  return result.data;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
