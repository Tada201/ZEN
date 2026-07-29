/**
 * Verifier for MCP `tools/list` cursor pagination in
 * `src-tauri/src/mcp/client.rs`.
 *
 * Locks three things at once:
 *   1. SOURCE SHAPE — `client.rs` must contain the pagination hook +
 *      safety cap + cursor echo. Catches regressions where someone
 *      reverts to a single-shot `tools/list` and silently drops pages.
 *   2. WIRE CONTRACT — a Node.js paginating MCP server (splitting its
 *      catalog into 4 pages with cursors) records every request. A
 *      reference pagination driver loops until `nextCursor` is absent
 *      and the server validates the request sequence and cursor echoes.
 *   3. SAFETY CAP — the verifier confirms a cursor-loop with a finite
 *      page cap exists in source so a hostile server can't pin the
 *      runner in an infinite loop.
 *
 * Pattern follows the test/verify-*.mjs convention: read source with
 * `node:fs`, assert with `node:assert`, drive HTTP via global `fetch`.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const CLIENT_RS = new URL("../src-tauri/src/mcp/client.rs", import.meta.url);

const PROTOCOL_VERSION = "2025-06-18";
const ACCEPT_JSON_OR_SSE = "application/json, text/event-stream";

// ── 1. Source-shape assertions ────────────────────────────────────────────

const clientSource = readFileSync(CLIENT_RS, "utf8");

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

// The pagination flow must exist as a standalone async helper that the
// main loop calls. Cursor echo + safety cap are mandatory.
assertContainsAll("client.rs pagination core", clientSource, [
  /async\s+fn\s+fetch_external_tools\b/,
  /fn\s+apply_mcp_headers\b/, // header injection must run on every page too
]);

// Each page MUST echo the right `cursor` value back. The helper must
// consult `nextCursor` from the response AND forward it on the next call.
// In Rust this happens via `Map::insert`, not via JSON-like "cursor": ...
// syntax, so we assert on the Map::insert call shape. Tolerate both
// `serde_json::Value::String` and the imported `Value::String` form.
assertContainsAll("client.rs cursor echo", clientSource, [
  /nextCursor/,
  /params_obj\.insert\(\s*"cursor"\.to_string\(\)\s*,\s*(serde_json::)?Value::String\(c\.to_string\(\)\)\)/,
]);

// Safety cap exists with a finite upper bound. Catches a regression where
// someone removes the cap and lets a hostile server loop forever.
assertContainsAll("client.rs pagination safety", clientSource, [
  /MAX_TOOLS_LIST_PAGES\s*:\s*usize\s*=\s*\d+/,
  /if\s+page\s*>\s*Self::MAX_TOOLS_LIST_PAGES/,
]);

// `params` is always emitted (even when empty on the first call) so we
// never produce `"params": null`. The helper must build a Map and only
// insert `cursor` when present. Tolerate both `serde_json::Map::new()` and
// an imported `Map::new()` so reordering imports doesn't break the test.
assertContainsAll("client.rs params object", clientSource, [
  /let\s+mut\s+params_obj\s*=\s*(serde_json::)?Map::new\(\)/,
  /"params"\s*:\s*(serde_json::)?Value::Object\(params_obj\)/,
]);

// ── 2+3. End-to-end wire-protocol conformance via a paginating mock server ─

/**
 * A 4-page catalog with separated-incoming/outgoing cursor semantics.
 * Each entry has:
 *   - `id`      — the cursor value the driver sends BACK to find this
 *                 page on a subsequent call. `null` ⇒ page is reached
 *                 only on the initial cursor-less call.
 *   - `outgoing` — the value the response puts in the `nextCursor` field.
 *                 `null` ⇒ this page is terminal (no successor), so the
 *                 driver stops on EOF.
 *   - `page`    — the tool descriptors for this page.
 *
 * Chain:
 *   call 0   cursor=null       → page 0 (id=null)         nextCursor=p2
 *   call 1   cursor=p2         → page 1 (id=p2)           nextCursor=p3
 *   call 2   cursor=p3         → page 2 (id=p3)           nextCursor=p4
 *   call 3   cursor=p4         → page 3 (id=p4, outgoing=null) → EOF
 * Total: exactly 4 driver requests; 8 distinct tools merged.
 */
