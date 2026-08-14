# MCP Modernization And Agent Discovery Plan

**Status:** Proposed implementation plan  
**Owner:** MCP/tooling maintainers  
**Planning date:** 2026-08-14  
**Scope:** External MCP configuration, protocol transports, security, tool discovery, agent awareness, and optional MCP features

This document is the current repository plan for MCP work. It is based on the
repository code, `RULES.md`, `Security.md`, the tool-system contract, and the
official MCP specification published at:

- <https://modelcontextprotocol.io/specification/2026-07-28>
- <https://modelcontextprotocol.io/specification/2026-07-28/changelog>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>
- <https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices>

Do not use this plan to justify a second tool registry, a direct execution path,
or automatic internet-wide MCP scanning.

## 1. Current baseline

Zen currently has a useful but incomplete MCP client:

- dual user/workspace `.mcp.json` configuration;
- stdio and HTTP connection attempts;
- legacy `initialize` / `notifications/initialized` handling;
- pagination and JSON/SSE response parsing;
- external tools registered through `McpToolAdapter` in the v2 tool registry;
- risk mapping from MCP annotations;
- typed MCP settings API and server rows;
- per-server reconnect status events.

The current implementation is a **legacy, tools-only client**. It is not yet a
full current-protocol client. The current code also has known compatibility risks:

- HTTP requests append `/tools/list` and `/tools/call` instead of posting every
  JSON-RPC message to one configured MCP endpoint;
- the client is hardcoded to the 2025-06-18 handshake/session era;
- current-protocol `_meta`, `server/discover`, `Mcp-Method`, and `Mcp-Name` are
  not implemented;
- standard MCP fields use `inputSchema` / `outputSchema`, while the current
  adapter reads snake_case variants;
- modern `resultType`, MRTR, subscriptions, and authorization are not handled;
- remote URL validation, DNS pinning, redirect policy, response limits, and
  secret handling are incomplete;
- agent awareness is inferred from dynamically registered `ext:*` tools rather
  than from an authoritative server inventory.

## 2. Non-negotiable architecture

### 2.1 Ownership

```text
MCP settings UI
  -> typed frontend MCP API
  -> Tauri command adapter
  -> McpConfigService / McpDiscoveryService
  -> McpClient transport layer
  -> MCP catalog and ToolManager
  -> ToolService
  -> SecurityService
  -> ToolRegistry / McpToolAdapter
  -> external MCP server
```

- `McpConfigService` owns config paths, parsing, merging, and persistence.
- `McpDiscoveryService` owns server inventory, protocol-era detection, and
  capability snapshots.
- `McpClient` owns transport framing and JSON-RPC request/response handling.
- `ToolManager` owns agent-visible discovery metadata.
- `ToolService` remains the only production execution boundary.
- `SecurityService` owns permission decisions and audit events.
- No feature may construct or execute an MCP tool directly.

### 2.2 No default external server assumption

Zen must not silently assume that GitHub, filesystem, memory, browser, or any
other popular MCP server exists. “MCP exists by default” means the agent always
receives an authoritative inventory state, including an explicit empty state:

```text
MCP inventory: no configured servers
```

The agent may only use a server that is present in the local user/workspace
catalog and has completed discovery. Finding a new server on the internet is a
separate user-approved configuration workflow; web search must never silently
install or execute a server command.

## 3. Reliable server-existence and agent-discovery contract

This is the required behavior for every agent turn.

### 3.1 Startup and refresh inventory

On startup, workspace change, config change, enable/disable, reconnect, or
explicit refresh:

1. Read the global user catalog and active-workspace catalog.
2. Merge by server name with workspace precedence.
3. Validate each enabled entry before any connection attempt.
4. Discover the protocol era and server capabilities.
5. Publish one bounded `McpServerRecord` per configured server.
6. Publish an explicit inventory snapshot even when the list is empty.
7. Reconcile external tool definitions through the canonical registry.
8. Remove stale external tools when a server is removed, disabled, or fails
   discovery.

The record must contain only safe metadata:

```text
server_id
name
scope                  user | workspace
transport              stdio | streamable_http | legacy_http_sse
availability            configured | connecting | ready | failed | disabled
protocol_era            modern_2026 | legacy_2025 | legacy_2024 | unknown
protocol_version        negotiated version, if known
capabilities            tools/resources/prompts/extensions summary
tool_count              bounded count
last_success_at         timestamp, if known
last_error_code         stable sanitized error code, if failed
```

