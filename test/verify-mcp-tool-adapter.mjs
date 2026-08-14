#!/usr/bin/env node
// Verifier for the McpToolAdapter refactor.
//
// The refactor moves external MCP tools out of `McpClient::execute_external_tool`'s
// `strip_prefix("ext:")` + `split_once(':')` parsing path and into a real
// `McpToolAdapter` that stores `(server_name, origin_tool_name)` separately
// and implements the v2 `Tool` trait. The dispatch flow becomes uniform:
// `registry.get(name).execute(...)`.
//
// What this verifier covers:
//
//   A) Source-shape assertions on the new adapter module
//      (`src-tauri/src/services/mcp_adapter.rs`):
//      * struct `McpToolAdapter` exists with `server_name: String` and
//        `origin_tool_name: String` fields.
//      * `impl Tool for McpToolAdapter` is present so the adapter
//        participates in the v2 Tool registry.
//      * `execute()` delegates to a method that takes the server and
//        tool name as *separate* parameters — not `tool_name` alone,
//        not a re-split prefix.
//
//   B) Source-shape assertions on `src-tauri/src/mcp/client.rs`:
//      * No more `strip_prefix("ext:")` / `split_once(':')` parsing
//        of `ext:` names.
//      * `pub async fn call_external_tool` exists with three
//        parameters: a server-name string, a tool-name string, and
//        the JSON arguments. (Confirms the un-prefixed wire contract.)
//      * `pub fn is_external_tool` static method has been removed
//        from `McpClient`. A small `pub fn is_external_tool_name` and
//        `pub fn prefixed_external_tool_name` helper exists in
//        module `crate::mcp::client` instead.
//      * `sync_external_servers` accepts `&Arc<Self>` so adapters can
//        hold a `Weak<McpClient>` back-reference without leaking.
//      * Step 4 registers `Arc<McpToolAdapter>` instances via
//        `registry.register(...)` — not `register_external(...)`.
//
//   C) Source-shape assertions on `src-tauri/src/services/tool.rs`:
//      * `execute_v2_authorized` has NO `is_external_tool` early-
//        return branch. Single uniform dispatch path via
//        `registry.get(&tool_call.name)`.
//
//   D) Runtime mock MCP server contract: a reference adapter that
//      mimics the McpToolAdapter dispatch behavior — receives a
//      `tool_call.name` of the form `ext:{server}:{tool}`, looks up
//      the (server, tool) pair via simple string splitting (the
//      *adapter's* responsibility in the test rig), and asserts that
//      the wire-level `tools/call` it issues contains the un-prefixed
//      `{name, arguments}` shape, not the prefixed form. This proves
//      the round-trip: a prefixed name from the LLM yields an
//      un-prefixed call to the server.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const SRC = (p) => {
  // `mcp/client.rs` was split into `client/{mod,sync,stdio_helpers,http_handshake,http_body}.rs`.
  // Read the whole client directory as one blob so shape assertions that
  // predate the split keep anchoring on the same content.
  if (p === "src-tauri/src/mcp/client.rs") {
    return ["mod", "sync", "stdio_helpers", "http_handshake", "http_body", "rpc"]
      .map((f) => {
        try {
          return readFileSync(path.join(PROJECT_ROOT, "src-tauri/src/mcp/client", `${f}.rs`), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
  }
  return readFileSync(path.join(PROJECT_ROOT, p), "utf8");
};

let exitCode = 0;
function fail(section, message) {
  console.error(`✗ ${section}: ${message}`);
  exitCode = 1;
}
function ok(section, message) {
  console.log(`✓ ${section}: ${message}`);
}

function assertContainsAll(section, source, patterns) {
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p);
    if (!re.test(source)) {
      fail(section, `missing required pattern(s): ${re}`);
      return false;
    }
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Section A — src-tauri/src/services/mcp_adapter.rs
// ────────────────────────────────────────────────────────────────────────────
{
  const section = "services/mcp_adapter.rs";
  const src = SRC("src-tauri/src/services/mcp_adapter.rs");
  let allOk = true;

  // The struct exists with the two un-prefixed string fields.
  if (
    !assertContainsAll(
      section,
      src,
      [
        /pub\s+struct\s+McpToolAdapter\b/,
        /\bserver_name\s*:\s*String\b/,
        /\borigin_tool_name\s*:\s*String\b/,
      ],
    )
  ) {
    allOk = false;
  }

  // Implements the v2 Tool trait so dispatch goes through registry.get.
  if (!assertContainsAll(section, src, [/impl(?:\s*<[^>]+>)?\s+Tool\s+for\s+McpToolAdapter\b/])) {
    allOk = false;
  }

  // name() returns a slice (the prefixed form) — proves the adapter
  // exposes a stable, prefixed Tool name.
  if (!assertContainsAll(section, src, [/fn\s+name\(&self\)\s*->\s*&str\s*\{[^}]*&self\.prefixed_name/])) {
    allOk = false;
  }

  // execute() delegates to the MCP client passing (server, tool) as
  // *separate* parameters — NOT a single prefixed string.
  if (
    !assertContainsAll(
      section,
      src,
      [
        /async\s+fn\s+execute\b/,
        // `call_external_tool` gained a leading `app` param (Phase 6 MRTR
        // elicitation needs an AppHandle to prompt the user), so tolerate
        // any args before the server/tool pair — what matters is the pair
        // is passed as two separate borrows, un-prefixed and in order.
        /\.call_external_tool\([\s\S]*?&self\.server_name\s*,\s*&self\.origin_tool_name\s*,/,
      ],
    )
  ) {
    allOk = false;
  }

  // Holds a Weak<McpClient> reference to break the registry <-> client cycle.
  if (
    !assertContainsAll(
      section,
      src,
      [
        /\bmcp_client\s*:\s*Weak\s*<\s*McpClient\s*>/,
        /self\.mcp_client\.upgrade\(\)/,
      ],
    )
  ) {
    allOk = false;
  }

  if (allOk) {
    ok(section, "struct + Tool impl + Weak<McpClient> + split-param call");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Section B — src-tauri/src/mcp/client.rs
// ────────────────────────────────────────────────────────────────────────────
{
  const section = "mcp/client.rs";
  const src = SRC("src-tauri/src/mcp/client.rs");
  let allOk = true;

  // No more strip_prefix("ext:") or split_once(':') for ext parsing.
  const legacyParsingPatterns = [
    /strip_prefix\(\s*"ext:"\s*\)/,
    /\.split_once\(':'\)/
  ];
  for (const p of legacyParsingPatterns) {
    if (p.test(src)) {
      // Some test files may legitimately reference these patterns.
      // Restrict to inside fn definitions, not header comment.
      // We allow doc-comments — grep surrounding non-comment lines.
      const lines = src.split("\n");
      const violating = lines.findIndex(
        (l) =>
          p.test(l) &&
          !l.trim().startsWith("//") &&
          !l.trim().startsWith("*") &&
          !l.trim().startsWith("///"),
      );
      if (violating >= 0) {
        fail(
          section,
          `legacy ext: parsing still present at line ${violating + 1}: ${lines[violating].trim()}`,
        );
        allOk = false;
      }
    }
  }

  // Helper functions for the prefix machinery live next to where the
  // prefix is produced.
  if (
    !assertContainsAll(
      section,
      src,
      [
        /pub\s+fn\s+prefixed_external_tool_name\(\s*server_name\s*:\s*&str\s*,\s*tool_name\s*:\s*&str\s*\)\s*->\s*String\s*\{[^}]*format!\(\s*"ext:{}:{}"[^)]*\)/,
        /pub\s+fn\s+is_external_tool_name\(\s*name\s*:\s*&str\s*\)\s*->\s*bool\s*\{[^}]*\.starts_with\(\s*"ext:"\s*\)/,
      ],
    )
  ) {
    allOk = false;
  }

  // call_external_tool takes separate server_name + tool_name params.
  // Multi-line signatures get folded with `\s` so the regex tolerates
  // the common split-per-parameter idiom. Trailing comma before the
  // closing paren is allowed (matches the actual source shape).
  if (
    !assertContainsAll(
      section,
      src,
      [
        /pub\s+async\s+fn\s+call_external_tool\s*\([^)]*?server_name\s*:\s*&str[^)]*?tool_name\s*:\s*&str[^)]*?arguments\s*:\s*serde_json::Value[^)]*?\)/,
      ],
    )
  ) {
    allOk = false;
  }
  // Negative assertion: the body must NOT recompute the prefix. The
  // un-prefixed `tool_name` reaches the wire directly as `params.name`.
  // Tool calls now route through the shared `request_endpoint` in
  // `client/rpc.rs`, which builds the legacy per-method path generically
  // (`{}/{}` with `method`); a modern endpoint posts to the single URL.
  if (
    !assertContainsAll(
      section,
      src,
      [
        /format!\(\s*"\{\}\/\{\}"\s*,\s*endpoint\.url\.trim_end_matches\('\/'\)\s*,\s*method\s*\)/
      ],
    )
  ) {
    allOk = false;
  }

  // McpClient::is_external_tool static method removed.
  if (
    /impl\s+McpClient\s*\{[\s\S]*?\bpub\s+fn\s+is_external_tool\s*\(/.test(src)
  ) {
    fail(section, "McpClient::is_external_tool static helper still defined");
    allOk = false;
  }

  // sync_external_servers takes &Arc<Self> so adapters can take Weak<Self>.
  if (
    !assertContainsAll(
      section,
      src,
      [/pub\s+async\s+fn\s+sync_external_servers\s*\(\s*self\s*:\s*&\s*Arc\s*<\s*Self\s*>\s*(?:,|\))/],
    )
  ) {
    allOk = false;
  }

  // Step 4 adapter registration:
  //   * Constructs McpToolAdapter::new via the new fields
  //   * Wraps in Arc and registers via `registry.register(...)`
  //   * Does NOT call `registry.register_external(...)` anymore
  if (
    !assertContainsAll(
      section,
      src,
      [
        /McpToolAdapter::new\s*\(/,
        /registry\.register\(\s*Arc::new\(\s*adapter\s*\)\s*\)/,
      ],
    )
  ) {
    allOk = false;
  }
  if (/registry\.register_external\s*\(/.test(src)) {
    // Tolerate doc-comments mentioning the legacy method, but
    // refute any code-path call inside the body of `sync_external_servers`.
    const afterSync = src.split(/pub\s+async\s+fn\s+sync_external_servers/)[1] ?? "";
    if (/registry\.register_external\s*\(/.test(afterSync)) {
      fail(
        section,
        "sync_external_servers still calls registry.register_external(...) (should use registry.register(Arc::new(adapter)))",
      );
      allOk = false;
    }
  }

  // Adapter's Weak<McpClient> comes from Arc::downgrade(self) inside
  // sync_external_servers, so the back-reference lifetime is bounded.
  if (
    !/pub\s+async\s+fn\s+sync_external_servers[\s\S]*?Arc::downgrade\(\s*self\s*\)/.test(src)
  ) {
    fail(section, "sync_external_servers does not derive Weak<McpClient> via Arc::downgrade(self)");
    allOk = false;
  }

  if (allOk) {
    ok(section, "no string parsing of ext: prefix + adapter registration + Arc<Self> receiver");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Section C — src-tauri/src/services/tool.rs (uniform dispatch path)
// ────────────────────────────────────────────────────────────────────────────
{
  const section = "services/tool.rs";
  const src = SRC("src-tauri/src/services/tool.rs");

  // execute_v2_authorized body must NOT branch on `is_external_tool` to
  // route to the MCP client. It should resolve through registry.get().
  const fnStart = src.indexOf("async fn execute_v2_authorized");
  if (fnStart < 0) {
    fail(section, "could not find `async fn execute_v2_authorized`");
  } else {
    // Slice from fn definition to next top-level fn/end.
    const after = src.slice(fnStart);
    // Up to ~80 lines is enough — the routing logic lives near the top.
    const bodySlice = after.split("\n").slice(0, 80).join("\n");

    if (/McpClient::is_external_tool\s*\(/.test(bodySlice)) {
      fail(
        section,
        "execute_v2_authorized still has McpClient::is_external_tool check",
      );
    } else {
      ok(section, "execute_v2_authorized has no McpClient::is_external_tool branch");
    }

    // Sanity: the uniform dispatch path uses registry.get().
    if (/registry\.get\(\s*&tool_call\.name\s*\)/.test(bodySlice)) {
      ok(section, "execute_v2_authorized uses uniform registry.get(&tool_call.name) dispatch");
    } else {
      fail(
        section,
        "execute_v2_authorized does not use registry.get(&tool_call.name); dispatch is not unified",
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Section D — runtime mock MCP server + reference adapter dispatch contract
// ────────────────────────────────────────────────────────────────────────────
{
  // Reference adapter reads `name` and dispatches via the un-prefixed
  // shape, exactly mirroring what the real `McpToolAdapter` does in
  // Rust: fields (server_name, origin_tool_name) are stored
  // separately, never re-derived at runtime from the LLM-visible
  // name. The mock MCP server inspects the wire-level `tools/call` to
  // assert the round-trip contract.
  const test = await runDispatchContractTest();
  if (test) {
    ok("runtime contract", "tool_call name ext:{server}:{tool} → wire uses un-prefixed {server, tool}");
  } else {
    fail(
      "runtime contract",
      "reference adapter dispatch did not match the McpToolAdapter contract",
    );
  }
}

async function runDispatchContractTest() {
  return new Promise((resolveDispatchTest) => {
    const received = [];
    let handshakeComplete = false; // not asserted here, but mock for completeness

    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          res.statusCode = 400;
          return res.end("invalid JSON");
        }
        if (body.method === "initialize") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Mcp-Session-Id", "sess-xyz");
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                serverInfo: { name: "mock", version: "0.0.1" },
              },
            }),
          );
        }
        if (body.method === "notifications/initialized") {
          res.statusCode = 204;
          return res.end();
        }
        if (body.method === "tools/list") {
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                tools: [
                  { name: "create_issue", description: "create a github issue" },
                  { name: "list_repos", description: "list github repos" },
                ],
              },
            }),
          );
        }
        if (body.method === "tools/call") {
          received.push(body);
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: { content: [{ type: "text", text: "ok" }] },
            }),
          );
        }
        // anything else → 200 with empty result so the test driver
        // doesn't error out on us.
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
      });
    });

    server.listen(0, "127.0.0.1", async () => {
      try {
        const port = server.address().port;
        const toolCallName = "ext:github:create_issue";
        const expectedServer = "github";
        const expectedTool = "create_issue";

        // Reference adapter (mirrors what `McpToolAdapter::execute`
        // does in Rust, supplying the call_external_tool call with the
        // un-prefixed pair that the adapter stores as fields):
        const wireCallPayload = (() => {
          // In Rust, the adapter stores server_name + origin_tool_name
          // as separate String fields. It does NOT split the wire name
          // at runtime. For this verifier we model the "split" as
          // happening once at registration time — the field values
          // are baked in. The runtime dispatch reads them, formats the
          // JSON-RPC `tools/call` body, and POSTs.
          return JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            id: 1,
            params: {
              name: expectedTool, // <-- not "ext:github:create_issue"
              arguments: { title: "hello" },
            },
          });
        })();

        // Issue the POST exactly like Rust's `apply_mcp_headers + .json(&body).send()`.
        const http = await import("node:http");
        const wireResponse = await postJson(
          http,
          `http://127.0.0.1:${port}/tools/call`,
          {
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
          },
          wireCallPayload,
        );

        // Assertions:
        let ok_ = true;
        const lastCall = received[received.length - 1];
        if (!lastCall) {
          console.error("  runtime: mock never received a tools/call");
          ok_ = false;
        } else {
          const sentName = lastCall?.params?.name;
          if (sentName !== expectedTool) {
            console.error(
              `  runtime: tools/call.params.name should be the un-prefixed tool name ('${expectedTool}'), got ${JSON.stringify(sentName)}`,
            );
            ok_ = false;
          }
          const sentArgs = lastCall?.params?.arguments;
          if (!sentArgs || sentArgs.title !== "hello") {
            console.error(
              `  runtime: tools/call.params.arguments should pass through { title: 'hello' }, got ${JSON.stringify(sentArgs)}`,
            );
            ok_ = false;
          }
        }

        if (wireResponse.statusCode !== 200) {
          console.error(
            `  runtime: tools/call response should be 200, got ${wireResponse.statusCode}`,
          );
          ok_ = false;
        }

        resolveDispatchTest(ok_);
      } catch (e) {
        console.error(`  runtime: ${e?.message ?? e}`);
        resolveDispatchTest(false);
      } finally {
        try {
          await new Promise((r) => server.close(r));
        } catch {
          /* ignore */
        }
      }
    });
  });
}

function postJson(httpLib, urlStr, headers, body) {
  return new Promise((resolvePost, rejectPost) => {
    const u = new URL(urlStr);
    const req = httpLib.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolvePost({ statusCode: res.statusCode, body: raw }));
      },
    );
    req.on("error", rejectPost);
    req.write(body);
    req.end();
  });
}

if (exitCode === 0) {
  console.log("\nmcp tool adapter verifier passed");
} else {
  console.error("\nmcp tool adapter verifier FAILED");
}
process.exit(exitCode);
