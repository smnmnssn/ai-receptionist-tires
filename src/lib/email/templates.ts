import type { BookingRequest, BookingService, PreferredTimeOfDay } from "@/types/booking";
import type { CallbackRequest } from "@/types/callback";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

// Shown for any field the caller did not provide. Never guess a value instead.
export const NOT_PROVIDED = "Ej angivet";

const SERVICE_LABELS: Record<BookingService, string> = {
  TIRE_CHANGE: "Däckskifte",
  TIRE_HOTEL: "Däckhotell",
  PUNCTURE: "Punktering",
  BALANCING: "Balansering",
  NEW_TIRES: "Köpa nya däck",
  OTHER: "Övrigt",
};

const TIME_OF_DAY_LABELS: Record<PreferredTimeOfDay, string> = {
  MORNING: "förmiddag",
  AFTERNOON: "eftermiddag",
  ANY: "valfri tid på dagen",
};

const callTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "25 september 2026 18:43" in Swedish local time. */
export function formatCallTime(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    callTimeFormat.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")} ${part("hour")}:${part("minute")}`;
}

function formatYesNo(value: boolean | undefined): string {
  if (value === undefined) return NOT_PROVIDED;
  return value ? "Ja" : "Nej";
}

function formatPreference(request: BookingRequest): string {
  const date = request.preferredDate;
  const timeOfDay = request.preferredTimeOfDay && TIME_OF_DAY_LABELS[request.preferredTimeOfDay];
  if (date && timeOfDay) return `${date}, ${timeOfDay}`;
  return date ?? timeOfDay ?? NOT_PROVIDED;
}

type Field = { label: string; value: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderText(heading: string, fields: Field[], footer: string): string {
  const body = fields.map((f) => `${f.label}:\n${f.value}`).join("\n\n");
  return `${heading}\n\n${body}\n\n---\n${footer}\n`;
}

function renderHtml(heading: string, fields: Field[], footer: string): string {
  const rows = fields
    .map(
      (f) =>
        `<tr><th align="left" valign="top" style="padding:6px 16px 6px 0;white-space:nowrap">${escapeHtml(f.label)}</th>` +
        `<td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(f.value)}</td></tr>`,
    )
    .join("");
  return (
    `<!doctype html><html lang="sv"><body style="font-family:Arial,sans-serif;font-size:15px;color:#111">` +
    `<h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>` +
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows}</table>` +
    `<p style="margin-top:24px;color:#555;font-size:13px">${escapeHtml(footer)}</p>` +
    `</body></html>`
  );
}

function subjectWith(prefix: string, ...parts: (string | undefined)[]): string {
  return [prefix, ...parts.filter(Boolean)].join(" – ");
}

/**
 * `callTime` must come from the Vapi call (stable across retries), not `new Date()`,
 * so a retried tool call produces an identical payload for the same idempotency key.
 */
export function renderBookingRequestEmail(request: BookingRequest, callTime: Date): RenderedEmail {
  const service = SERVICE_LABELS[request.service];
  const heading = "Ny bokningsförfrågan";
  const footer =
    "Förfrågan togs emot av AI-telefonisten. Tiden är inte bekräftad – kontakta kunden för att bekräfta.";
  const fields: Field[] = [
    { label: "Kund", value: request.customerName },
    { label: "Telefon", value: request.phone },
    { label: "Registreringsnummer", value: request.registrationNumber ?? NOT_PROVIDED },
    { label: "Ärende", value: service },
    { label: "Däck på däckhotell", value: formatYesNo(request.tiresStoredAtShop) },
    { label: "Önskemål", value: formatPreference(request) },
    { label: "Däckdimension", value: request.tireSize ?? NOT_PROVIDED },
    { label: "Beskrivning", value: request.description },
    { label: "Övrigt", value: request.notes ?? NOT_PROVIDED },
    { label: "Samtal", value: formatCallTime(callTime) },
  ];

  return {
    subject: subjectWith("Ny AI-bokningsförfrågan", service, request.registrationNumber),
    text: renderText(heading, fields, footer),
    html: renderHtml(heading, fields, footer),
  };
}

/** See `renderBookingRequestEmail` for the `callTime` requirement. */
export function renderCallbackRequestEmail(request: CallbackRequest, callTime: Date): RenderedEmail {
  const heading = "Ny förfrågan om återuppringning";
  const footer = "Förfrågan togs emot av AI-telefonisten. Kunden vill bli uppringd.";
  const fields: Field[] = [
    { label: "Kund", value: request.customerName ?? NOT_PROVIDED },
    { label: "Telefon", value: request.phone },
    { label: "Registreringsnummer", value: request.registrationNumber ?? NOT_PROVIDED },
    { label: "Anledning", value: request.reason },
    { label: "Övrigt", value: request.notes ?? NOT_PROVIDED },
    { label: "Samtal", value: formatCallTime(callTime) },
  ];

  return {
    subject: subjectWith("Ny AI-återuppringning", request.customerName, request.registrationNumber),
    text: renderText(heading, fields, footer),
    html: renderHtml(heading, fields, footer),
  };
}
