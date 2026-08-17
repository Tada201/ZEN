import { callCommand } from "./tauriClient";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type McpConfig = Record<string, unknown>;

export type McpTransport = "http" | "stdio";

/** Which catalog a server lives in: `user` (global) or `workspace` (project). */
export type McpScope = "user" | "workspace";

export interface McpServerEntry {
  name: string;
  scope: McpScope;
  transport: McpTransport;
  /** Set for HTTP-transport entries. */
  url?: string;
  /** Set for stdio-transport entries. */
  command?: string;
  /** Set for stdio-transport entries. */
  args?: string[];
  /** Environment variables for stdio servers (values may be `${env:VAR}`). */
  env?: Record<string, string>;
  /** HTTP request headers for http servers (values may be `${env:VAR}`). */
  headers?: Record<string, string>;
  /** Per-server request timeout override in milliseconds. */
  timeoutMs?: number;
  /** When true the client skips this row during sync. */
  disabled: boolean;
}

export type McpServerStatus =
  | "reconnecting"
  | "connected"
  | "failed"
  | "disabled"
  | "awaiting_consent";

export type McpAvailability =
  | "configured"
  | "connecting"
  | "ready"
  | "failed"
  | "disabled"
  | "awaiting_consent";

/**
 * A server held at the connection-consent gate. Carries only what the user
 * needs to review before approving — never header/env *values*, only their
 * key names. `fingerprint` is echoed back verbatim to `approveServer`.
 */
export interface PendingConsent {
  name: string;
  scope: string;
  transport: string;
  /** HTTP: `scheme://host[:port]`. stdio: the command. */
  origin: string;
  /** stdio args (empty for http). Config-authored, not secret. */
  args: string[];
  /** Names (not values) of configured headers/env vars. */
  credentialKeys: string[];
  /** The exact fingerprint the user approves. */
  fingerprint: string;
}

export interface McpCapabilitySummary {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
}

/** A `resources/list` entry, safety-normalized by the backend. */
export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

/** A `resources/templates/list` entry (RFC 6570 URI template). */
export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

/**
 * One `resources/read` content block. Exactly one of `text`/`blobBase64` is
 * set; `truncated` marks a payload clipped at the backend size cap. Binary
 * stays base64 — it is never decoded into model text.
 */
export interface McpResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blobBase64?: string;
  truncated: boolean;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required: boolean;
}

/** A `prompts/list` entry, safety-normalized. */
export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments: McpPromptArgument[];
}

/**
 * One `prompts/get` message. `content` is sanitized plain text; embedded
 * resources are summarized to their URI, never inlined.
 */
export interface McpPromptMessage {
  role: "user" | "assistant";
  content: string;
}

export interface McpServerRecord {
  serverId: string;
  name: string;
  scope: McpScope;
  transport: "stdio" | "streamable_http" | "legacy_http_sse";
  availability: McpAvailability;
  protocolEra: "modern_2026" | "legacy_2025" | "legacy_2024" | "unknown";
  protocolVersion?: string;
  capabilities: McpCapabilitySummary;
  toolCount: number;
  lastSuccessAt?: string;
  lastErrorCode?: string;
}

export interface McpInventory {
  /** Monotonic snapshot revision; consumers ignore older event snapshots. */
  revision: number;
  servers: McpServerRecord[];
}

export interface McpServerStatusEvent {
  name: string;
  status: McpServerStatus;
  error?: string;
}

/** How a server is asking for input in an MRTR round. */
export type McpElicitMode = "form" | "url";

/** The user's decision on an elicitation. `content` rides only on a form `accept`. */
export type McpElicitAction = "accept" | "decline" | "cancel";

/**
 * A pending MRTR elicitation surfaced by `mcp:elicitation:request`. `form` mode
 * carries a flat-primitive `schema` to render inputs; `url` mode carries a full
 * `url` shown verbatim for consent — the backend never prefetches it and only
 * opens it in the OS browser after an explicit accept.
 */
export interface PendingElicitation {
  requestId: string;
  serverName: string;
  mode: McpElicitMode;
  message?: string;
  url?: string;
  schema?: Record<string, unknown>;
  /** Backend deadline for this prompt; the modal counts down and self-cancels. */
  timeoutSecs?: number;
}

