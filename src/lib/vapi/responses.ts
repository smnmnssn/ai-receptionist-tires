// All Vapi response formatting lives here.
//
// Vapi contract (ServerMessageResponseToolCalls / ToolCallResult):
//   HTTP 200 { "results": [ { "name": "...", "toolCallId": "...", "result": "..." } ] }
//   HTTP 200 { "results": [ { "name": "...", "toolCallId": "...", "error": "..." } ] }
// `result`/`error` must be single-line strings. Vapi ignores non-200 responses, so tool
// failures that can be tied to a toolCallId are returned as 200 + `error`.

export type ToolCallResult =
  | { name: string; toolCallId: string; result: string }
  | { name: string; toolCallId: string; error: string };

export const FAILURE_MESSAGE = "Could not submit the request.";

export function toolSuccess(toolCallId: string, name: string, message: string): ToolCallResult {
  return { name, toolCallId, result: JSON.stringify({ success: true, message }) };
}

/**
 * `invalidFields` holds field names only (never values) so the assistant can ask the
 * caller again for exactly what was missing.
 */
export function toolFailure(
  toolCallId: string,
  name: string,
  invalidFields?: string[],
): ToolCallResult {
  const body =
    invalidFields && invalidFields.length > 0
      ? { success: false, message: FAILURE_MESSAGE, invalidFields }
      : { success: false, message: FAILURE_MESSAGE };
  return { name, toolCallId, error: JSON.stringify(body) };
}

export function toolResultsResponse(results: ToolCallResult[]): Response {
  return Response.json({ results }, { status: 200 });
}

/** For requests that cannot be tied to a tool call (auth, malformed envelope, server). */
export function httpErrorResponse(status: 400 | 401 | 500, error: string): Response {
  return Response.json({ error }, { status });
}
