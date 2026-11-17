import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const base = `/${(process.env.VITE_BASE ?? "/vendor-planner/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "development-csp",
      apply: "serve",
      // Vite's development-only inline refresh preamble and HMR websocket need
      // broader permissions. Keep the strict self-hosted CSP in production.
      transformIndexHtml: (html) =>
        html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
          "",
        ),
    },
  ],
  base,
});
