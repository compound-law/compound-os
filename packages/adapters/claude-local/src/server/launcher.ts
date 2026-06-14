import { buildSandboxNpmInstallCommand } from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";

export type ClaudeExecutionLauncher = "claude" | "shannon";

export const DEFAULT_CLAUDE_COMMAND = "claude";
export const DEFAULT_SHANNON_COMMAND = "shannon";
export const DEFAULT_SHANNON_CLAUDE_COMMAND = "claude";
export const CLAUDE_CODE_NPM_PACKAGE = "@anthropic-ai/claude-code";
export const SHANNON_NPM_PACKAGE = "@dexh/shannon";
export const SHANNON_BUN_NPM_PACKAGE = "bun";

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function resolveClaudeExecutionLauncher(
  config: Record<string, unknown>,
): ClaudeExecutionLauncher {
  const raw =
    asString(config.executionLauncher, "") ||
    asString(config.launcher, "") ||
    asString(config.claudeExecutionLauncher, "");
  return raw.trim().toLowerCase() === "shannon" ? "shannon" : "claude";
}

export function resolveClaudeLauncherCommand(
  config: Record<string, unknown>,
  launcher: ClaudeExecutionLauncher,
): string {
  return asString(
    config.command,
    launcher === "shannon" ? DEFAULT_SHANNON_COMMAND : DEFAULT_CLAUDE_COMMAND,
  );
}

export function resolveShannonClaudeCommand(
  config: Record<string, unknown>,
): string {
  return (
    asString(config.shannonClaudeCommand, "") ||
    asString(config.pathToClaudeCodeExecutable, "")
  ).trim();
}

export function buildShannonSandboxInstallCommand(): string {
  return [
    buildSandboxNpmInstallCommand(SHANNON_BUN_NPM_PACKAGE),
    buildSandboxNpmInstallCommand(CLAUDE_CODE_NPM_PACKAGE),
    buildSandboxNpmInstallCommand(SHANNON_NPM_PACKAGE),
  ].join(" && ");
}

export function buildShannonSandboxEnsureInstallCommand(input: {
  shannonCommand?: string;
  claudeCommand?: string;
} = {}): string {
  const shannonCommand = input.shannonCommand?.trim() || DEFAULT_SHANNON_COMMAND;
  const claudeCommand = input.claudeCommand?.trim() || DEFAULT_SHANNON_CLAUDE_COMMAND;
  const missingChecks = ["bun", claudeCommand, shannonCommand]
    .map((command) => `! command -v ${shellSingleQuote(command)} >/dev/null 2>&1`)
    .join(" || ");
  return `if ${missingChecks}; then ${buildShannonSandboxInstallCommand()}; fi`;
}
