import { readFileSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const fsTools = readFileSync("src-tauri/src/tools/fs_tools/write.rs", "utf8");
check(
  "apply_targeted_edit implements CRLF normalization fallback",
  /if matches\.is_empty\(\) && \(content\.contains\("\\r\\n"\) \|\| old_text\.contains\("\\r\\n"\)\)/.test(fsTools),
);
check(
  "find_trimmed_occurrences exists for trimmed whitespace fallback",
  /fn find_trimmed_occurrences/.test(fsTools),
);
check(
  "apply_targeted_edit calls find_trimmed_occurrences on mismatch",
  /matches = find_trimmed_occurrences\(content, old_text\)/.test(fsTools),
);
check(
  "crlf and trimmed unit tests are present",
  /fn apply_targeted_edit_line_ending_fallback/.test(fsTools) &&
    /fn apply_targeted_edit_trimmed_fallback/.test(fsTools),
);

if (process.exitCode) {
  console.error("\nOne or more file edit verifier checks failed.");
} else {
  console.log("\nAll file edit verifier checks passed.");
}