export const mcpApi = {
  getConfig: (scope: McpScope) => callCommand<McpConfig>("mcp_get_config", { scope }),
  saveConfig: (scope: McpScope, config: McpConfig) =>
    callCommand<void>("mcp_save_config", { scope, config }),
  listServers: () => callCommand<McpServerEntry[]>("mcp_list_servers"),
  /**
   * Upsert `mcpServers[name]` in `scope` from a raw entry object. The
   * backend validates the entry has the fields its transport needs
   * (`url` for http, `command` for stdio) before persisting, then
   * kicks a background reconnect.
   */
  upsertServer: (scope: McpScope, name: string, config: Record<string, unknown>) =>
    callCommand<void>("mcp_upsert_server", { scope, name, config }),
  /** Enable/disable a row without deleting it. Returns whether it existed. */
  setEnabled: (scope: McpScope, name: string, enabled: boolean) =>
    callCommand<boolean>("mcp_set_enabled", { scope, name, enabled }),
  removeServer: (scope: McpScope, name: string) =>
    callCommand<boolean>("mcp_remove_server", { scope, name }),
  reconnect: () => callCommand<void>("mcp_reconnect"),
  getInventory: () => callCommand<McpInventory>("mcp_get_inventory"),
  /** Servers held at the consent gate, awaiting explicit user approval. */
  listPending: () => callCommand<PendingConsent[]>("mcp_list_pending"),
  /**
   * Approve a pending server for the exact `fingerprint` the user reviewed,
   * then re-sync so it connects. A stale fingerprint is rejected by the
   * backend so a config that changed after the prompt can't be approved blind.
   */
  approveServer: (name: string, fingerprint: string) =>
    callCommand<void>("mcp_approve_server", { name, fingerprint }),
  /** Deny/revoke consent; also clears any stored OAuth token, then re-syncs. */
  denyServer: (name: string) => callCommand<void>("mcp_deny_server", { name }),
  /**
   * List a connected server's resources. Explicit user action — nothing is
   * injected into the model. Entries are safety-normalized (URI allowlisted,
   * fields control-stripped) by the backend.
   */
  listResources: (serverName: string) =>
    callCommand<McpResource[]>("mcp_list_resources", { serverName }),
  /** List a connected server's resource templates (RFC 6570 URI templates). */
  listResourceTemplates: (serverName: string) =>
    callCommand<McpResourceTemplate[]>("mcp_list_resource_templates", { serverName }),
  /**
   * Read a specific resource URI. The backend validates the URI against the
   * scheme allowlist / path-traversal guard and caps content size; binary
   * stays base64.
   */
  readResource: (serverName: string, uri: string) =>
    callCommand<McpResourceContents[]>("mcp_read_resource", { serverName, uri }),
  /** List a connected server's prompts. Explicit user action. */
  listPrompts: (serverName: string) =>
    callCommand<McpPrompt[]>("mcp_list_prompts", { serverName }),
  /**
   * Fetch a prompt's messages with user-supplied arguments. Message content is
   * sanitized to plain text; embedded resources are summarized to their URI.
   */
  getPrompt: (serverName: string, name: string, args?: Record<string, unknown>) =>
    callCommand<McpPromptMessage[]>("mcp_get_prompt", {
      serverName,
      name,
      arguments: args,
    }),
  /**
   * Run the interactive OAuth 2.1 (PKCE) flow: opens the system browser to a
   * loopback redirect, exchanges the code, stores the token in the OS keyring,
   * then re-syncs. `resourceMetadataUrl` comes from a 401's advertised
   * protected-resource metadata when present.
   */
  authorizeOauth: (
    name: string,
    serverUrl: string,
    clientId: string,
    scopes?: string,
    resourceMetadataUrl?: string,
  ) =>
    callCommand<void>("mcp_authorize_oauth", {
      name,
      serverUrl,
      clientId,
      scopes,
      resourceMetadataUrl,
    }),
  /**
   * Subscribe to per-row `mcp:server:status` events. The handler
   * receives one event per server row whenever a sync
   * (boot, add, remove, reconnect) progresses. Returns a Tauri
   * unlisten function — call it in a React effect cleanup to
   * detach the listener when the settings tab unmounts.
   */
  subscribeInventory: (onEvent: (inventory: McpInventory) => void): Promise<UnlistenFn> =>
    listen<McpInventory>("mcp:inventory", (e) => onEvent(e.payload)),
  subscribeServerStatus: (
    onEvent: (event: McpServerStatusEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<McpServerStatusEvent>("mcp:server:status", (e) => onEvent(e.payload)),
  /**
   * Resolve a pending MRTR elicitation. `action` is the user's decision;
   * `content` is only forwarded for a form-mode `accept` (the backend drops it
   * otherwise). Never send secret values via form mode — servers requesting
   * credentials are auto-declined by the backend before they ever reach here.
   */
  resolveElicitation: (
    requestId: string,
    action: McpElicitAction,
    content?: Record<string, unknown>,
  ) =>
    callCommand<void>("mcp_resolve_elicitation", {
      requestId,
      value: content && action === "accept" ? { action, content } : { action },
    }),
  /**
   * Subscribe to `mcp:elicitation:request` events. Each event is a server
   * asking for input mid-request; the handler renders the modal and calls
   * `resolveElicitation`. Returns a Tauri unlisten function.
   */
  subscribeElicitation: (
    onEvent: (request: PendingElicitation) => void,
  ): Promise<UnlistenFn> =>
    listen<PendingElicitation>("mcp:elicitation:request", (e) => onEvent(e.payload)),
  /**
   * Subscribe to `mcp:elicitation:close` events — the backend gave up on a
   * prompt (timeout or run cancelled) and already answered the server, so the
   * modal must dismiss without sending a now-dead resolve.
   */
  subscribeElicitationClose: (
    onEvent: (requestId: string) => void,
  ): Promise<UnlistenFn> =>
    listen<{ requestId: string }>("mcp:elicitation:close", (e) =>
      onEvent(e.payload.requestId),
    ),
  /**
   * Ask the backend to re-emit every in-flight elicitation. Called once the
   * listener is attached (mount/reload) so a prompt that fired before the UI
   * was listening is recovered instead of silently timing out.
   */
  replayElicitations: () => callCommand<void>("mcp_replay_elicitations"),
  /**
   * Store a credential VALUE in the OS keyring under `key` so config can
   * reference it as `${secret:key}`. The raw value never reaches `.mcp.json`.
   * An empty value deletes the stored secret.
   */
  setSecret: (key: string, value: string) =>
    callCommand<void>("mcp_set_secret", { key, value }),
  /** Return which of `keys` already have a stored value (names only, no values). */
  secretStatus: (keys: string[]) =>
    callCommand<string[]>("mcp_secret_status", { keys }),
};
