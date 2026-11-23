import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import baseConfig from "../../vite.config";

// Dev server for capturing the Help page screenshots: the real app, with the
// Supabase client swapped for an in-memory mock seeded with demo data.
export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@\/supabase\/client$/,
          replacement: path.resolve(__dirname, "mock-supabase.ts"),
        },
      ],
    },
    server: { port: 5199, strictPort: true },
  })
);
