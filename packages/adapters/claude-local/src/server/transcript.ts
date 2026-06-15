import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { UsageSummary } from "@paperclipai/adapter-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  type: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    model?: string;
    role?: string;
    stop_reason?: string | null;
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      service_tier?: string;
    };
  };
}

export type { UsageSummary };

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL string into TranscriptEntry objects.
 * Blank lines and malformed JSON are silently skipped.
 */
export function parseTranscriptLines(raw: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj["type"] === "string") {
          entries.push(obj as unknown as TranscriptEntry);
        }
      }
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Turn helpers
// ---------------------------------------------------------------------------

const COMPLETE_STOP_REASONS = new Set(["end_turn", "stop_sequence"]);

/**
 * Returns true iff the last assistant entry in `entries` has a completion
 * stop_reason (end_turn or stop_sequence).
 */
export function isTurnComplete(entries: TranscriptEntry[]): boolean {
  const assistants = entries.filter((e) => e.type === "assistant");
  if (assistants.length === 0) return false;
  const last = assistants[assistants.length - 1];
  const stopReason = last?.message?.stop_reason;
  return typeof stopReason === "string" && COMPLETE_STOP_REASONS.has(stopReason);
}

/**
 * Return all assistant-type entries from `entries`.
 * Callers are expected to pre-slice to the current turn.
 */
export function collectTurn(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.filter((e) => e.type === "assistant");
}

/**
 * Sum usage across all assistant entries in a turn.
 */
export function summarizeTurnUsage(turn: TranscriptEntry[]): UsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;

  for (const entry of turn) {
    const usage = entry.message?.usage;
    if (!usage) continue;
    inputTokens += usage.input_tokens ?? 0;
    outputTokens += usage.output_tokens ?? 0;
    cachedInputTokens += usage.cache_read_input_tokens ?? 0;
  }

  return { inputTokens, outputTokens, cachedInputTokens };
}

/**
 * Concatenate all text-type content blocks across all assistant entries in a
 * turn, trimmed.
 */
export function turnResponseText(turn: TranscriptEntry[]): string {
  const parts: string[] = [];
  for (const entry of turn) {
    const content = entry.message?.content ?? [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      }
    }
  }
  return parts.join("\n").trim();
}

/**
 * Return the model of the last assistant entry with a non-empty model field,
 * or null.
 */
export function turnModel(turn: TranscriptEntry[]): string | null {
  for (let i = turn.length - 1; i >= 0; i--) {
    const model = turn[i]?.message?.model;
    if (model) return model;
  }
  return null;
}

/**
 * Return the service_tier from the last assistant entry that has one, or null.
 */
export function turnServiceTier(turn: TranscriptEntry[]): string | null {
  for (let i = turn.length - 1; i >= 0; i--) {
    const tier = turn[i]?.message?.usage?.service_tier;
    if (tier) return tier;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Path to the ~/.claude/projects directory. */
export function claudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

/**
 * Search every subdirectory of claudeProjectsDir() for `<sessionId>.jsonl`.
 * Returns the first matching full path, or null.
 */
export async function findTranscriptBySessionId(sessionId: string): Promise<string | null> {
  const baseDir = claudeProjectsDir();
  let subdirs: string[];
  try {
    subdirs = await fs.readdir(baseDir);
  } catch {
    return null;
  }

  for (const subdir of subdirs) {
    const candidate = path.join(baseDir, subdir, `${sessionId}.jsonl`);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // not found in this subdir, continue
    }
  }
  return null;
}

/**
 * Read a transcript file and parse it. Returns an empty array on error.
 */
export async function readTranscript(file: string): Promise<TranscriptEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    raw = "";
  }
  return parseTranscriptLines(raw);
}
