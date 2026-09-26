import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";
import type { BookingRequest } from "@/types/booking";
import type { CallbackRequest } from "@/types/callback";
import {
  renderBookingRequestEmail,
  renderCallbackRequestEmail,
  type RenderedEmail,
} from "./templates";

// All Resend-specific code and error handling lives in this file.

export type EmailKind = "booking-request" | "callback-request";

export type EmailErrorCategory =
  | "configuration"
  | "invalid_request"
  | "idempotency_conflict"
  | "rate_limited"
  | "provider_unavailable"
  | "unknown";

export type SendEmailResult =
  | { ok: true; emailId: string }
  | { ok: false; errorCategory: EmailErrorCategory };

// Resend rejects idempotency keys longer than 256 characters.
const IDEMPOTENCY_KEY_MAX = 256;

/**
 * Deterministic: the same Vapi tool call always maps to the same key, so a retried
 * tool call cannot produce a second workshop email. Never add randomness or time.
 */
export function buildIdempotencyKey(kind: EmailKind, toolCallId: string): string {
  if (toolCallId.trim() === "") {
    throw new Error("toolCallId is required for an idempotency key");
  }
  const key = `${kind}/${toolCallId}`;
  if (key.length > IDEMPOTENCY_KEY_MAX) {
    throw new Error("toolCallId is too long for an idempotency key");
  }
  return key;
}

const ERROR_CATEGORIES: Record<string, EmailErrorCategory> = {
  missing_api_key: "configuration",
  invalid_api_key: "configuration",
  restricted_api_key: "configuration",
  invalid_from_address: "configuration",
  invalid_access: "configuration",
  invalid_region: "configuration",

  validation_error: "invalid_request",
  missing_required_field: "invalid_request",
  invalid_parameter: "invalid_request",
  invalid_attachment: "invalid_request",
  not_found: "invalid_request",
  method_not_allowed: "invalid_request",

  // Same key reused with a different payload, or the original send still in flight.
  invalid_idempotency_key: "idempotency_conflict",
  invalid_idempotent_request: "idempotency_conflict",
  concurrent_idempotent_requests: "idempotency_conflict",

  rate_limit_exceeded: "rate_limited",
  daily_quota_exceeded: "rate_limited",
  monthly_quota_exceeded: "rate_limited",

  // The SDK also reports network failures as application_error.
  application_error: "provider_unavailable",
  internal_server_error: "provider_unavailable",
  security_error: "provider_unavailable",
};

let client: { apiKey: string; resend: Resend } | undefined;

function getClient(apiKey: string): Resend {
  if (client?.apiKey !== apiKey) {
    client = { apiKey, resend: new Resend(apiKey) };
  }
  return client.resend;
}

// Logs identifiers and categories only: never addresses, names, phones or bodies.
function logFailure(details: {
  kind: EmailKind;
  toolCallId: string;
  errorCategory: EmailErrorCategory;
  providerError?: string;
  statusCode?: number | null;
}) {
  console.error({ event: "email_send_failed", ...details });
}

async function sendWorkshopEmail(
  kind: EmailKind,
  toolCallId: string,
  email: RenderedEmail,
): Promise<SendEmailResult> {
  let idempotencyKey: string;
  try {
    idempotencyKey = buildIdempotencyKey(kind, toolCallId);
  } catch {
    logFailure({ kind, toolCallId: toolCallId.slice(0, 64), errorCategory: "invalid_request" });
    return { ok: false, errorCategory: "invalid_request" };
  }

  let env;
  try {
    env = getServerEnv();
  } catch {
    // EnvValidationError only names variables; still keep it out of the result.
    logFailure({ kind, toolCallId, errorCategory: "configuration" });
    return { ok: false, errorCategory: "configuration" };
  }

  try {
    const { data, error } = await getClient(env.RESEND_API_KEY).emails.send(
      {
        from: env.EMAIL_FROM,
        to: env.BOOKING_NOTIFICATION_EMAIL,
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
      { idempotencyKey },
    );

    if (error) {
      const errorCategory = ERROR_CATEGORIES[error.name] ?? "unknown";
      logFailure({
        kind,
        toolCallId,
        errorCategory,
        providerError: error.name,
        statusCode: error.statusCode,
      });
      return { ok: false, errorCategory };
    }

    if (!data?.id) {
      logFailure({ kind, toolCallId, errorCategory: "unknown" });
      return { ok: false, errorCategory: "unknown" };
    }

    return { ok: true, emailId: data.id };
  } catch {
    logFailure({ kind, toolCallId, errorCategory: "provider_unavailable" });
    return { ok: false, errorCategory: "provider_unavailable" };
  }
}

type SendInput<T> = {
  /** Vapi tool call id; drives the idempotency key. */
  toolCallId: string;
  request: T;
  /** Call time from the Vapi payload, so retries render an identical email. */
  callTime: Date;
};

export function sendBookingRequestEmail(input: SendInput<BookingRequest>) {
  return sendWorkshopEmail(
    "booking-request",
    input.toolCallId,
    renderBookingRequestEmail(input.request, input.callTime),
  );
}

export function sendCallbackRequestEmail(input: SendInput<CallbackRequest>) {
  return sendWorkshopEmail(
    "callback-request",
    input.toolCallId,
    renderCallbackRequestEmail(input.request, input.callTime),
  );
}
