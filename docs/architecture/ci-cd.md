# CI/CD Pipeline

Zen uses GitHub Actions for repeatable build and release checks.

## CI

The CI workflow is `.github/workflows/ci.yml`.

Required gates:

- `npm ci`
- `npm run secret:artifacts`
- `npm run build`
- `cargo check --all-targets`
- `npm run test:backend -- -NoKillStaleBuilds`
- `npm run quality:fast`
- `npm run runtime:fetch -- -Clean`
- `npm run runtime:check`

Default CI intentionally does not run `npx tauri build --no-bundle`. That check
is too slow for normal feedback on this codebase and currently belongs in the
release workflow or an explicit manual verification run.

## Release

The release workflow is `.github/workflows/release.yml`.

It runs on `v*.*.*` tags and manual dispatch, then builds and uploads Windows
Tauri bundle artifacts.

The workflow does not upload local databases, `.env` files, or secret-looking
runtime artifacts. `npm run secret:artifacts` runs before and after packaging.

Runtime binaries are not committed to Git. The release workflow downloads pinned
archives from `scripts/runtime-binaries.json`, verifies SHA256 checksums, copies
only the required files into `src-tauri/resources/binaries`, and then packages
the app.

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
