# Security Protocol

This document defines the minimum security protocol for Zen dependencies,
networked integrations, and privileged development operations.

## Dependency Admission

Before adding, upgrading, or replacing any dependency:

1. Identify the direct dependency, maintainer or organization, license, and
   transitive dependency impact.
2. Prefer a stable release published at least 30 days ago. Do not automatically
   select the newest available version.
3. Verify the exact package source, lockfile checksum or integrity hash, and
   release provenance from the official registry.
4. Review changelog and known advisories for the selected version.
5. Avoid abandoned, typosquatted, unmaintained, or unexpectedly broad packages.
6. Keep the dependency change narrowly scoped and lock the resolved version.

New releases less than 30 days old require an explicit exception in the change
summary with the reason, maintainer provenance, advisory review, and rollback
plan. Security fixes may use an earlier release only when the known risk of not
upgrading is greater and the exception is documented.

## Build Artifact Detections

When antivirus or endpoint protection flags a build artifact:

1. Do not restore, execute, or exclude the file immediately.
2. Record the full path, detection name, file hash, build timestamp, and the
   dependency chain that produced it.
3. Compare the registry archive hash with the lockfile checksum.
4. Check for detections outside generated build directories. Treat those as a
   separate incident.
5. Run an up-to-date system scan. Restore only after the provenance review is
   complete or the user explicitly accepts the risk.

## Network And Media Sources

- The renderer must not execute arbitrary remote endpoints supplied by a model
  or user configuration.
- Rust services own remote connector allowlists, DNS/IP validation, redirect
  checks, response-size limits, and media-type validation.
- Camera, HLS, and other media sources require an approved backend-owned
  catalog before they are exposed in the UI.

## Secrets And Privileged Actions

- Store secrets only through the secret service or OS keychain.
- Privileged actions must route through the security service, permission
  checks, and audit logging.
- Never put API keys, tokens, or raw credential values in frontend persistence,
  normal settings, logs, fixtures, or screenshots.
