# Backend Test Gate

`npm run test:backend` runs the lightweight `zen-policy-tests` package
(`src-tauri/policy-tests/`). It covers secret redaction rules, URL safety, tool
permission policy, and runtime resource path/atomic-write behavior without
linking the full Tauri application binary.

Since the backend became a Cargo workspace, most backend tests live in the
domain crates and each crate is testable on its own:

```bash
cd src-tauri
cargo test -p zen-security   # also: zen-tools zen-llm zen-mcp zen-db zen-rag zen-media zen-agent zen-core
```

That is the practical local gate — the tauri-free crates hold the large majority
of the roughly 640 Rust test functions, and they run in seconds.

The full app test path is still available:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backend-test.ps1 -IncludeFullAppTests
```

On this Windows workspace, any test target that links Tauri — which includes
`cargo test --workspace` and `cargo test --all-targets` — builds the test binary
but aborts before Rust test code executes with `STATUS_ENTRYPOINT_NOT_FOUND`.
Treat that as a native loader/toolchain blocker, not as a passing gate. The
Windows CI runner is where `cargo test --workspace` actually executes; see
`docs/architecture/ci-cd.md`.
