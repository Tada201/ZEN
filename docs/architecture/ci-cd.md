# CI/CD Pipeline

Zen uses GitHub Actions for repeatable build and release checks.

## CI

The CI workflow is `.github/workflows/ci.yml`. It is **manual-only**
(`workflow_dispatch`) to conserve hosted-runner minutes — nothing below runs
automatically on push, so treat local gates as the primary feedback loop.

Jobs:

- `changes` — path filter so a docs- or frontend-only change skips the heavy
  backend matrix.
- `boundaries` — enforces the workspace crate rules on manifest changes: a
  tauri/keyring grep against `src-tauri/crates/**` plus `cargo deny check`.
- `crate-tests` — a matrix of `cargo clippy -p <crate> --all-targets` and
  `cargo test -p <crate>` across all nine domain crates plus `zen-policy-tests`.
- `coverage` — `cargo llvm-cov` over zen-security and zen-tools with
  `--fail-under-lines 50`. Informational floor, not a ratchet.
- `frontend` — `npm run build`, `npm run perf:budget`, `npm test`, with the
  secret artifact guard before and after.
- `backend` (Windows) — `cargo clippy --workspace --all-targets`,
  `cargo test --workspace`, the event-contract baseline capture,
  `npm run test:backend`, and `npm run quality:fast`.
- `runtime-binaries` — validates the pinned runtime binary manifest.
- `audit` — dependency audit.

The Windows `backend` job is the only place `cargo test --workspace` executes;
the tauri-linked test binaries abort on the dev box with
`STATUS_ENTRYPOINT_NOT_FOUND`.

Clippy needs no CLI lint flags: `[workspace.lints.clippy]` in the manifests
carries the deny set, so a bare `cargo clippy --workspace` enforces it.

Default CI intentionally does not run `npx tauri build --no-bundle`. That check
is too slow for normal feedback on this codebase and currently belongs in the
release workflow or an explicit manual verification run.

## Release

The release workflow is `.github/workflows/release.yml`.

It runs on `v*.*.*` tags and manual dispatch, then builds and uploads Windows
Tauri bundle artifacts.

The workflow does not upload local databases, `.env` files, or secret-looking
runtime artifacts. `npm run secret:artifacts` runs before and after packaging.

Runtime binaries are not committed to Git and **are deliberately not part of
the release bundle**. The release workflow performs no runtime fetch: the
Tauri resource list in `src-tauri/tauri.conf.json` bundles only
`resources/VISUALIZATION_GUIDE.md` and `resources/agents/*.json`. Managed
runtimes (whisper/piper) are installed onto the machine separately via
`npm run runtime:fetch`, which downloads the pinned archives from
`scripts/runtime-binaries.json` and verifies SHA256 checksums. The CI
`runtime-binaries` job validates that manifest; `.github/workflows/remote-build.yml`
(a manual unsigned-build workflow) also fetches them.

## Secret Artifact Policy

Local runtime data must stay outside Git and outside Tauri bundle resources.

Forbidden in tracked files and package-sensitive outputs:

- `.env` and `.env.*`
- `*.db`
- `*.sqlite`
- `*.sqlite3`
- SQLite journal files
- files or directories named like secrets, credentials, passwords, or auth tokens

The Tauri resource list is intentionally explicit in
`src-tauri/tauri.conf.json`. Do not change it back to `resources/**/*`; that
pattern can package local test databases or credential files.
