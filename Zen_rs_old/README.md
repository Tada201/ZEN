# Zen_rs_old — frozen pre-migration backend snapshot

**TEMPORARY migration reference. Do not build, edit, or import from this folder.**

- Created: 2026-08-22, from commit `0a89f6b` (tag `pre-workspace-migration`)
- Contents: verbatim copy of `src-tauri/src`, `src-tauri/tests`,
  `src-tauri/policy-tests/{src,Cargo.toml}`, and the crate manifests
  (`Cargo.toml`, `Cargo.lock`, `build.rs`, `tauri.conf.json`,
  `tauri.dev.conf.json`, `audit.toml`) as they were immediately before the
  BIG_MIGRATION.md Cargo-workspace migration began.
- Purpose: while the migration (Phases 0–14) is in progress, agents and
  reviewers MUST cross-check this folder whenever the pre-migration structure,
  line numbers, or original behavior of a module is in doubt. Section 2 of
  BIG_MIGRATION.md cites file:line evidence against THIS tree.
- Excluded from codegraph (`​.codegraph/config.json`) and graphify
  (`.graphifyignore`) indexing on purpose — it is reference data, not live code.
- Deletion: scheduled for Phase 14 (governance/closure) once
  `migration/complete` is tagged and docs no longer reference pre-migration
  line numbers.
