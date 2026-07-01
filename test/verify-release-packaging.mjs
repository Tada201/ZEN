import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const failures = [];

const tauri = JSON.parse(await read("src-tauri/tauri.conf.json"));
const packageJson = JSON.parse(await read("package.json"));
const cargoManifest = await read("src-tauri/Cargo.toml");
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const resources = tauri.bundle?.resources ?? [];
expect(packageJson.version === tauri.version && cargoVersion === tauri.version,
  "package.json, tauri.conf.json, and Cargo.toml must use the same app version.");
expect(Array.isArray(tauri.bundle?.targets) && tauri.bundle.targets.length === 1 && tauri.bundle.targets[0] === "msi",
  "Tauri release output must be MSI-only.");
expect(!resources.some((resource) => /resources\/(binaries|models)/.test(resource)),
  "Whisper, Piper, and local models must not be listed as bundled resources.");

const release = await read(".github/workflows/release.yml");
for (const required of [
  "npm test",
  "cargo check --all-targets",
  "cargo clippy --all-targets -- -D warnings",
  "cargo test --bin zen",
  "cargo audit",
  "WINDOWS_CERTIFICATE_BASE64",
  "Verify no DB files in bundle output",
]) {
  expect(release.includes(required), `Release workflow is missing required gate: ${required}`);
}
expect(!release.includes("npm run runtime:fetch"),
  "Release workflow must not fetch optional voice runtimes for the app bundle.");
expect(release.includes("name: zen-windows-dev-unsigned")
  && release.includes("if: github.event_name == 'workflow_dispatch'"),
  "Manual workflow runs must upload an explicitly unsigned development artifact.");
expect(release.includes("- name: Sign Windows installers\n        if: startsWith(github.ref, 'refs/tags/v')")
  && release.includes("- name: Upload signed release bundles\n        if: startsWith(github.ref, 'refs/tags/v')"),
  "Signing and published release artifacts must be limited to version tags.");

const ci = await read(".github/workflows/ci.yml");
expect(ci.includes("pull_request:") && ci.includes("push:"),
  "CI must run automatically for main pushes and pull requests.");

const runtimeResources = await read("src-tauri/src/services/runtime_resource.rs");
expect(runtimeResources.includes('join("runtimes")') && runtimeResources.includes("RuntimeBinarySource::AppData"),
  "Runtime resolution must prefer AppData managed runtimes.");
expect(!runtimeResources.includes("bundled_model_path"),
  "Runtime resources must not retain a bundled-model fallback.");

const dependencyCommand = await read("src-tauri/src/commands/dependency.rs");
expect(dependencyCommand.includes("install_managed_dependency") && dependencyCommand.includes("failed SHA-256 verification"),
  "Dependency manager must install managed runtimes through verified downloads.");

const libRs = await read("src-tauri/src/lib.rs");
expect(
  libRs.includes("cfg!(debug_assertions)") &&
    libRs.includes('"novus-dev.db"') &&
    libRs.includes('"lancedb-dev"'),
  "Release build must use a production database path and dev builds must use a dev-only path."
);
expect(
  !/let\s+db_path\s*=\s*app_dir\.join\("novus\.db"\)\s*;/.test(libRs),
  "Hard-coded novus.db path must be replaced with profile-specific selection."
);

if (failures.length > 0) {
  console.error("Release packaging contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Release packaging contract passed.");

function expect(condition, message) {
  if (!condition) failures.push(message);
}
