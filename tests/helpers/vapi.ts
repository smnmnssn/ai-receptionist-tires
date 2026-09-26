export const TEST_TOKEN = "test-webhook-token";

export const testEnv = {
  RESEND_API_KEY: "re_test_key",
  VAPI_WEBHOOK_TOKEN: TEST_TOKEN,
  BOOKING_NOTIFICATION_EMAIL: "verkstad@example.com",
  EMAIL_FROM: "AI-telefonist <noreply@example.com>",
  APP_BASE_URL: "https://example.vercel.app",
};

export const CALL_CREATED_AT = "2026-09-25T16:43:00.000Z";

type ToolCallInput = { id: string; name: string; arguments: unknown };

/** A tool-calls message shaped like Vapi's OpenAPI ServerMessageToolCalls. */
export function toolCallsBody(toolCalls: ToolCallInput[], call: object | null = {}) {
  return {
    message: {
      type: "tool-calls",
      timestamp: 1790354580000,
      ...(call === null
        ? {}
        : { call: { id: "vapi-call-1", orgId: "org-1", createdAt: CALL_CREATED_AT, ...call } }),
      toolCallList: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: { name: toolCall.name, arguments: toolCall.arguments },
      })),
      toolWithToolCallList: [],
    },
  };
}

export function vapiRequest(
  path: string,
  body: unknown,
  authorization: string | null = `Bearer ${TEST_TOKEN}`,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