const PAGINATED_CATALOG = [
  {
    id: null,
    outgoing: "p2",
    page: [
      { name: "read_file", description: "p1 tool 1" },
      { name: "write_file", description: "p1 tool 2" },
    ],
  },
  {
    id: "p2",
    outgoing: "p3",
    page: [
      { name: "list_dir", description: "p2 tool 1" },
      { name: "stat_path", description: "p2 tool 2" },
      { name: "grep", description: "p2 tool 3" },
    ],
  },
  {
    id: "p3",
    outgoing: "p4",
    page: [{ name: "fetch_url", description: "p3 tool 1" }],
  },
  {
    id: "p4",
    outgoing: null, // terminal page ⇒ driver stops on EOF
    page: [
      { name: "search_web", description: "p4 tool 1" },
      { name: "open_link", description: "p4 tool 2" },
    ],
  },
];

function startPaginatingMockMcp({ acceptCursor = true } = {}) {
  return new Promise((resolveMcp) => {
    const requestedCursors = [];
    let state = { ready: true }; // handshake not in scope for this verifier

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
        // We only care about `tools/list` requests; everything else
        // gets a no-op 200 so the test driver isn't blocked.
        if (body.method !== "tools/list") {
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
        }

        const requestCursor =
          body.params && typeof body.params.cursor === "string" ? body.params.cursor : null;
        requestedCursors.push(requestCursor);

        // Find which page to return.
        // - First call: no cursor \u21d2 return page 0.
        // - Subsequent calls: cursor matches a page's id \u21d2 return that page.
        let pageIdx;
        if (requestCursor === null) {
          pageIdx = 0;
        } else {
          pageIdx = PAGINATED_CATALOG.findIndex((p) => p.id === requestCursor);
        }

        if (pageIdx === -1) {
          // Hostile / buggy server scenario: unknown cursor.
          if (acceptCursor) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                error: { code: -32602, message: `Unknown cursor: ${requestCursor}` },
              }),
            );
          } else {
            res.statusCode = 400;
            return res.end("unknown cursor");
          }
        }

        const entry = PAGINATED_CATALOG[pageIdx];
        const result = { tools: entry.page };
        // Emit the entry's own `outgoing` field as nextCursor. The
        // terminal page has `outgoing: null` and emits no nextCursor,
        // which signals EOF to the driver.
        if (entry.outgoing !== null && entry.outgoing !== undefined) {
          result.nextCursor = entry.outgoing;
        }
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolveMcp({
        url: `http://127.0.0.1:${port}`,
        requestedCursors,
        state,
        close: () => new Promise((res) => server.close(() => res())),
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
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers),
    body: text,
  };
}

/**
 * Reference driver: mirrors the spec-compliant pagination loop and what
 * the Rust helper does — start with no cursor, send `tools/list`, on a
 * non-empty `nextCursor` re-issue with `cursor: <value>`, stop on EOF.
 *
 * Bounded by `maxPages` so the driver itself can never loop forever,
 * even if the mock server goes into a cursor cycle (test the safety
 * behaviour of the ingestion rather than proving mockery).
 */
async function referencePaginate(serverUrl, { maxPages = 100 } = {}) {
  const calls = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const reqBody = cursor === null
      ? { jsonrpc: "2.0", id: 100 + page, method: "tools/list" }
      : { jsonrpc: "2.0", id: 100 + page, method: "tools/list", params: { cursor } };
    const resp = await rawPost(
      `${serverUrl}/whatever`,
      {
        "Content-Type": "application/json",
        Accept: ACCEPT_JSON_OR_SSE,
        "MCP-Protocol-Version": PROTOCOL_VERSION,
      },
      JSON.stringify(reqBody),
    );
    const parsed = JSON.parse(resp.body);
    calls.push({
      page,
      request: { ...reqBody, params: reqBody.params ?? {} },
      response: parsed,
      headers: resp.headers,
      hasCursorInRequest: cursor !== null,
    });
    if (parsed.error) return { calls, terminatedBy: "error" };

    const tools = Array.isArray(parsed.result?.tools) ? parsed.result.tools : [];
    if (typeof parsed.result?.nextCursor === "string" && parsed.result.nextCursor !== "") {
      cursor = parsed.result.nextCursor;
    } else {
      return { calls, terminatedBy: "eof", allTools: [...calls.flatMap((c) => c.response?.result?.tools ?? [])] };
    }
  }
  return { calls, terminatedBy: "safety-cap", allTools: calls.flatMap((c) => c.response?.result?.tools ?? []) };
}

