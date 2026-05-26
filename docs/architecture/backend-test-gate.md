# Backend Test Gate

`npm run test:backend` runs lightweight backend policy tests first. These tests
cover secret redaction rules and tool permission policy without linking the full
Tauri application binary.

The full app test path is still available:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backend-test.ps1 -IncludeFullAppTests
```

On this Windows workspace, full `cargo test --all-targets` currently builds the
test binary but can fail before Rust test code executes with
`STATUS_ENTRYPOINT_NOT_FOUND`. Treat that as a native loader/toolchain blocker,
not as a passing gate.
