import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/ginaxams/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  test: {
    globals: true,
    environment: "node", // Pure unit tests - no DOM
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
