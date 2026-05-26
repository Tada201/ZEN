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
- `npx tauri build --no-bundle`

The Tauri smoke build compiles the app without producing installer artifacts.
Installer packaging remains a release concern.

## Release

The release workflow is `.github/workflows/release.yml`.

It runs on `v*.*.*` tags and manual dispatch, then builds and uploads Windows
Tauri bundle artifacts.

The workflow does not upload local databases, `.env` files, or secret-looking
runtime artifacts. `npm run secret:artifacts` runs before and after packaging.

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