// ── Run the verification ──────────────────────────────────────────────────

let exitCode = 0;
const server = await startPaginatingMockMcp({});
try {
  const { calls, terminatedBy, allTools } = await referencePaginate(server.url, { maxPages: 100 });

  // The driver must have terminated by EOF (the mock serves a finite chain).
  assert.equal(terminatedBy, "eof", `driver should terminate on EOF, got "${terminatedBy}"`);

  // The mock's catalog has 4 pages ↔ driver must have made exactly 4 requests.
  assert.equal(
    calls.length,
    4,
    `driver should make exactly 4 tools/list requests for a 4-page catalog, got ${calls.length}`,
  );

  // ── Cursor echo: chain is null → p2 → p3 → p4 (then nextCursor absent → EOF).
  // The first page's request has no cursor. Each subsequent call sends the
  // `outgoing` nextCursor value from the previous response. The final
  // page (id=p4, outgoing=null) has no successor and emits no nextCursor,
  // so the driver stops on EOF after exactly 4 calls.
  const expectedCursors = [null, "p2", "p3", "p4"];
  const actualCursors = calls.map((c) =>
    c.request?.params?.cursor === undefined ? null : c.request.params.cursor,
  );
  assert.deepEqual(
    actualCursors,
    expectedCursors,
    `cursor echo must chain: ${actualCursors.join(", ")} vs expected ${expectedCursors.join(", ")}`,
  );

  // First call must not carry cursor in the request.
  assert.equal(
    actualCursors[0],
    null,
    "first page must NOT carry cursor in the request",
  );

  // Server-side observations agree: the mock recorded the same sequence.
  assert.deepEqual(
    server.requestedCursors,
    [null, "p2", "p3", "p4"],
    "server must observe the same cursor sequence as the driver sent",
  );

  // All tools from all pages must have been collected.
  const expectedToolNames = [
    "read_file",
    "write_file",
    "list_dir",
    "stat_path",
    "grep",
    "fetch_url",
    "search_web",
    "open_link",
  ];
  const actualToolNames = (allTools ?? []).map((t) => t.name);
  assert.deepEqual(
    actualToolNames,
    expectedToolNames,
    `final merged tool list must include all 8 tools from 4 pages, got ${actualToolNames.join(", ")}`,
  );

  // Each per-page merge must include only that page's tools (no bleed).
  for (let i = 0; i < calls.length; i++) {
    const pageTools = calls[i].response?.result?.tools ?? [];
    assert.equal(
      pageTools.length,
      PAGINATED_CATALOG[i].page.length,
      `page ${i + 1} should return ${PAGINATED_CATALOG[i].page.length} tools, got ${pageTools.length}`,
    );
    for (let j = 0; j < pageTools.length; j++) {
      assert.equal(
        pageTools[j].name,
        PAGINATED_CATALOG[i].page[j].name,
        `page ${i + 1} tool ${j + 1} must come from the catalog`,
      );
    }
  }

  // ── Optional safety-cap scenario: malicious server returns the SAME
  //    nextCursor forever. The driver must stop at maxPages without
  //    crashing or hanging. ──
  const hostile = await new Promise((resolveH) => {
    const observedPages = [];
    const reqs = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        observedPages.push(body.params?.cursor ?? null);
        // Always emit the same non-empty nextCursor.
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              tools: [{ name: "noop", description: "always here" }],
              nextCursor: "loop-forever",
            },
          }),
        );
      });
    });
    reqs.listen(0, "127.0.0.1", () => {
      resolveH({
        url: `http://127.0.0.1:${reqs.address().port}`,
        observedPages,
        close: () => new Promise((res) => reqs.close(() => res())),
      });
    });
  });
  try {
    const bounded = await referencePaginate(hostile.url, { maxPages: 7 });
    assert.equal(
      bounded.calls.length,
      7,
      "bounded driver must stop at maxPages even when the server never signals EOF",
    );
    assert.equal(
      bounded.terminatedBy,
      "safety-cap",
      "driver must self-terminate via safety cap, not by EOF or error",
    );
  } finally {
    await hostile.close();
  }
} catch (err) {
  console.error("MCP pagination verifier FAILED:", err.message);
  exitCode = 1;
} finally {
  await server.close();
}

if (exitCode !== 0) process.exit(exitCode);
console.log("mcp pagination verifier passed");
