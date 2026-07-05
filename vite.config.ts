import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Base path must match the GitHub Pages deployment path, e.g. https://<user>.github.io/<repo>/
// Override at build time with VITE_BASE_PATH, or it defaults to the repo name below.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/kanban-simple/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Function form so nested package entry points (e.g. react-dom/client)
        // are matched by package directory — the array form left react-dom's
        // implementation in the app chunk, which changes on every deploy.
        manualChunks(id) {
          const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//);
          if (!match) return undefined;
          const pkg = match[1];
          if (["react", "react-dom", "scheduler", "react-router", "react-router-dom"].includes(pkg))
            return "vendor";
          if (pkg.startsWith("@supabase/")) return "supabase";
          if (pkg.startsWith("@tanstack/")) return "query";
          if (pkg.startsWith("@dnd-kit/")) return "dnd";
          return undefined;
        },
      },
    },
  },
});
