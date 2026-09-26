// Smoke test for a deployed backend. Never prints the webhook token.
//
//   node --env-file=.env.local scripts/smoke-test.mjs https://<project>.vercel.app
//   node --env-file=.env.local scripts/smoke-test.mjs https://<project>.vercel.app --send-test-email
//
// Default checks never reach the email layer (auth failures, malformed envelopes,
// validation failures). `--send-test-email` sends ONE clearly marked test booking to
// BOOKING_NOTIFICATION_EMAIL, twice with the same toolCallId, to verify Resend + idempotency.

const [baseUrlArg, ...flags] = process.argv.slice(2);
const sendTestEmail = flags.includes("--send-test-email");
const token = process.env.VAPI_WEBHOOK_TOKEN;

if (!baseUrlArg || !/^https?:\/\//.test(baseUrlArg)) {
  console.error("Usage: node --env-file=.env.local scripts/smoke-test.mjs <base-url> [--send-test-email]");
  process.exit(2);
}
if (!token) {
  console.error("VAPI_WEBHOOK_TOKEN is not set (load it with --env-file=.env.local).");
  process.exit(2);
}

const baseUrl = baseUrlArg.replace(/\/+$/, "");
let failures = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${!condition && detail ? `  (${detail})` : ""}`);
  if (!condition) failures++;
}

async function request(path, { method = "POST", auth, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  // The token must never be echoed back.
  if (text.includes(token)) check(`${path} response does not echo the token`, false);
  return { status: response.status, json, text, headers: response.headers };
}

function toolCallsBody(id, name, args) {
  return {
    message: {
      type: "tool-calls",
      timestamp: Date.now(),
      call: { id: "smoke-test-call", createdAt: new Date().toISOString() },
      toolCallList: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
    },
  };
}

const bearer = `Bearer ${token}`;
const tools = [
  { path: "/api/vapi/tools/booking-request", name: "submit_booking_request" },
  { path: "/api/vapi/tools/callback-request", name: "submit_callback_request" },
];

console.log(`Smoke testing ${baseUrl}\n`);

const health = await request("/api/health", { method: "GET" });
if (health.status === 401 && !health.json) {
  console.log("Hint: a 401 HTML page usually means Vercel Deployment Protection is on for this URL.");
}
check("GET /api/health returns 200", health.status === 200, `got ${health.status}`);
check("GET /api/health body is exactly {\"ok\":true}", JSON.stringify(health.json) === '{"ok":true}');
check("no X-Powered-By header", !health.headers.get("x-powered-by"));

for (const tool of tools) {
  const valid = toolCallsBody("smoke-invalid", tool.name, {});

  const noAuth = await request(tool.path, { body: valid });
  check(`${tool.path} without auth -> 401`, noAuth.status === 401, `got ${noAuth.status}`);

  const badAuth = await request(tool.path, { auth: "Bearer not-the-token", body: valid });
  check(`${tool.path} with wrong token -> 401`, badAuth.status === 401, `got ${badAuth.status}`);

  const rawToken = await request(tool.path, { auth: token, body: valid });
  check(`${tool.path} without Bearer prefix -> 401`, rawToken.status === 401, `got ${rawToken.status}`);

  const badJson = await request(tool.path, { auth: bearer, body: "{not json" });
  check(`${tool.path} authorized, invalid JSON -> 400`, badJson.status === 400, `got ${badJson.status}`);

  const wrongType = await request(tool.path, { auth: bearer, body: { message: { type: "status-update" } } });
  check(`${tool.path} authorized, not tool-calls -> 400`, wrongType.status === 400, `got ${wrongType.status}`);

  // Reaches the tool-result stage but fails validation: no email is sent.
  const invalid = await request(tool.path, { auth: bearer, body: valid });
  const result = invalid.json?.results?.[0];
  check(`${tool.path} invalid arguments -> 200`, invalid.status === 200, `got ${invalid.status}: ${invalid.text.slice(0, 120)}`);
  check(`${tool.path} result is tied to the toolCallId`, result?.toolCallId === "smoke-invalid");
  check(`${tool.path} returns error, not result`, typeof result?.error === "string" && !("result" in (result ?? {})));
  check(
    `${tool.path} error lists invalid fields`,
    Array.isArray(result?.error && JSON.parse(result.error).invalidFields),
  );

  const otherTool = tool.name === "submit_booking_request" ? "submit_callback_request" : "submit_booking_request";
  const wrongTool = await request(tool.path, { auth: bearer, body: toolCallsBody("smoke-wrong-tool", otherTool, {}) });
  check(
    `${tool.path} rejects tool ${otherTool}`,
    wrongTool.status === 200 && typeof wrongTool.json?.results?.[0]?.error === "string",
  );
}

if (sendTestEmail) {
  const toolCallId = `smoke-test-${Date.now()}`;
  const body = toolCallsBody(toolCallId, "submit_booking_request", {
    customerName: "TEST – smoke test (ingen kund)",
    phone: "000-000 00 00",
    service: "OTHER",
    description: "Automatiskt testmejl från smoke test. Ingen åtgärd krävs.",
  });

  const first = await request("/api/vapi/tools/booking-request", { auth: bearer, body });
  const retry = await request("/api/vapi/tools/booking-request", { auth: bearer, body });
  for (const [label, response] of [["first send", first], ["retry, same toolCallId", retry]]) {
    const r = response.json?.results?.[0];
    check(
      `test email ${label} -> success`,
      response.status === 200 && typeof r?.result === "string" && JSON.parse(r.result).success === true,
      r?.error ?? `status ${response.status}`,
    );
  }
  console.log(`\nCheck the demo inbox: exactly ONE email for toolCallId ${toolCallId} should arrive.`);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
