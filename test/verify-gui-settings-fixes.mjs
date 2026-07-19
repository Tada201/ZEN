import { readFileSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const bridge = readFileSync("src/lib/stores/settings/settingsBridge.ts", "utf8");
check(
  "ui.compact-mode is mapped to compactMode",
  /"ui.compact-mode":\s*\{\s*field:\s*"compactMode",\s*type:\s*"boolean"\s*\}/.test(bridge),
);

const types = readFileSync("src/lib/stores/settings/types.ts", "utf8");
check(
  "compactMode is defined in InterfaceSlice",
  /compactMode:\s*boolean;/.test(types),
);

const slice = readFileSync("src/lib/stores/settings/createInterfaceSlice.ts", "utf8");
check(
  "compactMode defaults to false",
  /compactMode:\s*false,/.test(slice),
);

const modal = readFileSync("src/atlas/components/SettingsModal.tsx", "utf8");
check(
  "SettingsModal computes activeThemeValue from ui.theme mode",
  /const activeThemeValue = useMemo/.test(modal) &&
    /matched\.mode/.test(modal),
);
check(
  "SettingsModal wires Compact Mode switch to theme.setDensity",
  /theme\.setDensity\(v \? "compact" : "cozy"\)/.test(modal),
);

const provider = readFileSync("src/atlas/providers/ZenThemeProvider.tsx", "utf8");
check(
  "ZenThemeProvider reads configuredCompactMode",
  /const configuredCompactMode = useSettingsStore/.test(provider),
);
check(
  "ZenThemeProvider synchronizes configuredCompactMode to density",
  /setDensity\(configuredCompactMode \? "compact" : "cozy"\)/.test(provider),
);
check(
  "ZenThemeProvider handles system theme prefers-color-scheme listener",
  /window\.matchMedia\("\(prefers-color-scheme: dark\)"\)/.test(provider),
);

if (process.exitCode) {
  console.error("\nOne or more verifier checks failed.");
} else {
  console.log("\nAll verifier checks passed.");
}