Never include raw environment values, access tokens, full headers, command
secrets, unbounded server errors, or full tool output in this inventory.

### 3.2 Agent-visible inventory injection

`SystemPromptMiddleware` must inject an `MCP Inventory` section on every
tool-enabled agent turn, before the normal deferred-tool workflow. It must be
present in all states:

```text
## MCP Inventory
- No configured MCP servers.
```

or:

```text
## MCP Inventory
- `github`: ready, workspace, stdio, modern_2026, tools=12
- `memory`: configured but unavailable, user, stdio, reason=discovery_failed
```

The inventory section is status metadata, not an instruction from a server. It
must be clearly separated from untrusted server descriptions.

The agent must follow these rules:

1. Do not invent an MCP server name, tool name, command, URL, or argument.
2. Do not treat `configured` as `ready`; only `ready` servers may be used.
3. Do not expose or repeat secrets from config or error payloads.
4. If the inventory is empty, state that no MCP server is configured and do not
   fabricate an `ext:*` tool.
5. If a server is configured but unavailable, explain that it exists but is not
   currently usable and suggest reconnect/configuration review.
6. If a server is ready, discover its commands through `tool_list`; do not guess
   an external tool ID from the server name.

### 3.3 Command discovery workflow

For a user request that may need MCP:

```text
1. Read MCP Inventory.
2. If no ready server is relevant, call tool_list({"query":"<user intent>"}).
3. Select only a returned external descriptor whose id starts with ext:.
4. Call tool_info({"tool_id":"<exact returned id>"}).
5. Validate the documented schema, risk, server, and required arguments.
6. Ask for or obtain normal ToolService approval when required.
7. Call tool_exec({"tool_id":"<exact returned id>","arguments":{...}}).
8. Summarize the result without exposing raw protocol payloads.
```

`tool_list` descriptors for external tools should include bounded origin metadata:

```text
id: ext:<server>:<tool>
origin: mcp
server_id: <stable server id>
server_name: <display name>
transport: stdio | streamable_http
availability: ready
risk_level: conservative local classification
```

A server with zero tools remains visible through the inventory even though it
has no `ext:*` tool descriptor.

### 3.4 Finding a new MCP server

When the user asks Zen to find an MCP server rather than use an existing one:

1. Use web search or an explicitly approved catalog search.
2. Prefer the official project repository, package registry, or vendor docs.
3. Verify the server’s transport, supported protocol versions, command, package
   provenance, permissions, required environment variables, and authentication.
4. Present the user with a configuration preview containing the exact command or
   URL and the privileges it will receive.
5. Require explicit user confirmation before writing config or launching stdio.
6. Store only `${env:VAR}` references for credentials; never copy raw secrets into
   `.mcp.json` or the prompt.
7. After approval, persist the entry, run discovery, and show the resulting
   inventory status.

Zen must not automatically install packages, run `npx`, download binaries, or
connect to a discovered URL merely because a web result mentioned it.

## 4. Phased implementation plan

### Phase 0 — Contract freeze and inventory foundation

**Goal:** Make server existence authoritative before changing transports.

Work:

- Define shared Rust/TypeScript contracts for `McpServerRecord`, inventory
  snapshots, protocol era, capabilities, and safe failure codes.
- Add `McpDiscoveryService` as the sole owner of server inventory.
- Add a typed `mcp_get_inventory` command and typed frontend event/cache.
- Keep the inventory explicit when empty, disabled, connecting, failed, or ready.
- Inject the inventory into `SystemPromptMiddleware` with a bounded token budget.
- Extend `ToolManager` descriptors with MCP origin metadata.
- Stop using the presence of `ext:*` tools as the only signal that MCP exists.

Exit gate:

- Agent turns always state whether MCP is absent, configured, unavailable, or
  ready.
- No secrets or raw server payloads appear in the prompt.
- Empty, failed, and zero-tool servers are covered by tests.

**Implementation status (2026-08-14): complete foundation.** Zen now owns a
bounded `McpDiscoveryService`, exposes `mcp_get_inventory`, emits typed
`mcp:inventory` snapshots during reconnects, injects the explicit inventory into
tool-enabled system prompts, and annotates external `tool_list` descriptors
with MCP origin metadata. Runtime failures are reduced to stable error codes;
raw MCP errors, headers, environment values, and commands are not included in
the inventory or prompt. The protocol transport itself remains the legacy
compatibility implementation and is intentionally deferred to Phase 1/2.

