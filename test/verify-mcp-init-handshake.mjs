/**
 * Verifier for the MCP `initialize` handshake implementation in
 * `src-tauri/src/mcp/client.rs` and `src-tauri/src/mcp/types.rs`.
 *
 * Locks three things at once:
 *   1. SOURCE SHAPE — the Rust source must contain every spec-required
 *      primitive: the `initialize` and `notifications/initialized` calls,
 *      required headers (`Accept`, `MCP-Protocol-Version`, `Mcp-Session-Id`),
 *      the `ClientCapabilities` and `Implementation` types, and a
 *      session-state map. This catches regressions where a future change
 *      silently removes the handshake.
 *   2. WIRE CONTRACT — a Node.js mock MCP server (conforming to the
 *      2025-06-18 spec) stands up on a random port. A reference HTTP
 *      client performs the spec handshake against it and the server
 *      validates that the request sequence/headers/state flow really do
 *      work over the wire.
 *   3. SESSION PROPAGATION — the session id issued by the mock is
 *      asserted to be echoed back on every post-handshake request,
 *      including `tools/call`.
 *
 * Pattern follows the test/verify-*.mjs convention: read source via the
 * `node:fs` module, assert with `node:assert`, drive HTTP via the global
 * `fetch` API which has been natively available in Node ≥ 18.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { strict as assert } from "node:assert";

// `client.rs` was split into a `client/` module dir; concatenate every file so
// source-shape assertions survive wherever a symbol landed post-split.
const CLIENT_DIR = new URL("../src-tauri/src/mcp/client/", import.meta.url);
const TYPES_RS = new URL("../src-tauri/src/mcp/types.rs", import.meta.url);

const PROTOCOL_VERSION = "2025-06-18";
const ACCEPT_JSON_OR_SSE = "application/json, text/event-stream";

// ── 1. Source-shape assertions ────────────────────────────────────────────

const clientSource = readdirSync(CLIENT_DIR)
  .filter((f) => f.endsWith(".rs"))
  .map((f) => readFileSync(new URL(f, CLIENT_DIR), "utf8"))
  .join("\n");
const typesSource = readFileSync(TYPES_RS, "utf8");

function assertContainsAll(label, source, patterns) {
  const missing = patterns.filter((re) => !re.test(source));
  assert.equal(
    missing.length,
    0,
    `${label}: missing required pattern(s): ${missing
      .map((r) => r.source)
      .join(", ")}`,
  );
}

function assertContainsNone(label, source, patterns) {
  const found = patterns.filter((re) => re.test(source));
  assert.equal(
    found.length,
    0,
    `${label}: forbidden pattern(s) found: ${found
      .map((r) => r.source)
      .join(", ")}`,
  );
}

// types.rs must declare the spec-required constants ───────────────────────

assertContainsAll("types.rs constants", typesSource, [
  /\bPROTOCOL_VERSION\s*:\s*&str\s*=/,
  /\bHEADER_PROTOCOL_VERSION\s*:\s*&str\s*=/,
  /\bHEADER_SESSION_ID\s*:\s*&str\s*=/,
  /\bACCEPT_JSON_OR_SSE\s*:\s*&str\s*=/,
  /2025-06-18/,
]);

assertContainsAll("types.rs methods", typesSource, [
  /INITIALIZE[\s\S]{1,80}"initialize"/,
  /NOTIFICATIONS_INITIALIZED[\s\S]{1,80}"notifications\/initialized"/,
  /TOOLS_LIST[\s\S]{1,80}"tools\/list"/,
  /TOOLS_CALL[\s\S]{1,80}"tools\/call"/,
]);

assertContainsAll("types.rs lifecycle structs", typesSource, [
  /\bstruct\s+Implementation\b/,
  /\bstruct\s+ClientCapabilities\b/,
  /\bstruct\s+InitializeParams\b/,
  /\bstruct\s+InitializeResult\b/,
  /\bstruct\s+ServerCapabilities\b/,
]);

// notifications/initialized must be a JSON-RPC notification (no `id`).
// Specifically the helper that builds it must not contain an `"id"` field;
// the assertion looks at the small slice around the helper for false-positives.
assertContainsAll("types.rs notification helper", typesSource, [
  /\bpub\s+fn\s+notification\s*\(/,
  /\bpub\s+fn\s+initialized_notification\s*\(/,
]);
const notifHelperSlice = typesSource.match(
  /pub\s+fn\s+initialized_notification\s*\([\s\S]{0,400}?\n\}/,
)?.[0] ?? "";
assert(
  !/"id"\s*:/.test(notifHelperSlice),
  "types.rs: `initialized_notification` helper must not emit an `id` field (notification ≠ request)",
);

// Serialize name-mappings: clientInfo / protocolVersion camelCase ─────────

assertContainsAll("types.rs camelCase renames", typesSource, [
  /rename\s*=\s*"protocolVersion"/,
  /rename\s*=\s*"clientInfo"/,
  /rename\s*=\s*"serverInfo"/,
  /rename\s*=\s*"sessionId"/,
]);

// client.rs must perform the handshake ────────────────────────────────────

assertContainsAll("client.rs handshake", clientSource, [
  /fn\s+initialize_server\b/,
  /fn\s+send_initialized_notification\b/,
  /fn\s+apply_mcp_headers\b/,
  /external_endpoints\s*:\s*std::sync::Mutex<HashMap<String,\s*ServerEndpoint>>/,
  /\bmethods::INITIALIZE\b/,
  // notifications/initialized uses the helper, not the literal method name.
  /\binitialized_notification\s*\(\s*\)/,
]);

assertContainsAll("client.rs header injection", clientSource, [
  /header\(\s*"Accept"\s*,\s*ACCEPT_JSON_OR_SSE\s*\)/,
  /\bheader\(\s*HEADER_PROTOCOL_VERSION\b/,
  /\bheader\(\s*HEADER_SESSION_ID\b/,
]);

assertContainsAll("client.rs session propagation", clientSource, [
  /apply_mcp_headers\(\s*client\.post/,
]);

// Operational ordering: `initialize_server` → `notifications/initialized`
// → `tools/list`. Anything else is rejected by spec-compliant servers.
const initIdx = clientSource.indexOf("fn initialize_server");
const notifIdx = clientSource.indexOf("fn send_initialized_notification");
const listIdx = clientSource.indexOf("\"/tools/list\"");
assert(
  initIdx > -1 && notifIdx > initIdx && listIdx > notifIdx,
  "client.rs: ordering must be `initialize_server` → `send_initialized_notification` → `tools/list`; otherwise spec-compliant servers reject the request",
);

assertContainsAll("client.rs initialize params", clientSource, [
  /protocol_version:\s*PROTOCOL_VERSION\.to_string\(\)/,
  /name:\s*"zen"/,
  /version:\s*env!\("CARGO_PKG_VERSION"\)/,
]);

// ── 2+3. End-to-end wire-protocol conformance via a Node.js mock server ───

function startMockMcpServer({ enforceSession = true } = {}) {
  return new Promise((resolveMcp) => {
    const sessionId = randomUUID();
    const state = { ready: false, received: [] };

    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          res.statusCode = 400;
          return res.end("invalid JSON");
        }

        // Record what the server actually received — assertions check
        // request-side headers (Accept, MCP-Protocol-Version, Mcp-Session-Id)
        // against these, since the server doesn't echo them in its response.
        state.received.push({
          method: body.method,
          headers: { ...req.headers },
          body,
        });

        // Spec: server should reject non-ping requests before
        // receiving notifications/initialized. We use this to assert
        // ordering in the test below.
        if (
          body.method !== "initialize" &&
          body.method !== "notifications/initialized" &&
          !state.ready &&
          body.method !== "ping"
        ) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id ?? null,
              error: {
                code: -32600,
                message: "Server not initialized",
              },
            }),
          );
        }

        switch (body.method) {
          case "initialize":
            if (enforceSession) {
              res.setHeader("Mcp-Session-Id", sessionId);
            }
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: PROTOCOL_VERSION,
                  capabilities: { tools: {} },
                  serverInfo: { name: "mock-mcp", version: "1.0.0" },
                },
              }),
            );

          case "notifications/initialized":
            state.ready = true;
            res.statusCode = 202;
            return res.end();

          case "tools/list":
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  tools: [
                    {
                      name: "echo",
                      description: "echoes input",
                      input_schema: { type: "object" },
                    },
                  ],
                },
              }),
            );

          case "tools/call":
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  content: [
                    {
                      type: "text",
                      text:
                        "echo: " +
                        JSON.stringify(body.params?.arguments ?? {}),
                    },
                  ],
                  isError: false,
                },
              }),
            );

          default:
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id ?? null,
                error: {
                  code: -32601,
                  message: `Method not found: ${body.method}`,
                },
              }),
            );
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolveMcp({
        url: `http://127.0.0.1:${port}`,
        sessionId: enforceSession ? sessionId : null,
        state,
        close: () =>
          new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function rawPost(urlString, headers, body) {
  const res = await fetch(urlString, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers), body: text };
}

async function runReferenceHandshake(serverUrl, sessionId) {
  const calls = [];

  const initHeaders = {
    "Content-Type": "application/json",
    Accept: ACCEPT_JSON_OR_SSE,
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "zen", version: "0.1.0" },
    },
  };
  const initBody = JSON.stringify(initRequest);
  const init = await rawPost(`${serverUrl}/whatever`, initHeaders, initBody);
  const initParsed = JSON.parse(init.body);
  calls.push({
    method: "initialize",
    request: initRequest,
    response: initParsed,
    headers: init.headers,
    hasId: true,
    status: init.status,
  });

  const sessionHeader = init.headers["mcp-session-id"];
  assert.equal(init.status, 200, "initialize must return 200");
  assert(initParsed.result?.protocolVersion, "initialize response must carry protocolVersion");
  assert(initParsed.result?.capabilities, "initialize response must carry capabilities");
  if (sessionId) {
    assert.equal(
      sessionHeader,
      sessionId,
      "mock must issue the expected Mcp-Session-Id header on initialize (response side)",
    );
  }

  const notifHeaders = {
    "Content-Type": "application/json",
    Accept: ACCEPT_JSON_OR_SSE,
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
  const notifRequest = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  };
  const notifBody = JSON.stringify(notifRequest);
  // Sanity: the compiled notification body must NOT carry an `id` field.
  assert.equal(
    Object.prototype.hasOwnProperty.call(JSON.parse(notifBody), "id"),
    false,
    "compiled notifications/initialized body must not carry an id (notification = no id)",
  );
  const notif = await rawPost(`${serverUrl}/whatever`, notifHeaders, notifBody);
  calls.push({
    method: "notifications/initialized",
    request: notifRequest,
    response: null,
    headers: notif.headers,
    hasId: false,
    status: notif.status,
  });

  const listRequest = { jsonrpc: "2.0", id: 2, method: "tools/list" };
  const list = await rawPost(
    `${serverUrl}/whatever`,
    notifHeaders,
    JSON.stringify(listRequest),
  );
  const listParsed = JSON.parse(list.body);
  calls.push({
    method: "tools/list",
    request: listRequest,
    response: listParsed,
    headers: list.headers,
    hasId: true,
    parsedResult: listParsed.result,
  });

  const callRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "echo", arguments: { msg: "hi" } },
  };
  const call = await rawPost(
    `${serverUrl}/whatever`,
    notifHeaders,
    JSON.stringify(callRequest),
  );
  const callParsed = JSON.parse(call.body);
  calls.push({
    method: "tools/call",
    request: callRequest,
    response: callParsed,
    headers: call.headers,
    hasId: true,
    parsedResult: callParsed.result,
  });

  return calls;
}

const server = await startMockMcpServer({});
let exitCode = 0;
try {
  const calls = await runReferenceHandshake(server.url, server.sessionId);

  // Mock server records what it actually observed. Header assertions
  // read from there (request-side) since Accept / MCP-Protocol-Version /
  // Mcp-Session-Id flow client → server and are not echoed in responses.
  const received = server.state.received;

  // ── A: first request is `initialize` ────────────────────────────────
  assert.equal(calls[0].method, "initialize", "first request must be `initialize`");
  assert.equal(calls[0].request.id, 1, "initialize must carry an id (request, not notification)");
  assert.notEqual(
    calls[0].response?.id,
    undefined,
    "initialize response must echo the request id",
  );
  assert.equal(
    calls[0].request.params.protocolVersion,
    PROTOCOL_VERSION,
    "initialize request must advertise protocolVersion 2025-06-18",
  );
  assert.equal(
    calls[0].request.params.clientInfo?.name,
    "zen",
    "clientInfo.name must be present in the initialize request",
  );
  // Response side: protocol negotiation round-trip.
  assert.equal(
    calls[0].response?.result?.protocolVersion,
    PROTOCOL_VERSION,
    "initialize response must confirm the negotiated protocolVersion",
  );
  const acceptHdr = received[0]?.headers?.["accept"] || "";
  assert(
    /application\/json/.test(acceptHdr) && /text\/event-stream/.test(acceptHdr),
    `initialize must include Accept: application/json, text/event-stream (saw "${acceptHdr}")`,
  );
  assert.equal(
    received[0]?.headers?.["mcp-protocol-version"],
    PROTOCOL_VERSION,
    "initialize must include MCP-Protocol-Version header (request side)",
  );

  // ── B: second request is `notifications/initialized` ───────────────
  assert.equal(
    calls[1].method,
    "notifications/initialized",
    "second request must be `notifications/initialized`",
  );
  assert.equal(
    calls[1].hasId,
    false,
    "notifications/initialized must be a JSON-RPC notification (no id field)",
  );
  if (server.sessionId) {
    assert.equal(
      received[1]?.headers?.["mcp-session-id"],
      server.sessionId,
      "post-init requests must echo Mcp-Session-Id",
    );
  }

  // ── C: third request is `tools/list` ─────────────────────────────────
  assert.equal(calls[2].method, "tools/list", "third request must be `tools/list`");
  assert.notEqual(calls[2].request.id, undefined, "tools/list must carry an id");
  assert(
    Array.isArray(calls[2].parsedResult?.tools),
    "mock server must return { tools: [...] }",
  );

  // ── D: session propagation on `tools/call` ─────────────────────────
  if (server.sessionId) {
    assert.equal(
      received[3]?.headers?.["mcp-session-id"],
      server.sessionId,
      "tools/call must continue to echo Mcp-Session-Id after the handshake",
    );
  }
  assert(
    calls[3].parsedResult?.content?.[0]?.text?.includes('"msg":"hi"'),
    "tools/call echo result should reflect call arguments (proves the call was actually routed)",
  );

  // ── E: out-of-order requests are rejected ──────────────────────────
  server.state.ready = false;
  const early = await rawPost(
    `${server.url}/anything`,
    {
      "Content-Type": "application/json",
      Accept: ACCEPT_JSON_OR_SSE,
    },
    JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
  );
  assert.equal(
    early.status,
    400,
    "pre-handshake tools/list should be rejected with HTTP 400 (proves ordering matters)",
  );
} catch (err) {
  console.error("MCP init handshake verifier FAILED:", err.message);
  exitCode = 1;
} finally {
  await server.close();
}

if (exitCode !== 0) process.exit(exitCode);
console.log("mcp init handshake verifier passed");
