import { describe, expect, it } from "vitest";
import { isAuthorized } from "@/lib/vapi/auth";
import { parseToolCallMessage } from "@/lib/vapi/parse-tool-call";
import {
  FAILURE_MESSAGE,
  httpErrorResponse,
  toolFailure,
  toolResultsResponse,
  toolSuccess,
} from "@/lib/vapi/responses";
import { CALL_CREATED_AT, toolCallsBody } from "./helpers/vapi";

describe("isAuthorized", () => {
  it("accepts the configured bearer token", () => {
    expect(isAuthorized("Bearer secret-token", "secret-token")).toBe(true);
    expect(isAuthorized("bearer secret-token", "secret-token")).toBe(true);
  });

  it("rejects missing authentication", () => {
    expect(isAuthorized(null, "secret-token")).toBe(false);
    expect(isAuthorized("", "secret-token")).toBe(false);
  });

  it("rejects invalid authentication", () => {
    expect(isAuthorized("Bearer wrong-token", "secret-token")).toBe(false);
    expect(isAuthorized("Bearer secret-token-extra", "secret-token")).toBe(false);
    expect(isAuthorized("Bearer ", "secret-token")).toBe(false);
    expect(isAuthorized("secret-token", "secret-token")).toBe(false);
    expect(isAuthorized("Basic secret-token", "secret-token")).toBe(false);
  });

  it("never authorizes against an empty expected token", () => {
    expect(isAuthorized("Bearer ", "")).toBe(false);
    expect(isAuthorized("Bearer x", "")).toBe(false);
  });
});

describe("parseToolCallMessage", () => {
  it("parses the documented envelope with JSON-string arguments", () => {
    const body = toolCallsBody([
      { id: "call_abc123", name: "submit_booking_request", arguments: '{"phone":"070"}' },
    ]);

    const parsed = parseToolCallMessage(body);

    expect(parsed).toEqual({
      ok: true,
      message: {
        callId: "vapi-call-1",
        callTime: new Date(CALL_CREATED_AT),
        toolCalls: [{ id: "call_abc123", name: "submit_booking_request", arguments: { phone: "070" } }],
      },
    });
  });

  it("accepts object arguments", () => {
    const parsed = parseToolCallMessage(
      toolCallsBody([{ id: "call_1", name: "submit_callback_request", arguments: { phone: "070" } }]),
    );

    expect(parsed.ok && parsed.message.toolCalls[0].arguments).toEqual({ phone: "070" });
  });

  it("accepts the flat { id, name, parameters } shape", () => {
    const parsed = parseToolCallMessage({
      message: {
        type: "tool-calls",
        call: { createdAt: CALL_CREATED_AT },
        toolCallList: [{ id: "abc123", name: "submit_booking_request", parameters: { phone: "070" } }],
      },
    });

    expect(parsed.ok && parsed.message.toolCalls[0]).toEqual({
      id: "abc123",
      name: "submit_booking_request",
      arguments: { phone: "070" },
    });
  });

  it("keeps unparsable argument strings as strings for domain validation to reject", () => {
    const parsed = parseToolCallMessage(
      toolCallsBody([{ id: "call_1", name: "submit_booking_request", arguments: "{not json" }]),
    );

    expect(parsed.ok && parsed.message.toolCalls[0].arguments).toBe("{not json");
  });

  it("rejects messages that are not tool-calls", () => {
    expect(parseToolCallMessage({ message: { type: "status-update", status: "ended" } })).toEqual({
      ok: false,
      reason: "not_tool_calls",
    });
  });

  it.each([
    ["null body", null],
    ["empty object", {}],
    ["no toolCallList", { message: { type: "tool-calls" } }],
    ["empty toolCallList", { message: { type: "tool-calls", toolCallList: [] } }],
    ["tool call without id", { message: { type: "tool-calls", toolCallList: [{ function: { name: "x" } }] } }],
    ["empty id", { message: { type: "tool-calls", toolCallList: [{ id: "", function: { name: "x" } }] } }],
  ])("rejects an invalid envelope: %s", (_label, body) => {
    expect(parseToolCallMessage(body)).toEqual({ ok: false, reason: "invalid_envelope" });
  });

  describe("call time", () => {
    const withCall = (call: object | null) =>
      parseToolCallMessage(toolCallsBody([{ id: "c", name: "t", arguments: {} }], call));

    it("prefers call.createdAt", () => {
      const parsed = withCall({ startedAt: "2026-09-25T16:44:00.000Z" });
      expect(parsed.ok && parsed.message.callTime).toEqual(new Date(CALL_CREATED_AT));
    });

    it("falls back to call.startedAt, then message.timestamp", () => {
      const started = withCall({ createdAt: undefined, startedAt: "2026-09-25T16:44:00.000Z" });
      expect(started.ok && started.message.callTime).toEqual(new Date("2026-09-25T16:44:00.000Z"));

      const timestamp = withCall(null);
      expect(timestamp.ok && timestamp.message.callTime).toEqual(new Date(1790354580000));
    });

    it("is undefined when no stable time is present, never the current time", () => {
      const parsed = parseToolCallMessage({
        message: {
          type: "tool-calls",
          call: { createdAt: "not a date" },
          toolCallList: [{ id: "c", function: { name: "t", arguments: {} } }],
        },
      });
      expect(parsed.ok && parsed.message.callTime).toBeUndefined();
    });
  });
});

describe("Vapi responses", () => {
  it("formats a Vapi-compatible success response", async () => {
    const response = toolResultsResponse([
      toolSuccess("call_abc123", "submit_booking_request", "Booking request submitted successfully."),
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          name: "submit_booking_request",
          toolCallId: "call_abc123",
          result: '{"success":true,"message":"Booking request submitted successfully."}',
        },
      ],
    });
  });

  it("formats a Vapi-compatible failure response with HTTP 200 and results[].error", async () => {
    const response = toolResultsResponse([
      toolFailure("call_abc123", "submit_booking_request", ["phone"]),
    ]);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0]).not.toHaveProperty("result");
    expect(body.results[0].toolCallId).toBe("call_abc123");
    expect(JSON.parse(body.results[0].error)).toEqual({
      success: false,
      message: FAILURE_MESSAGE,
      invalidFields: ["phone"],
    });
  });

  it("uses single-line string results and errors", () => {
    const success = toolSuccess("c", "t", "ok");
    const failure = toolFailure("c", "t", ["a", "b"]);

    expect("result" in success && typeof success.result).toBe("string");
    expect("error" in failure && typeof failure.error).toBe("string");
    expect(JSON.stringify(success)).not.toMatch(/\\n/);
    expect(JSON.stringify(failure)).not.toMatch(/\\n/);
  });

  it("omits invalidFields when there are none", () => {
    const failure = toolFailure("c", "t");
    expect("error" in failure && JSON.parse(failure.error)).toEqual({
      success: false,
      message: FAILURE_MESSAGE,
    });
  });

  it("formats plain HTTP errors without internal details", async () => {
    const response = httpErrorResponse(401, "Unauthorized");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