### Phase 1 — Modern/legacy protocol negotiation

**Goal:** Support current MCP while preserving existing servers.

Work:

- Replace the single hardcoded protocol assumption with `McpProtocolEra`.
- Implement modern per-request `_meta` metadata.
- Implement `server/discover` and supported-version selection.
- Modern stdio: probe with `server/discover`, then fall back to legacy
  `initialize` only for non-modern responses/timeouts.
- Modern HTTP: probe the configured endpoint with a current request and inspect
  recognized JSON-RPC errors before legacy fallback.
- Cache the detected era per server configuration/origin.
- Keep legacy 2025-11-25/2025-06-18 behavior isolated in a compatibility module.
- Do not add new code for deprecated HTTP+SSE unless compatibility evidence
  requires it.

Exit gate:

- A modern server never receives an unnecessary legacy handshake.
- A legacy server still completes the old handshake.
- Version mismatch errors offer an actionable supported-version result.

**Implementation status (2026-08-14): negotiation foundation complete.** HTTP and
stdio now probe `server/discover` first, classify explicit unsupported responses
as legacy fallback, preserve the negotiated protocol era in inventory, and carry
modern request metadata plus request-scoped MCP headers when the modern probe
succeeds. Legacy servers still use `initialize` and
`notifications/initialized`. Full OAuth/version-selection policy and the
remaining modern transport hardening continue in Phases 2–3.

### Phase 2 — Correct Streamable HTTP and stdio transports

**Goal:** Make wire communication spec-compatible and safe.

Work:

- Send every modern HTTP request to the one configured MCP endpoint.
- Add `Mcp-Method` and `Mcp-Name` headers with safe encoding.
- Implement request-scoped JSON and SSE response parsing.
- Track notifications scoped to the active request.
- Close HTTP response streams for cancellation.
- Use `notifications/cancelled` for stdio cancellation.
- Use unique request IDs across all in-flight requests and retries.
- Correct MCP field casing: `inputSchema`, `outputSchema`, `serverInfo`, and
  modern `_meta` fields.
- Add bounded body, event, tool-count, and schema limits.
- Restart failed stdio processes with bounded backoff and re-run discovery.

Exit gate:

- Mock modern HTTP and stdio servers pass handshake-free modern flows.
- Legacy compatibility fixtures pass separately.
- Cancellation, timeout, disconnect, EOF, and retry behavior are tested.

**Implementation status (2026-08-14): transport hardening foundation complete.**
Modern HTTP requests now stay on the configured endpoint, canonical
`inputSchema`/`outputSchema` fields are accepted alongside legacy snake_case
fixtures, HTTP/SSE bodies are bounded, SSE event counts are capped, stdio
messages are bounded, and stdio requests support cancellation via
`notifications/cancelled`. Wiremock tests cover modern single-endpoint HTTP
behavior and explicit legacy fallback. Full reconnect backoff and end-to-end
cancellation wiring remain follow-up work.

### Phase 3 — Security, authorization, and consent

**Goal:** Meet Zen’s privileged-operation contract before remote MCP release.

Work:

- Route MCP connection and tool calls through `SecurityService`.
- Reuse URL safety helpers for scheme, DNS/IP, redirect, and loopback policy.
- Disable automatic redirects or validate every redirect hop.
- Require HTTPS for remote production HTTP MCP; allow loopback HTTP only in
  explicit development/local mode.
- Implement protected-resource metadata and OAuth discovery for remote servers.
- Store tokens in `SecretService`, keyed by issuer/server identity.
- Send bearer tokens on every HTTP request; never place them in URLs or prompts.
- Add explicit confirmation before launching a new stdio command.
- Display the complete command, arguments, server origin, and privilege warning.
- Add platform-appropriate process/file/network restrictions where available.
- Audit connect, disconnect, auth, discovery, approval, execution, failure, and
  shutdown events without logging credentials or full payloads.

