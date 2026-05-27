import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import cesium from "vite-plugin-cesium";

const host = process.env.TAURI_DEV_HOST;

const manualChunks = (id: string) => {
  if (!id.includes("node_modules")) return undefined;

  if (id.includes("cesium") || id.includes("@cesium")) return "vendor-cesium";
  if (id.includes("maplibre-gl") || id.includes("@maplibre")) return "vendor-map";
  if (id.includes("mermaid") || id.includes("@mermaid-js")) return "vendor-diagrams";
  if (id.includes("monaco-editor") || id.includes("@monaco-editor")) return "vendor-editor";
  if (id.includes("@react-three") || id.includes("three")) return "vendor-3d";
  if (id.includes("recharts") || id.includes("chart.js") || id.includes("react-chartjs-2")) return "vendor-charts";
  if (id.includes("react-markdown") || id.includes("remark-") || id.includes("rehype-") || id.includes("highlight.js") || id.includes("katex")) return "vendor-markdown";
  if (id.includes("framer-motion")) return "vendor-motion";
  if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("lucide-react") || id.includes("@iconify")) return "vendor-ui";

  return undefined;
};

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), cesium({ devMinifyCesium: true })],
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
