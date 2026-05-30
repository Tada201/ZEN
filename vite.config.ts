import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs/promises";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const cesiumBuildDir = path.resolve(__dirname, "node_modules/cesium/Build/Cesium");
const cesiumBaseUrl = "cesium/";
const cesiumAssetDirs = ["Assets", "ThirdParty", "Workers", "Widgets"] as const;

const copyCesiumAssets = (): Plugin => ({
  name: "copy-cesium-assets",
  apply: "build",
  async closeBundle() {
    await Promise.all(
      cesiumAssetDirs.map((dir) =>
        fs.cp(path.join(cesiumBuildDir, dir), path.resolve(__dirname, "dist", cesiumBaseUrl, dir), {
          recursive: true,
        }),
      ),
    );
  },
});

const manualChunks = (id: string) => {
  if (id.includes("vite/preload-helper")) return "vendor-runtime";
  if (!id.includes("node_modules")) return undefined;

  if (
    id.includes("node_modules/react/") ||
    id.includes("node_modules/react-dom/") ||
    id.includes("node_modules/react-is/") ||
    id.includes("node_modules/scheduler/") ||
    id.includes("node_modules/use-sync-external-store/")
  ) {
    return "vendor-react";
  }
  if (id.includes("node_modules/zustand/") || id.includes("node_modules/@tanstack/")) {
    return "vendor-state";
  }
  if (id.includes("node_modules/date-fns/") || id.includes("node_modules/react-day-picker/")) {
    return "vendor-date";
  }
  if (
    id.includes("node_modules/lodash-es/") ||
    id.includes("node_modules/clsx/") ||
    id.includes("node_modules/tailwind-merge/") ||
    id.includes("node_modules/class-variance-authority/")
  ) {
    return "vendor-utils";
  }
  if (id.includes("cesium") || id.includes("@cesium")) return "vendor-cesium";
  if (id.includes("maplibre-gl") || id.includes("@maplibre")) return "vendor-map";
  if (id.includes("mermaid") || id.includes("@mermaid-js")) return "vendor-diagrams";
  if (id.includes("monaco-editor") || id.includes("@monaco-editor")) return "vendor-editor";
  if (id.includes("@react-three") || id.includes("three")) return "vendor-3d";
  if (id.includes("recharts")) return "vendor-recharts";
  if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "vendor-chartjs";
  if (id.includes("react-markdown") || id.includes("remark-gfm") || id.includes("remark-breaks")) return "vendor-markdown-core";
  if (id.includes("remark-math") || id.includes("rehype-katex") || id.includes("katex")) return "vendor-markdown-math";
  if (id.includes("remark-gemoji") || id.includes("remark-supersub") || id.includes("rehype-slug")) return "vendor-markdown-extras";
  if (id.includes("highlight.js") || id.includes("rehype-highlight")) return "vendor-markdown-highlight";
  if (id.includes("framer-motion")) return "vendor-motion";
  if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("lucide-react") || id.includes("@iconify")) return "vendor-ui";

  return undefined;
};

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [react(), tailwindcss(), copyCesiumAssets()],
  define: {
    CESIUM_BASE_URL: JSON.stringify(
      command === "serve" ? `/@fs/${normalizePath(cesiumBuildDir)}/` : cesiumBaseUrl,
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Pre-bundle ESM-only packages so the Vite dev server doesn't 500 on them
  optimizeDeps: {
    include: ["react-markdown", "remark-gfm", "react-is"],
    entries: ["index.html", "src/main.tsx"],
    holdUntilCrawlEnd: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    fs: {
      // 3. Deny access to example reference folders to prevent accidental scans
      deny: [".agents", "EXAMPLE_NO_EDITS", "specs", ".gsd", ".specify", ".bg-shell"],
    },
    watch: {
      // 4. tell Vite to ignore watching `src-tauri` and reference folders
      ignored: [
        "**/src-tauri/**", 
        "**/EXAMPLE_NO_EDITS/**", 
        "**/specs/**", 
        "**/.agents/**", 
        "**/.gsd/**", 
        "**/.specify/**", 
        "**/.bg-shell/**"
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
