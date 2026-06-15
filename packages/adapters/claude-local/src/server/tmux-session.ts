import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TmuxLaunchOptions {
  sessionName: string;
  cwd: string;
  env: Record<string, string>;
  command: string; // e.g. "claude"
  args: string[]; // e.g. ["--session-id", uuid, "--dangerously-skip-permissions"]
  readyTimeoutMs: number;
  readyPattern?: RegExp; // pane text signalling the input box rendered
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function runTmux(
  args: string[],
  opts: { env?: Record<string, string>; input?: string } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("tmux", args, {
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    if (opts.input !== undefined) proc.stdin.write(opts.input);
    proc.stdin.end();
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns true if tmux is installed and reachable. */
export async function tmuxAvailable(): Promise<boolean> {
  const { code } = await runTmux(["-V"]);
  return code === 0;
}

/** Returns true if a tmux session with the given name already exists. */
export async function sessionExists(name: string): Promise<boolean> {
  const { code } = await runTmux(["has-session", "-t", name]);
  return code === 0;
}

/** Captures the current visible text of the named session's pane. */
export async function capturePane(name: string): Promise<string> {
  const { stdout } = await runTmux(["capture-pane", "-t", name, "-p"]);
  return stdout;
}

/** Kills the named tmux session. */
export async function killSession(name: string): Promise<void> {
  await runTmux(["kill-session", "-t", name]);
}

/**
 * Ensure a tmux session is running with the given command. If the session
 * already exists this is a no-op. Otherwise a detached session is created,
 * the command is sent, and we poll until the ready glyph appears.
 *
 * The ready pattern defaults to /❯/ — the Claude TUI v2.1.177 input-box
 * prompt glyph (verified manually against tmux 3.6b).
 */
export async function ensureSession(opts: TmuxLaunchOptions): Promise<void> {
  if (await sessionExists(opts.sessionName)) return;

  // Build -e KEY=VAL flags (requires tmux ≥ 3.2).
  const envFlags: string[] = [];
  for (const [key, val] of Object.entries(opts.env)) {
    envFlags.push("-e", `${key}=${val}`);
  }

  const newSessionArgs = [
    "new-session",
    "-d",
    "-s",
    opts.sessionName,
    "-c",
    opts.cwd,
    ...envFlags,
  ];

  const { code, stderr } = await runTmux(newSessionArgs);
  if (code !== 0) {
    throw new Error(`tmux new-session failed: ${stderr}`);
  }

  // Send the command to the session's pane.
  const commandLine = [opts.command, ...opts.args].join(" ");
  await runTmux(["send-keys", "-t", opts.sessionName, commandLine, "Enter"]);

  // Poll until the ready glyph is visible or we time out.
  const pattern = opts.readyPattern ?? /❯/;
  const deadline = Date.now() + opts.readyTimeoutMs;

  while (Date.now() < deadline) {
    const pane = await capturePane(opts.sessionName);
    if (pattern.test(pane)) return;
    await sleep(500);
  }

  throw new Error("Claude interactive session did not become ready before timeout");
}

/**
 * Send a prompt to a running interactive session.
 *
 * Uses `tmux load-buffer` + `paste-buffer -p` to transfer the text. The
 * bracketed-paste flag (`-p`) is critical: it wraps the content in the
 * terminal bracketed-paste escape sequences so that any embedded newlines in
 * `text` are treated as literal characters rather than as Enter key-presses,
 * preventing the prompt from being submitted prematurely.
 */
export async function sendPrompt(name: string, text: string): Promise<void> {
  const tmp = path.join(os.tmpdir(), `paperclip-claude-${name}-${process.pid}.txt`);
  try {
    await fs.writeFile(tmp, text, "utf8");

    const load = await runTmux(["load-buffer", "-b", name, tmp]);
    if (load.code !== 0) {
      throw new Error(`tmux load-buffer failed: ${load.stderr}`);
    }

    await runTmux(["paste-buffer", "-p", "-b", name, "-t", name]);
    await runTmux(["send-keys", "-t", name, "Enter"]);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Returns true if the pane content has not changed after `quietMs` milliseconds.
 * Useful for detecting when a response has settled before reading it.
 */
export async function paneStable(name: string, quietMs: number): Promise<boolean> {
  const before = await capturePane(name);
  await sleep(quietMs);
  const after = await capturePane(name);
  return before === after;
}
