import { defineConfig } from "vitest/config";
import path from "node:path";

// Kept separate from vite.config.ts so the app build config stays focused on
// bundling. Vitest still needs the "@" alias to resolve the same way the app
// does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
