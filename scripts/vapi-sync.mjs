// Pushes the repository's Vapi configuration (the canonical source) to Vapi:
// the two function tools, then the assistant with the prompt from prompts/.
//
//   node --env-file=.env.local scripts/vapi-sync.mjs --dry-run   # print payloads, call nothing
//   node --env-file=.env.local scripts/vapi-sync.mjs             # create or update in Vapi
//
// Env (setup only, never read by the backend):
//   VAPI_API_KEY              Vapi private API key
//   VAPI_TOOL_CREDENTIAL_ID   Vapi Bearer Token credential holding VAPI_WEBHOOK_TOKEN
//   APP_BASE_URL              production backend URL, e.g. https://<project>.vercel.app
//   VAPI_VOICE_ID             ElevenLabs voice chosen manually (required on first create;
//                             if unset later, the assistant's current voice is kept)
//   VAPI_ASSISTANT_ID         optional; otherwise the assistant is found by name or created
//
// Tools are matched by function name, so re-running updates instead of duplicating.
// Nothing secret is printed.

import { readFile } from "node:fs/promises";

const API = "https://api.vapi.ai";
const dryRun = process.argv.includes("--dry-run");
const root = new URL("..", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

const TOOLS = [
  { file: "vapi/tools/submit_booking_request.json", path: "/api/vapi/tools/booking-request" },
  { file: "vapi/tools/submit_callback_request.json", path: "/api/vapi/tools/callback-request" },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set (load it with --env-file=.env.local).`);
    process.exit(2);
  }
  return value;
}

const apiKey = dryRun ? process.env.VAPI_API_KEY : requireEnv("VAPI_API_KEY");
const credentialId = requireEnv("VAPI_TOOL_CREDENTIAL_ID");
const baseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
const voiceId = process.env.VAPI_VOICE_ID?.trim() || undefined;

if (!baseUrl.startsWith("https://")) {
  console.error("APP_BASE_URL must be the https production URL.");
  process.exit(2);
}

async function vapi(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Vapi ${method} ${path} failed: HTTP ${response.status}\n${text.slice(0, 2000)}`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : undefined;
}

// --- tools ---------------------------------------------------------------

const toolPayloads = [];
for (const tool of TOOLS) {
  const definition = await readJson(tool.file);
  toolPayloads.push({
    ...definition,
    server: { url: `${baseUrl}${tool.path}`, credentialId, timeoutSeconds: 20 },
  });
}

// --- assistant -----------------------------------------------------------

const prompt = await readFile(new URL("prompts/tire-shop-agent-v0.md", root), "utf8");
const assistantBase = await readJson("vapi/assistant.json");

function assistantPayload(toolIds, existingVoiceId) {
  const resolvedVoiceId = voiceId ?? existingVoiceId;
  if (!resolvedVoiceId && !dryRun) {
    console.error("VAPI_VOICE_ID is required the first time (choose a Swedish ElevenLabs voice).");
    process.exit(2);
  }
  return {
    ...assistantBase,
    model: {
      ...assistantBase.model,
      messages: [{ role: "system", content: prompt }],
      toolIds,
    },
    voice: { ...assistantBase.voice, voiceId: resolvedVoiceId ?? "<VAPI_VOICE_ID>" },
  };
}

if (dryRun) {
  for (const payload of toolPayloads) {
    console.log(`\n# tool ${payload.function.name}\n${JSON.stringify(payload, null, 2)}`);
  }
  const preview = assistantPayload(["<booking tool id>", "<callback tool id>"]);
  preview.model.messages[0].content = `<${prompt.length} characters from prompts/tire-shop-agent-v0.md>`;
  console.log(`\n# assistant\n${JSON.stringify(preview, null, 2)}`);
  process.exit(0);
}

const existingTools = await vapi("GET", "/tool?limit=1000");
const toolIds = [];
for (const payload of toolPayloads) {
  const name = payload.function.name;
  const matches = existingTools.filter((t) => t.type === "function" && t.function?.name === name);
  if (matches.length > 1) {
    console.error(`Found ${matches.length} Vapi tools named ${name}; delete the extras first.`);
    process.exit(1);
  }
  const saved = matches[0]
    ? await vapi("PATCH", `/tool/${matches[0].id}`, payload)
    : await vapi("POST", "/tool", payload);
  console.log(`${matches[0] ? "Updated" : "Created"} tool ${name}: ${saved.id}`);
  toolIds.push(saved.id);
}

let assistantId = process.env.VAPI_ASSISTANT_ID?.trim() || undefined;
let existingAssistant;
if (assistantId) {
  existingAssistant = await vapi("GET", `/assistant/${assistantId}`);
} else {
  const assistants = await vapi("GET", "/assistant?limit=1000");
  existingAssistant = assistants.find((a) => a.name === assistantBase.name);
  assistantId = existingAssistant?.id;
}

const payload = assistantPayload(toolIds, existingAssistant?.voice?.voiceId);
const savedAssistant = assistantId
  ? await vapi("PATCH", `/assistant/${assistantId}`, payload)
  : await vapi("POST", "/assistant", payload);

console.log(`${assistantId ? "Updated" : "Created"} assistant "${savedAssistant.name}": ${savedAssistant.id}`);
if (!process.env.VAPI_ASSISTANT_ID) {
  console.log(`Add VAPI_ASSISTANT_ID=${savedAssistant.id} to .env.local.`);
}
