import { z } from "zod";

// Vapi "tool-calls" server message, per the Vapi OpenAPI schema
// (ServerMessageToolCalls / ToolCall / ToolCallFunction):
//
//   { "message": {
//       "type": "tool-calls",
//       "timestamp": 1678901234567,
//       "call": { "id": "...", "createdAt": "2026-09-25T16:43:00.000Z", ... },
//       "toolCallList": [
//         { "id": "call_abc", "type": "function",
//           "function": { "name": "submit_booking_request", "arguments": "{...}" } }
//       ],
//       "toolWithToolCallList": [ ... ]
//   } }
//
// `function.arguments` is typed as a JSON string in the schema but shown as an object in
// Vapi's guides, so both are accepted. The older flat `{ id, name, parameters }` shape
// from Vapi's server-events page is accepted as a fallback.
//
// This module only understands the envelope. Arguments are returned as `unknown` and
// must be validated by the domain schema.

const toolCallSchema = z.object({
  id: z.string().min(1),
  function: z
    .object({
      name: z.string().optional(),
      arguments: z.unknown().optional(),
    })
    .optional(),
  name: z.string().optional(),
  parameters: z.unknown().optional(),
});

const envelopeSchema = z.object({
  message: z.object({
    type: z.literal("tool-calls"),
    timestamp: z.number().optional(),
    call: z
      .object({
        id: z.string().optional(),
        createdAt: z.string().optional(),
        startedAt: z.string().optional(),
      })
      .optional(),
    toolCallList: z.array(toolCallSchema).min(1),
  }),
});

export type ParsedToolCall = {
  id: string;
  name: string | undefined;
  /** Untrusted model output. Validate before use. */
  arguments: unknown;
};

export type ParsedToolCallMessage = {
  callId: string | undefined;
  /** Stable call time for the email, or undefined if the payload carries none. */
  callTime: Date | undefined;
  toolCalls: ParsedToolCall[];
};

export type ParseResult =
  | { ok: true; message: ParsedToolCallMessage }
  | { ok: false; reason: "not_tool_calls" | "invalid_envelope" };

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // Left as a string so domain validation rejects it as a non-object.
    return raw;
  }
}

function toDate(value: string | number | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Prefers `call.createdAt`: it is required on Vapi's Call object and never changes during
 * a call, so every retry of a tool call renders the same email (same idempotent payload).
 */
function resolveCallTime(message: z.infer<typeof envelopeSchema>["message"]): Date | undefined {
  return (
    toDate(message.call?.createdAt) ??
    toDate(message.call?.startedAt) ??
    toDate(message.timestamp)
  );
}

export function parseToolCallMessage(body: unknown): ParseResult {
  const typeCheck = z.object({ message: z.object({ type: z.string() }) }).safeParse(body);
  if (typeCheck.success && typeCheck.data.message.type !== "tool-calls") {
    return { ok: false, reason: "not_tool_calls" };
  }

  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "invalid_envelope" };

  const { message } = parsed.data;
  return {
    ok: true,
    message: {
      callId: message.call?.id,
      callTime: resolveCallTime(message),
      toolCalls: message.toolCallList.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function?.name ?? toolCall.name,
        arguments: parseArguments(toolCall.function?.arguments ?? toolCall.parameters),
      })),
    },
  };
}
