import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

// Bundle the worker with @paperclipai/plugin-sdk inlined so the plugin
// is self-contained and doesn't need its own node_modules at runtime.
await esbuild.build({
  entryPoints: [path.join(packageRoot, "src/worker.ts")],
  outfile: path.join(packageRoot, "dist/worker.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node20"],
  sourcemap: true,
  // Keep node built-ins external (they're always available)
  external: [
    "node:*",
    "fs",
    "path",
    "os",
    "crypto",
    "util",
    "stream",
    "events",
    "url",
    "child_process",
  ],
  logLevel: "info",
});

// Also bundle the manifest as a plain ESM module
await esbuild.build({
  entryPoints: [path.join(packageRoot, "src/manifest.ts")],
  outfile: path.join(packageRoot, "dist/manifest.js"),
  bundle: false,
  format: "esm",
  platform: "node",
  target: ["node20"],
  sourcemap: true,
  logLevel: "info",
});
