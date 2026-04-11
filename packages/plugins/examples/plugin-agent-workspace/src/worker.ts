import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PLUGIN_NAME = "agent-workspace";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ENTRIES_PER_DIR = 1000;
const MAX_FILE_BYTES = 1024 * 1024; // 1MB

function resolvePaperclipHome(): string {
  const explicit = process.env.PAPERCLIP_HOME?.trim();
  if (explicit) return path.resolve(explicit);
  // Inside the Paperclip container, the node user's home IS the paperclip
  // data dir (see Dockerfile: `usermod -d /paperclip node`). So when the
  // plugin worker runs there, os.homedir() returns /paperclip directly.
  // Detect that by checking whether the home dir already contains an
  // `instances/` folder; if so, use it as-is. Otherwise fall back to
  // the legacy `~/.paperclip` layout for dev machines.
  const home = os.homedir();
  try {
    if (fs.existsSync(path.join(home, "instances"))) {
      return home;
    }
  } catch {
    // ignore
  }
  return path.join(home, ".paperclip");
}

function resolveInstanceId(): string {
  const id = process.env.PAPERCLIP_INSTANCE_ID?.trim();
  return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : "default";
}

function resolveAgentWorkspaceRoot(agentId: string): string {
  const home = resolvePaperclipHome();
  const instanceId = resolveInstanceId();
  return path.join(home, "instances", instanceId, "workspaces", agentId);
}

/**
 * Resolve a relative request path against the agent workspace root.
 * Returns null if the resolved path escapes the root (path traversal guard).
 */
function safeResolve(root: string, requested: string): string | null {
  const absoluteRoot = path.resolve(root);
  const absoluteRequested = requested
    ? path.resolve(absoluteRoot, requested)
    : absoluteRoot;
  const rel = path.relative(absoluteRoot, absoluteRequested);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return absoluteRequested;
}

type EntryKind = "file" | "directory" | "symlink" | "other";

function describeEntry(fullPath: string, name: string): {
  name: string;
  type: EntryKind;
  size: number | null;
} {
  try {
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) return { name, type: "directory", size: null };
    if (stat.isSymbolicLink()) return { name, type: "symlink", size: stat.size };
    if (stat.isFile()) return { name, type: "file", size: stat.size };
    return { name, type: "other", size: null };
  } catch {
    return { name, type: "other", size: null };
  }
}

function looksBinary(buf: Buffer, sampleBytes = 1024): boolean {
  const end = Math.min(buf.length, sampleBytes);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} plugin setup`);

    /**
     * List the contents of a directory inside an agent's workspace.
     * Preserves filesystem order — no sorting.
     */
    ctx.data.register("listDirectory", async (params) => {
      const agentId = typeof params.agentId === "string" ? params.agentId : "";
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      const relativePath =
        typeof params.path === "string" ? params.path : "";

      if (!agentId || !UUID_PATTERN.test(agentId)) {
        return { error: "Invalid agentId", exists: false, root: null, path: "", entries: [], truncated: false };
      }
      if (!companyId) {
        return { error: "Missing companyId", exists: false, root: null, path: "", entries: [], truncated: false };
      }

      // Verify the agent belongs to the requested company
      try {
        const agent = await ctx.agents.get(agentId, companyId);
        if (!agent) {
          return { error: "Agent not found", exists: false, root: null, path: "", entries: [], truncated: false };
        }
      } catch (err) {
        ctx.logger.warn("Failed to fetch agent", { agentId, error: String(err) });
        return { error: "Agent lookup failed", exists: false, root: null, path: "", entries: [], truncated: false };
      }

      const root = resolveAgentWorkspaceRoot(agentId);
      const resolved = safeResolve(root, relativePath);
      if (!resolved) {
        return { error: "Path outside workspace", exists: false, root, path: relativePath, entries: [], truncated: false };
      }

      if (!fs.existsSync(resolved)) {
        return { exists: false, root, path: relativePath, entries: [], truncated: false };
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(resolved);
      } catch (err) {
        return { error: String(err), exists: false, root, path: relativePath, entries: [], truncated: false };
      }

      if (!stat.isDirectory()) {
        return { error: "Not a directory", exists: true, root, path: relativePath, entries: [], truncated: false };
      }

      let rawNames: string[];
      try {
        rawNames = fs.readdirSync(resolved);
      } catch (err) {
        return { error: String(err), exists: true, root, path: relativePath, entries: [], truncated: false };
      }

      // Preserve filesystem order (no sort). Just cap the number of entries.
      const truncated = rawNames.length > MAX_ENTRIES_PER_DIR;
      const capped = truncated ? rawNames.slice(0, MAX_ENTRIES_PER_DIR) : rawNames;

      const entries = capped.map((name) => describeEntry(path.join(resolved, name), name));

      return {
        exists: true,
        root,
        path: relativePath,
        entries,
        truncated,
      };
    });

    /**
     * Read the contents of a file inside an agent's workspace.
     * Returns text content (UTF-8) for text files, or null for binary / too-large files.
     */
    ctx.data.register("readFile", async (params) => {
      const agentId = typeof params.agentId === "string" ? params.agentId : "";
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      const relativePath = typeof params.path === "string" ? params.path : "";

      if (!agentId || !UUID_PATTERN.test(agentId)) {
        return { error: "Invalid agentId", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }
      if (!companyId) {
        return { error: "Missing companyId", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }
      if (!relativePath) {
        return { error: "Missing path", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }

      try {
        const agent = await ctx.agents.get(agentId, companyId);
        if (!agent) {
          return { error: "Agent not found", content: null, size: 0, binary: false, truncated: false, path: relativePath };
        }
      } catch (err) {
        ctx.logger.warn("Failed to fetch agent", { agentId, error: String(err) });
        return { error: "Agent lookup failed", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }

      const root = resolveAgentWorkspaceRoot(agentId);
      const resolved = safeResolve(root, relativePath);
      if (!resolved) {
        return { error: "Path outside workspace", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(resolved);
      } catch (err) {
        return { error: String(err), content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }

      if (!stat.isFile()) {
        return { error: "Not a file", content: null, size: 0, binary: false, truncated: false, path: relativePath };
      }

      const size = stat.size;
      const truncated = size > MAX_FILE_BYTES;
      const readBytes = Math.min(size, MAX_FILE_BYTES);

      let buffer: Buffer;
      try {
        const fd = fs.openSync(resolved, "r");
        buffer = Buffer.alloc(readBytes);
        fs.readSync(fd, buffer, 0, readBytes, 0);
        fs.closeSync(fd);
      } catch (err) {
        return { error: String(err), content: null, size, binary: false, truncated, path: relativePath };
      }

      if (looksBinary(buffer)) {
        return { content: null, size, binary: true, truncated, path: relativePath };
      }

      return {
        content: buffer.toString("utf-8"),
        size,
        binary: false,
        truncated,
        path: relativePath,
      };
    });
  },

  async onHealth() {
    return { status: "ok", message: `${PLUGIN_NAME} ready` };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
