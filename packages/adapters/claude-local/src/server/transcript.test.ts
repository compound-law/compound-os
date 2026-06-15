import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTranscriptLines,
  collectTurn,
  summarizeTurnUsage,
  turnResponseText,
  isTurnComplete,
} from "./transcript.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(
  path.join(here, "__fixtures__", "turn-multi-tool.jsonl"),
  "utf8",
);

describe("transcript", () => {
  it("parses jsonl lines, skipping blanks and malformed", () => {
    const entries = parseTranscriptLines(fixture + "\n\nnot-json\n");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => typeof e.type === "string")).toBe(true);
  });

  it("detects turn completion on end_turn stop_reason", () => {
    const entries = parseTranscriptLines(fixture);
    expect(isTurnComplete(entries)).toBe(true);
  });

  it("treats a trailing tool_use as incomplete", () => {
    const partial = [
      { type: "assistant", message: { stop_reason: "tool_use", content: [], usage: { output_tokens: 1 } } },
    ];
    expect(isTurnComplete(partial as never)).toBe(false);
  });

  it("sums usage across all assistant messages in the turn", () => {
    const turn = collectTurn(parseTranscriptLines(fixture));
    const usage = summarizeTurnUsage(turn);
    // fixture: out 40 + 4 = 44; cache_read 8000 + 8200 = 16200
    expect(usage.outputTokens).toBe(44);
    expect(usage.inputTokens).toBeGreaterThanOrEqual(0);
    expect(usage.cachedInputTokens).toBe(16200);
  });

  it("assembles response text from assistant text blocks", () => {
    const turn = collectTurn(parseTranscriptLines(fixture));
    const text = turnResponseText(turn);
    expect(text).toContain("done");
  });
});
