import type { z } from "zod";
import type { SendEmailResult } from "@/lib/email/resend";
import { getServerEnv } from "@/lib/env";
import { isAuthorized } from "./auth";
import { parseToolCallMessage, type ParsedToolCall } from "./parse-tool-call";
import {
  httpErrorResponse,
  toolFailure,
  toolResultsResponse,
  toolSuccess,
  type ToolCallResult,
} from "./responses";

export type ToolEndpointConfig<T> = {
  /** The only tool name this endpoint accepts. */
  toolName: string;
  schema: z.ZodType<T>;
  normalize: (request: T) => T;
  submit: (input: { toolCallId: string; request: T; callTime: Date }) => Promise<SendEmailResult>;
  successMessage: string;
};

type Outcome =
  | "success"
  | "invalid_arguments"
  | "missing_call_time"
  | "wrong_tool"
  | "submit_failed"
  | "unexpected_error";

// Identifiers and categories only: no arguments, phone numbers, names or bodies.
function logToolCall(details: {
  tool: string | undefined;
  toolCallId: string;
  callId: string | undefined;
  outcome: Outcome;
  errorCategory?: string;
  invalidFields?: string[];
}) {
  const log = details.outcome === "success" ? console.info : console.error;
  log({ event: "vapi_tool_call", ...details });
}

function invalidFieldNames(error: z.ZodError): string[] {
  const names = error.issues.map((issue) =>
    issue.path.length > 0 ? issue.path.join(".") : "arguments",
  );
  return [...new Set(names)];
}

async function handleToolCall<T>(
  toolCall: ParsedToolCall,
  context: { callId: string | undefined; callTime: Date | undefined },
  config: ToolEndpointConfig<T>,
): Promise<ToolCallResult> {
  const { id: toolCallId } = toolCall;
  const log = (outcome: Outcome, extra: { errorCategory?: string; invalidFields?: string[] } = {}) =>
    logToolCall({ tool: config.toolName, toolCallId, callId: context.callId, outcome, ...extra });

  try {
    const validation = config.schema.safeParse(toolCall.arguments);
    if (!validation.success) {
      const invalidFields = invalidFieldNames(validation.error);
      log("invalid_arguments", { invalidFields });
      return toolFailure(toolCallId, config.toolName, invalidFields);
    }

    // Never substitute `new Date()`: a retry would render a different email under the
    // same idempotency key. Fail instead so the assistant does not claim success.
    if (!context.callTime) {
      log("missing_call_time");
      return toolFailure(toolCallId, config.toolName);
    }

    const request = config.normalize(validation.data);
    const sent = await config.submit({ toolCallId, request, callTime: context.callTime });

    if (!sent.ok) {
      log("submit_failed", { errorCategory: sent.errorCategory });
      return toolFailure(toolCallId, config.toolName);
    }

    log("success");
    return toolSuccess(toolCallId, config.toolName, config.successMessage);
  } catch {
    log("unexpected_error");
    return toolFailure(toolCallId, config.toolName);
  }
}

/**
 * Pipeline: authentication → envelope/tool validation → Zod domain validation →
 * normalization → side effect. Returns Vapi-compatible responses.
 */
export async function handleToolRequest<T>(
  request: Request,
  config: ToolEndpointConfig<T>,
): Promise<Response> {
  let expectedToken: string;
  try {
    expectedToken = getServerEnv().VAPI_WEBHOOK_TOKEN;
  } catch {
    // Fail closed: without a configured token nothing can be authenticated.
    console.error({ event: "vapi_tool_request_rejected", tool: config.toolName, reason: "configuration" });
    return httpErrorResponse(500, "Server misconfigured");
  }

  if (!isAuthorized(request.headers.get("authorization"), expectedToken)) {
    console.warn({ event: "vapi_tool_request_rejected", tool: config.toolName, reason: "unauthorized" });
    return httpErrorResponse(401, "Unauthorized");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return httpErrorResponse(400, "Invalid JSON");
  }

  const parsed = parseToolCallMessage(body);
  if (!parsed.ok) {
    console.warn({ event: "vapi_tool_request_rejected", tool: config.toolName, reason: parsed.reason });
    return httpErrorResponse(400, "Expected a Vapi tool-calls message");
  }

  const { callId, callTime, toolCalls } = parsed.message;
  const expected = toolCalls.filter((toolCall) => toolCall.name === config.toolName);

  // No call for this endpoint's tool: answer every tool call with an error so the
  // assistant is not left waiting and cannot claim success. Nothing is processed.
  if (expected.length === 0) {
    return toolResultsResponse(
      toolCalls.map((toolCall) => {
        logToolCall({ tool: toolCall.name, toolCallId: toolCall.id, callId, outcome: "wrong_tool" });
        return toolFailure(toolCall.id, toolCall.name ?? config.toolName);
      }),
    );
  }

  // Tool calls for other tools are left for their own endpoints.
  const results: ToolCallResult[] = [];
  for (const toolCall of expected) {
    results.push(await handleToolCall(toolCall, { callId, callTime }, config));
  }
  return toolResultsResponse(results);
}
