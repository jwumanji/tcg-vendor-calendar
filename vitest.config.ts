import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const utilitySuite = "src/utils.test.ts";
const fixture = (name: string) =>
  fileURLToPath(new URL("./scanner/fixtures/" + name, import.meta.url));

// The original utility examples use two published Scanner records and the
// timestamp of that export. Keep that input stable across weekly refreshes.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "planner",
          exclude: [...configDefaults.exclude, utilitySuite],
        },
      },
      {
        resolve: {
          alias: [
            {
              find: "../data/events.json",
              replacement: fixture("utility-events.json"),
            },
            {
              find: "../data/meta.json",
              replacement: fixture("utility-meta.json"),
            },
          ],
        },
        test: { name: "utility examples", include: [utilitySuite] },
      },
    ],
  },
});