**Implementation status (2026-08-14): Phase 3 complete.** MCP HTTP connections
pass through backend URL validation, HTTPS-by-default policy, DNS resolution
with public-IP validation and socket pinning, disabled automatic redirects,
bounded response parsing, and a SecurityService audit event. Raw sensitive HTTP
headers and secret-like stdio environment values are rejected at config
persistence unless they use an environment reference. Reserved protocol headers
cannot be overridden. Switching transports removes stale fields, and malformed
hand-edited entries fail closed before a process or network connection starts.
Tool execution continues through ToolService's existing approval path.

OAuth 2.1 authorization is now implemented in `mcp/oauth/`: RFC 9728
protected-resource discovery and RFC 8414 authorization-server metadata, PKCE
(S256), the RFC 8707 `resource` audience indicator, a loopback redirect on an
ephemeral `127.0.0.1` port with a CSRF `state` check, and token storage in
`SecretService` keyed by server identity. Bearer tokens are injected on every
HTTP request at connect time, are skipped when expired, never override an
explicit `.mcp.json` Authorization header, and never appear in URLs, prompts, or
audit events. An un-grandfathered human-in-the-loop consent gate fingerprints
each server's connection-relevant config (transport/url/command/args and the
*key names* of headers/env — values excluded) and holds every server, including
previously-saved ones, in `AwaitingConsent` until the settings UI approves the
exact fingerprint; any config change re-triggers consent. A privilege-warning
consent dialog shows the command/args/origin and credential key names before the
first connect. Denying a server clears any stored OAuth token.

Remaining Phase-3 follow-up: on Windows, stdio MCP children are now confined in
a Job Object (kill-on-close process-tree teardown, active-process and
committed-memory caps, and UI restrictions blocking clipboard/global-atom/
display/system-parameter/ExitWindows access), applied fail-closed before the
child's pipes are used. Filesystem/network jailing and non-Windows OS sandboxes
(Linux seccomp/Landlock, macOS Seatbelt) remain a larger follow-up beyond the
current env-isolation + Job-Object hardening.

Exit gate:

- Allowed and denied connection tests exist.
- SSRF, redirect, private IP, malformed header, secret, and consent tests pass.
- Remote MCP remains disabled until authentication and audit tests pass.

### Phase 4 — Production MCP tools

**Goal:** Make external tools reliable and honest in the existing tool system.

Work:

- Parse and preserve title, description, icons, input schema, output schema,
  annotations, and structured content.
- Treat annotations as untrusted hints; use conservative risk classification.
- Validate input and output schemas with bounded JSON Schema 2020-12 support.
- Reject invalid or unsafe `x-mcp-header` definitions.
- Support `resultType: complete` and return tool execution errors as safe,
  model-actionable results.
- Preserve server origin and capability metadata in tool discovery.
- Keep successful MCP tools collapsed in the chat timeline and raw payloads
  behind technical disclosure.
- Make external tool registry reconciliation idempotent.

