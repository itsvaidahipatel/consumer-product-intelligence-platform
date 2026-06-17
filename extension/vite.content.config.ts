import { defineConfig } from "vite";
import { resolve } from "node:path";

/** Single-file content script (no ES imports) for manifest + programmatic inject. */
export default defineConfig({
  base: "./",
  root: resolve(__dirname),
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/content.ts"),
      name: "AiScannerContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
  },
});
