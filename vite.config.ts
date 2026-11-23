import { randomUUID } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { generateEventImageVariants } from "./scripts/event-image-variants";
// The planner is served at the root of planner.grailfoxtcg.com. Set VITE_BASE
// (for example "/vendor-planner/") to host it under a sub-path instead.
const base = `/${(process.env.VITE_BASE ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "event-image-variants",
      async buildStart() {
        await generateEventImageVariants(fileURLToPath(new URL("./public/logos/", import.meta.url)));
      },
    },
    {
      name: "planner-build-id",
      apply: "build",
      transformIndexHtml: () => [
        { tag: "meta", attrs: { name: "planner-build-id", content: randomUUID() }, injectTo: "head" },
      ],
    },
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