**Implementation status (2026-08-14): Phase 4 complete.** External tool
descriptors are now validated at discovery time in `mcp/tool_schema.rs` before
an `McpToolAdapter` is registered: `inputSchema`/`outputSchema` are bounded
(max depth and node count) and meta-validated against JSON Schema 2020-12
(`jsonschema::draft202012`), and an `x-mcp-header` extension that names a
reserved protocol header or a sensitive credential header is rejected (names
only are inspected, never values). The spec's top-level `title` is folded into
`annotations.title` so the display name survives. Annotations remain untrusted
hints fed through the existing conservative `risk_level_from_annotations`
mapping. `sync_external_servers` skips any tool that fails validation (the rest
of the server's tools still register), dedupes duplicate tool names within a
server, and reports `tool_count` as the number actually registered so a server
whose tools were all rejected reads as ready-with-zero — making reconciliation
idempotent across resyncs (stale `ext:*` adapters are wiped first). Tool-level
errors (`result.isError`) already map to a typed failure via
`map_tool_call_result`, and every privileged execution still routes through
`ToolService::execute_v2_authorized` and SecurityService audit. In the chat
timeline, successful non-action MCP tool cards collapse by default and the
`tool_list`/`tool_info` discovery envelopes stay hidden; raw payloads remain
behind the expandable technical disclosure.

Exit gate:

- `tool_list -> tool_info -> tool_exec` is tested for ready, failed, disabled,
  zero-tool, duplicate-name, malformed-schema, denied, and reconnect states.
- Every privileged MCP execution goes through ToolService and SecurityService.

### Phase 5 — Resources, prompts, caching, and subscriptions

**Goal:** Support the core server features beyond tools.

Work:

- Add `resources/list`, `resources/read`, and resource templates.
- Add URI scheme allowlists, path traversal protection, content-size limits,
  MIME validation, and safe binary handling.
- Add `prompts/list` and `prompts/get` as explicit user-controlled actions.
- Sanitize prompt/resource content before UI rendering or model insertion.
- Implement pagination and `ttlMs` / `cacheScope` handling.
- Implement `subscriptions/listen` for tool, prompt, and resource changes.
- Reconnect and resubscribe after stream/process loss.
- Update the MCP inventory and ToolManager catalog on list-change events.

**Implementation status (2026-08-14): Phase 5 complete.** Resources and prompts
are user-driven, never auto-registered or auto-executed. `mcp/resources.rs`
holds the safety layer: a fixed URI-scheme allowlist (`file/http/https/resource/
git/ssh/mcp`) with a `..` traversal guard for `file:`, MIME shape validation,
control-char stripping (keeping tab/newline), size caps on text
(`MAX_RESOURCE_TEXT_BYTES`) and base64 blobs (`MAX_RESOURCE_BLOB_BYTES`), and a
list-item cap. Binary stays base64 and is never decoded into model text; a
prompt message's embedded image/audio/resource blocks are summarized to a
`[type: uri]` placeholder rather than inlined, and an unknown role is coerced to
`user` so a prompt can't fake a system channel. `client/features.rs` implements
`list_resources`, `list_resource_templates`, `read_resource`, `list_prompts`,
and `get_prompt` over the shared `client/rpc.rs::request_endpoint` dispatch
(HTTP + stdio, modern `_meta` injection), each running its response through the
validators and reusing the cursor-pagination loop with a finite page cap.
`client/rpc.rs` adds a bounded in-memory freshness cache keyed per server+method:
a list is cached only when the server returns a positive `ttlMs` (clamped to one
hour), `cacheScope` public/private is recorded, entries expire on their own TTL,
and every teardown/resync/list-change invalidates the owning server's entries —
nothing is persisted to disk. `client/subscriptions.rs` turns a stdio server's
`notifications/*/list_changed` (and `resources/updated`) into a resync (tools)
or cache invalidation (resources/prompts); the listener consumes the transport's
notification receiver and ends deterministically when the child's channel closes
on process loss, with resubscription implicit on the next reconnect. HTTP
list-change relies on `mcp_reconnect` (ponytail: upgrade to a persistent GET
event-stream). Five Tauri commands (`mcp_list_resources`,
`mcp_list_resource_templates`, `mcp_read_resource`, `mcp_list_prompts`,
`mcp_get_prompt`) expose the surface, and the settings UI gates a read-only
resource/prompt browser (`McpFeaturesPanel`) behind a connected server's
advertised `capabilities.resources`/`prompts`.

Exit gate:

- Resources and prompts cannot silently inject executable content or secrets.
- Cache freshness and private/public scope are respected.
- Subscription loss and replay are deterministic.

### Phase 6 — MRTR and user interaction

**Goal:** Support modern server requests for user input without unsafe implicit
execution.

Work:

- Parse `InputRequiredResult` for `tools/call`, `resources/read`, and `prompts/get`.
- Add bounded, typed models for `inputRequests`, `inputResponses`, and opaque
  `requestState`.
- Implement form-mode elicitation with schema validation, review, decline, and
  cancel controls.
- Implement URL-mode elicitation with full-URL display, explicit consent,
  safe external opening, and no prefetching.
- Never expose passwords, access tokens, or API keys through form mode.
- Retry with a new request ID and exact opaque `requestState` echo.
- Preserve partial execution status in the agent timeline.

Exit gate:

- User can approve, decline, cancel, or retry an elicitation.
- Request state is never parsed or modified by the client.
- Server-origin and requested data are visible in user-facing language.

### Phase 7 — Optional extensions

**Goal:** Add extensions only when a product requirement justifies their cost.

Candidates:

- **Tasks:** durable handles, polling, input-required states, cancellation, and
  reload-safe long-running tool execution.
- **MCP Apps:** sandboxed interactive UI with strict artifact/CSP boundaries.
- OpenTelemetry trace context propagation.

Extensions must be explicitly negotiated, feature-gated, and independently
matured. They must not be mixed into the mandatory core transport path.

### Phase 8 — Release hardening

**Goal:** Make the feature supportable in production.

Work:

- Replace path-sensitive source verifiers with behavior/contract tests.
- Add mock modern HTTP, legacy HTTP, modern stdio, and legacy stdio fixtures.
- Add malformed-server and malicious-server fixtures.
- Run TypeScript, build, Rust check, Rust tests, clippy, security, file-size,
  and bundle gates.
- Document supported protocol versions and known compatibility limits in the UI.
- Add a diagnostics export containing safe inventory and protocol status only.
- Add migration guidance for existing `.mcp.json` entries.

Release gate:

- Current modern spec works.
- Legacy compatibility is tested.
- Security and consent tests pass.
- Agent behavior is deterministic when MCP is absent, unavailable, ready, or
  changing.

## 5. Agent decision table

| Inventory state | Agent behavior |
|---|---|
| No configured servers | Say none are configured; do not invent `ext:*` tools |
| Disabled server | Treat as unavailable; suggest enabling it |
| Connecting | Wait for discovery/status; do not execute guessed tools |
| Failed | Report configured-but-unavailable; suggest reconnect or config review |
| Ready, zero tools | Server exists but has no usable commands; do not fabricate commands |
| Ready, tools available | Search with `tool_list`, inspect with `tool_info`, execute with `tool_exec` |
| User asks to find a new server | Search official sources, present a reviewed config preview, require consent |
| Tool schema malformed | Exclude the tool, keep the server available, show a safe diagnostic |
| Tool approval required | Show risk and target, wait for explicit approval |
| Connection lost mid-call | Preserve partial result, show retry/keep-partial state, never silently truncate |

## 6. Required test matrix

### Inventory and agent awareness

- empty user and workspace catalogs;
- user-only, workspace-only, and collision override;
- disabled, connecting, ready, failed, and zero-tool servers;
- startup inventory before and after settings UI mounts;
- status event loss and snapshot refresh;
- no secrets in prompt or inventory;
- no invented external tool IDs.

### Protocol and transport

- modern HTTP single endpoint;
- modern stdio discovery;
- legacy 2025 handshake/session;
- unsupported version and retry selection;
- JSON and SSE responses;
- pagination, cache metadata, deterministic ordering;
- unique IDs, retries, timeout, cancellation, disconnect, EOF, and restart;
- request-scoped notifications and subscription streams.

### Security

- loopback allow/deny policy;
- private IP and DNS rebinding defenses;
- redirect-to-private-network rejection;
- malformed or unsafe custom headers;
- raw secret rejection and environment-reference handling;
- stdio command confirmation and audit event;
- OAuth 401 discovery, issuer binding, PKCE, resource indicator, token audience,
  and scope step-up behavior.

### Agent command workflow

- `tool_list` finds external tools by intent;
- `tool_info` returns the exact current schema;
- `tool_exec` refuses unknown or unauthorized IDs;
- a server with no tools remains discoverable in inventory;
- tool results remain summary-first and reload-safe;
- failed discovery never leaves stale `ext:*` adapters registered.

## 7. Rollback strategy

- Keep the legacy protocol adapter while modern support is validated.
- Keep legacy config reads while the typed inventory is introduced.
- Do not remove old external-tool registrations until reconciliation and reload
  tests pass.
- If modern negotiation fails, fail closed to a visible unavailable state; do not
  silently execute through a guessed legacy route.
- If authentication or URL validation fails, do not retry through an unsafe
  transport or expose raw server responses.

## 8. Immediate next implementation slice

The first coding slice should be narrow and independently testable:

1. Add `McpServerRecord` and an authoritative inventory service.
2. Add `mcp_get_inventory` plus a typed inventory event/snapshot.
3. Inject an explicit MCP inventory section into `SystemPromptMiddleware`.
4. Add server/origin metadata to external `tool_list` descriptors.
5. Add empty, failed, ready, and zero-tool inventory tests.
6. Update stale MCP verifiers to target the current module layout without
   weakening their behavioral assertions.

Do not begin resources, prompts, OAuth, Tasks, or MCP Apps until this inventory
and agent-awareness contract is working. It is the foundation that prevents the
agent from guessing whether an MCP server exists or inventing its commands.
