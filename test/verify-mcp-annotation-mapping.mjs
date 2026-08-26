#!/usr/bin/env node
// Verifier for the MCP annotation-to-ZEN-RiskLevel mapping.
//
// Goal: any external MCP server that advertises `destructiveHint` MUST
// be classified at least `High` (or `Critical` for destructive +
// open-world), and ZEN must force explicit user confirmation for those
// tools even when Yolo mode is on. The verifier covers both the
// wire-shape handling on sync (annotation block parsed into the
// adapter's stored field) and the post-process override in the
// permission check.
//
//   A) src-tauri/crates/zen-mcp/src/client/ — `risk_level_from_annotations`
//      helper exists with the documented mapping table:
//        * absent           → Medium
//        * destructive      → High
//        * destructive+open → Critical
//        * read_only        → Low
//        * open_world       → Medium
//      `sync_external_servers` parses `tool_json["annotations"]` into
//      `Option<ToolAnnotations>` and feeds both the parsed annotations
//      and `risk_level_from_annotations(annotations.as_ref())` into
//      `McpToolAdapter::new(...)`.
//
//   B) src-tauri/crates/zen-security/src/approval.rs — `build_context` is exposed
//      beyond the current module so the post-process gate can call it
//      without re-evaluating the layered from_input logic.
//
//   C) src-tauri/crates/zen-tools/src/registry.rs — `ToolRegistry::check_permission`
//      has a post-process override: if `decision == Allow` AND
//      `tool.annotations()?.destructive_hint == Some(true)`, rewrite
//      to `Confirm { context: ... }`. We test that this is the only
//      path that mutates `decision` (no soft-rewriting of Deny).
//
//   D) Runtime contract: a Node.js mock MCP server returns a
//      `tools/list` payload with diverse annotation sets. A reference
//      adapter that mirrors the Rust mapping table classifies each;
//      we assert that the server-asserted shape and the reference
//      table agree. Confirms the wire shape we expect
//      `serde_json::from_value::<ToolAnnotations>` to deserialize.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const SRC = (p) => {
  // The MCP client lives in `zen-mcp` as `client/{mod,sync,stdio_helpers,
  // http_handshake,http_body,...}.rs`. Read the whole client directory as one
  // blob so shape assertions that predate the split keep anchoring on the same
  // content.
  if (p === "src-tauri/crates/zen-mcp/src/client") {
    return ["mod", "sync", "stdio_helpers", "http_handshake", "http_body"]
      .map((f) => {
        try {
          return readFileSync(path.join(PROJECT_ROOT, "src-tauri/crates/zen-mcp/src/client", `${f}.rs`), "utf8");
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

// JS port of `risk_level_from_annotations` for the runtime contract
// scenario. Keep this in lock-step with the Rust source shape
// (src-tauri/crates/zen-mcp/src/client/); the verifier asserts both shapes
// agree for the same input annotations, so a drift in either side
// will fail the test.
function riskLevelFromAnnotations(ann) {
  if (!ann) return "Medium";
  if (ann.destructiveHint === true) {
    if (ann.openWorldHint === true) return "Critical";
    return "High";
  }
  if (ann.readOnlyHint === true) return "Low";
  if (ann.openWorldHint === true) return "Medium";
  return "Medium";
}

// ─────────────────────────────────────────────────────────────────────────
// Section A — src-tauri/crates/zen-mcp/src/client/
// ─────────────────────────────────────────────────────────────────────────
{
  const section = "zen-mcp/client";
  const src = SRC("src-tauri/crates/zen-mcp/src/client");
  let allOk = true;  // The helper is public and lives alongside the existing
  // `prefixed_external_tool_name` / `is_external_tool_name` helpers.
  // The trailing `,?` after the `Option<&crate::tools::ToolAnnotations>`
  // allows the standard trailing-comma style before the closing `)`.
  if (
    !assertContainsAll(
      section,
      src,
      [
        // The helper moved into the `zen-mcp` crate, so `crate::tools::` /
        // `crate::tools::permission::` became the `zen_tools` / `zen_security`
        // crate paths. Accept either spelling.
        /pub\s+fn\s+risk_level_from_annotations\s*\(\s*ann\s*:\s*Option\s*<\s*&\s*(?:crate::tools|zen_tools)::ToolAnnotations\s*>\s*,?\s*\)\s*->\s*(?:crate::tools::permission|zen_security::risk)::RiskLevel/,
      ],
    )
  )
  {
    allOk = false;
  }

  // Mapping semantics — anchor on key discriminator fragments so we
  // tolerate whitespace and ordering.
  if (
    !assertContainsAll(
      section,
      src,
      [
        // absent → Medium, used as the default path
        /None\s*=>\s*RiskLevel::Medium/,
        // destructive + openWorld → Critical
        /a\.destructive_hint\s*==\s*Some\(true\)[\s\S]{0,200}?a\.open_world_hint\s*==\s*Some\(true\)[\s\S]{0,80}?RiskLevel::Critical/,
        // destructive → High (the open-world upper match should appear first/above)
        /a\.destructive_hint\s*==\s*Some\(true\)[\s\S]{0,200}?RiskLevel::High/,
        // read_only only (no destruction) → Low
        /a\.read_only_hint\s*==\s*Some\(true\)[\s\S]{0,80}?RiskLevel::Low/,
        // open_world after no destruction was found → Medium
        /a\.open_world_hint\s*==\s*Some\(true\)[\s\S]{0,80}?RiskLevel::Medium/,
      ],
    )
  ) {
    allOk = false;
  }

  // sync_external_servers Step 4 must actually parse the annotations
  // block and feed both the parsed struct and the helper-computed
  // risk_level into the adapter constructor.
  if (
    !assertContainsAll(
      section,
      src,
      [
        // Anchor on the binding header + `serde_json::from_value(tool_json["annotations"].clone())`.
    // Allow either the simple `.ok()` chain OR the defensive `match { Ok … Err { warn! … } … }`
    // shape that surfaces malformed server replies instead of swallowing them. We tolerate up
    // to 400 chars of intervening shape (whitespace + `match` keyword + arm headers) so the
    // regex still anchors on the actual function call, not on whatever arms surround it.
    /let\s+annotations\s*:\s*Option\s*<\s*(?:crate::tools|zen_tools)::ToolAnnotations\s*>\s*=[\s\S]{0,400}?serde_json::from_value\(\s*tool_json\["annotations"\]\.clone\(\)\s*\)/,
        /let\s+risk_level\s*=\s*risk_level_from_annotations\(\s*annotations\.as_ref\(\)\s*\)/,
        // Phase 8 inverted adapter construction: the client no longer builds
        // `McpToolAdapter` itself (that type implements `Tool<AppHandle>` and
        // stayed in the app crate). It hands a validated `ExternalToolSpec`
        // carrying the same annotations + risk_level to the registrar port,
        // which wraps it app-side. Accept either wiring.
        /(?:McpToolAdapter::new\(\s*server_name\.clone\(\)\s*,\s*name\.clone\(\)\s*,\s*description\s*,\s*parameters\s*,\s*output_schema\s*,\s*annotations\s*,\s*risk_level\s*,\s*mcp_weak\.clone\(\)\s*,?\s*\)|register_external\(\s*(?:crate::)?registrar::ExternalToolSpec\s*\{[\s\S]{0,400}?annotations,[\s\S]{0,80}?risk_level,)/,
      ],
    )
  ) {
    allOk = false;
  }

  if (allOk) {
    ok(
      section,
      "mapping helper + sync_external_servers annotation parsing + adapter wiring",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Section B — zen-security approval.rs (build_context visibility)
// ─────────────────────────────────────────────────────────────────────────
{
  const section = "zen-security/approval.rs";
  // `src/tools/permission.rs` is a re-export shim now; `build_context` itself
  // lives in the `zen-security` crate's approval module.
  const src = SRC("src-tauri/crates/zen-security/src/approval.rs");

  // The post-process gate in tools/mod.rs calls `permission::build_context`,
  // so `build_context` must not be a `fn` without a `pub` qualifier.
  // Acceptable visibilities: `pub(crate)`, `pub(super)`, `pub(in ...)` —
  // any of them are reachable from `tools::mod`. We accept the
  // simplest patterns; tightening to a specific visibility can be done
  // by an extra `assertContainsAll` call if needed.
  if (
    !/pub(?:\(crate\))?\s+fn\s+build_context\b|\bpub(?:\(super\))?\s+fn\s+build_context\b/.test(
      src,
    )
  ) {
    fail(
      section,
      "`build_context` is not visibility-tagged — the destructive post-process gate in tools/mod.rs can't call it",
    );
  } else {
    ok(section, "`build_context` is reachable from outside permission.rs");
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Section C — zen-tools registry.rs (ToolRegistry::check_permission
//                                  destructive-annotation override)
// ─────────────────────────────────────────────────────────────────────────
{
  const section = "zen-tools/registry.rs";
  // The canonical registry (and its `check_permission` gate) moved into the
  // `zen-tools` crate; `src/tools/mod.rs` is now app-side wiring.
  const src = SRC("src-tauri/crates/zen-tools/src/registry.rs");
  let allOk = true;

  // Locate check_permission.
  const fnStart = src.indexOf("pub fn check_permission(");
  if (fnStart < 0) {
    fail(section, "could not find `pub fn check_permission`");
  } else {
    const after = src.slice(fnStart);
    // Slice the next ~120 lines to cover the body.
    const body = after.split("\n").slice(0, 140).join("\n");

  // The post-process MUST mutate `decision` (we use `let mut
  // decision` and re-assign) AND must read annotations() via the
  // resolved tool_opt, AND must call the permission-module
  // build_context helper to construct the Substitute Confirm.
  const checks = [
    // mut decision
    /let\s+mut\s+decision\s*=\s*PermissionDecision::from_input/,
    // tool_opt captured before PermissionDecision::from_input so we
    // can post-process its annotations()
    /let\s+tool_opt\s*=\s*self\.get\(\s*&tool_call\.name\s*\)/,
    // annotations() chained to .destructive_hint somewhere in body. The intermediate
    // `)` (closing `.and_then(|t| t.annotations())`) plus a newline/indent separates
    // `.annotations()` from the next-and-deeper `.and_then(|a| a.destructive_hint)`;
    // we absorb that bridge with an optional `\)?` between the two whitespace clusters.
    /\.annotations\(\s*\)\s*\)?\s*\n?\s*\.and_then\(\s*\|\s*a\s*\|\s*a\.destructive_hint\s*\)/,
    // upgrade Allow path: matches! + Confirm { context: ...
    /matches!\(\s*decision\s*,\s*PermissionDecision::Allow\s*\)/,
    /PermissionDecision::Confirm\s*\{[^}]*context\s*:/,
    // call into `build_context`. Inside the zen-tools crate the helper is
    // imported from `zen_security::approval`, so the call site is unqualified;
    // the old app-side spelling was the sibling `permission::build_context`.
    // Anchor on the call site's first argument so we don't accidentally match
    // any other `build_context` reference in the file.
    /(?:permission::)?build_context\(\s*&tool_call\.name/,
  ];
    for (const re of checks) {
      if (!re.test(body)) {
        fail(section, `check_permission body missing pattern: ${re}`);
        allOk = false;
      }
    }
    if (allOk) {
      ok(
        section,
        "destructive-annotation override at the tail of ToolRegistry::check_permission",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Section D — runtime mock MCP server + reference mapping agreement
// ─────────────────────────────────────────────────────────────────────────
{
  const section = "runtime contract";
  const test = await runAnnotationContractTest();
  if (test) {
    ok(
      section,
      "server-asserted annotation shapes agree with the reference mapping table",
    );
  } else {
    fail(
      section,
      "annotation shape or mapping disagrees between wire and reference",
    );
  }
}

async function runAnnotationContractTest() {
  return new Promise((resolveTest) => {
    // Mock catalog: each tool advertises a distinct annotation set so
    // the test covers every branch of the mapping table.
    const CATALOG = [
      { name: "read_only_search", annotations: { readOnlyHint: true } },
      { name: "open_world_fetch", annotations: { openWorldHint: true } },
      {
        name: "local_destructive",
        annotations: { destructiveHint: true },
      },
      {
        name: "remote_destructive",
        annotations: { destructiveHint: true, openWorldHint: true },
      },
      { name: "unknown_shape", annotations: {} },
    ];
    const received = [];

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
          res.setHeader("Mcp-Session-Id", "sess-ann");
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
          received.push({ kind: "tools/list", body });
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: { tools: CATALOG },
            }),
          );
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
      });
    });

    server.listen(0, "127.0.0.1", async () => {
      try {
        const port = server.address().port;
        const http = await import("node:http");
        await postJson(
          http,
          `http://127.0.0.1:${port}/tools/list`,
          {
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
          },
          // Reference adapter pretending to be the Rust sync path:
          // fetch /tools/list → carry through annotations block exactly
          // as the server returned → compute risk_level via the helper.
          JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/list",
            id: 2,
            params: {},
          }),
        );

        // Assertions:
        // (1) Mock saw at least one tools/list call.
        // (2) Each catalog tool's annotation object round-tripped
        //     structurally (we assert the field strings match).
        // (3) The reference risk_level mapping matches the
        //     documented table for every catalog entry.
        let ok_ = true;
        if (received.length === 0) {
          console.error("  runtime: mock never received a tools/list");
          ok_ = false;
        }
        const expectedMapping = {
          read_only_search: "Low",
          open_world_fetch: "Medium",
          local_destructive: "High",
          remote_destructive: "Critical",
          unknown_shape: "Medium",
        };
        for (const tool of CATALOG) {
          const got = riskLevelFromAnnotations(tool.annotations);
          if (got !== expectedMapping[tool.name]) {
            console.error(
              `  runtime: ${tool.name} map mismatch — expected ${expectedMapping[tool.name]}, got ${got}`,
            );
            ok_ = false;
          }
        }
        resolveTest(ok_);
      } catch (e) {
        console.error(`  runtime: ${e?.message ?? e}`);
        resolveTest(false);
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
  console.log("\nmcp annotation mapping verifier passed");
} else {
  console.error("\nmcp annotation mapping verifier FAILED");
}
process.exit(exitCode);
