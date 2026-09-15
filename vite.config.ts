import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/heat-origin-card.ts",
      name: "HeatOriginCard",
      formats: ["es"],
      fileName: () => "heat-origin-card.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: "esbuild",
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"]
  }
});
