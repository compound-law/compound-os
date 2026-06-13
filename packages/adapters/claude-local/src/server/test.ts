import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asBoolean,
  asNumber,
  asStringArray,
  parseObject,
  ensurePathInEnv,
} from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  ensureAdapterExecutionTargetDirectory,
  maybeRunSandboxInstallCommand,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";
import path from "node:path";
import { detectClaudeLoginRequired, parseClaudeStreamJson } from "./parse.js";
import { isBedrockModelId } from "./models.js";
import { buildClaudeProbePermissionArgs } from "./permissions.js";
import { SANDBOX_INSTALL_COMMAND } from "../index.js";
import {
  buildShannonSandboxEnsureInstallCommand,
  DEFAULT_SHANNON_CLAUDE_COMMAND,
  resolveClaudeExecutionLauncher,
  resolveClaudeLauncherCommand,
  resolveShannonClaudeCommand,
} from "./launcher.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function commandLooksLike(command: string, expected: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === expected || base === `${expected}.cmd` || base === `${expected}.exe`;
}

function summarizeProbeDetail(stdout: string, stderr: string): string | null {
  const raw = firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const executionLauncher = resolveClaudeExecutionLauncher(config);
  const command = resolveClaudeLauncherCommand(config, executionLauncher);
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const targetIsSandbox = target?.kind === "remote" && target.transport === "sandbox";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  const runId = `claude-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "claude_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    checks.push({
      code: "claude_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "claude_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  const installCheck = await maybeRunSandboxInstallCommand({
    runId,
    target,
    adapterKey: executionLauncher === "shannon" ? "shannon" : "claude",
    installCommand: executionLauncher === "shannon"
      ? buildShannonSandboxEnsureInstallCommand({
          shannonCommand: command,
          claudeCommand: resolveShannonClaudeCommand(config) || DEFAULT_SHANNON_CLAUDE_COMMAND,
        })
      : SANDBOX_INSTALL_COMMAND,
    detectCommand: executionLauncher === "shannon" ? null : command,
    env,
  });
  if (installCheck) checks.push(installCheck);
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv);
    checks.push({
      code: executionLauncher === "shannon" ? "shannon_command_resolvable" : "claude_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: executionLauncher === "shannon" ? "shannon_command_unresolvable" : "claude_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  if (executionLauncher === "shannon") {
    const shannonClaudeCommand =
      resolveShannonClaudeCommand(config) || DEFAULT_SHANNON_CLAUDE_COMMAND;
    for (const dependency of [
      {
        command: "bun",
        okCode: "shannon_bun_resolvable",
        errCode: "shannon_bun_unresolvable",
        okMessage: "Bun is executable for Shannon.",
        errMessage: "Bun is required by the Shannon CLI but is not executable.",
        hint: "Install Bun (https://bun.sh) in this environment, then retry the probe.",
      },
      {
        command: "tmux",
        okCode: "shannon_tmux_resolvable",
        errCode: "shannon_tmux_unresolvable",
        okMessage: "tmux is executable for Shannon.",
        errMessage: "tmux is required by Shannon but is not executable.",
        hint: "Install tmux in this environment, then retry the probe.",
      },
      {
        command: shannonClaudeCommand,
        okCode: "shannon_claude_command_resolvable",
        errCode: "shannon_claude_command_unresolvable",
        okMessage: `Claude executable for Shannon is available: ${shannonClaudeCommand}`,
        errMessage: "Claude Code is required by Shannon but is not executable.",
        hint: "Install Claude Code, run `claude login`, and make sure the executable is on PATH or set shannonClaudeCommand.",
      },
    ]) {
      try {
        await ensureAdapterExecutionTargetCommandResolvable(
          dependency.command,
          target,
          cwd,
          runtimeEnv,
        );
        checks.push({
          code: dependency.okCode,
          level: "info",
          message: dependency.okMessage,
        });
      } catch (err) {
        checks.push({
          code: dependency.errCode,
          level: "error",
          message: dependency.errMessage,
          detail: err instanceof Error ? err.message : dependency.command,
          hint: dependency.hint,
        });
      }
    }
  }

  // When probing a remote target, the Paperclip host's process.env does not
  // reflect what the agent will actually see at runtime. Only consider env
  // vars from the adapter config in that case; the probe itself will surface
  // any auth issues on the remote box.
  const considerHostEnv = !targetIsRemote;
  const hasBedrock =
    env.CLAUDE_CODE_USE_BEDROCK === "1" ||
    env.CLAUDE_CODE_USE_BEDROCK === "true" ||
    (considerHostEnv && process.env.CLAUDE_CODE_USE_BEDROCK === "1") ||
    (considerHostEnv && process.env.CLAUDE_CODE_USE_BEDROCK === "true") ||
    isNonEmpty(env.ANTHROPIC_BEDROCK_BASE_URL) ||
    (considerHostEnv && isNonEmpty(process.env.ANTHROPIC_BEDROCK_BASE_URL));

  const configApiKey = env.ANTHROPIC_API_KEY;
  const hostApiKey = considerHostEnv ? process.env.ANTHROPIC_API_KEY : undefined;
  if (hasBedrock) {
    const source =
      env.CLAUDE_CODE_USE_BEDROCK === "1" ||
      env.CLAUDE_CODE_USE_BEDROCK === "true" ||
      isNonEmpty(env.ANTHROPIC_BEDROCK_BASE_URL)
        ? "adapter config env"
        : "server environment";
    checks.push({
      code: "claude_bedrock_auth",
      level: "info",
      message: "AWS Bedrock auth detected. Claude will use Bedrock for inference.",
      detail: `Detected in ${source}.`,
      hint: "Ensure AWS credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE) and AWS_REGION are configured.",
    });
  } else if (isNonEmpty(configApiKey) || isNonEmpty(hostApiKey)) {
    const source = isNonEmpty(configApiKey) ? "adapter config env" : "server environment";
    checks.push({
      code: "claude_anthropic_api_key_overrides_subscription",
      level: "warn",
      message:
        "ANTHROPIC_API_KEY is set. Claude will use API-key auth instead of subscription credentials.",
      detail: `Detected in ${source}.`,
      hint: "Unset ANTHROPIC_API_KEY if you want subscription-based Claude login behavior.",
    });
  } else if (!targetIsRemote) {
    checks.push({
      code: "claude_subscription_mode_possible",
      level: "info",
      message: "ANTHROPIC_API_KEY is not set; subscription-based auth can be used if Claude is logged in.",
    });
  }

  const canRunProbe = checks.every((check) => check.level !== "error");
  if (canRunProbe) {
    if (executionLauncher === "shannon" && !commandLooksLike(command, "shannon")) {
      checks.push({
        code: "shannon_hello_probe_skipped_custom_command",
        level: "info",
        message: "Skipped Shannon hello probe because command is not `shannon`.",
        detail: command,
        hint: "Use the `shannon` CLI command to run the automatic Shannon setup probe.",
      });
    } else if (executionLauncher === "claude" && !commandLooksLike(command, "claude")) {
      checks.push({
        code: "claude_hello_probe_skipped_custom_command",
        level: "info",
        message: "Skipped hello probe because command is not `claude`.",
        detail: command,
        hint: "Use the `claude` CLI command to run the automatic login and installation probe.",
      });
    } else {
      const model = asString(config.model, "").trim();
      const effort = asString(config.effort, "").trim();
      const chrome = asBoolean(config.chrome, false);
      const maxTurns = asNumber(config.maxTurnsPerRun, 0);
      const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
      const extraArgs = (() => {
        const fromExtraArgs = asStringArray(config.extraArgs);
        if (fromExtraArgs.length > 0) return fromExtraArgs;
        return asStringArray(config.args);
      })();

      const args = executionLauncher === "shannon"
        ? ["-p", "Respond with hello.", "--output-format", "stream-json", "--verbose"]
        : ["--print", "-", "--output-format", "stream-json", "--verbose"];
      args.push(...buildClaudeProbePermissionArgs({ dangerouslySkipPermissions, targetIsSandbox }));
      if (chrome) args.push("--chrome");
      // For Bedrock: only pass --model when the ID is a Bedrock-native identifier.
      if (model && (!hasBedrock || isBedrockModelId(model))) {
        args.push("--model", model);
      }
      if (effort) args.push("--effort", effort);
      if (executionLauncher === "claude" && maxTurns > 0) args.push("--max-turns", String(maxTurns));
      if (executionLauncher === "shannon") {
        const shannonClaudeCommand = resolveShannonClaudeCommand(config);
        if (shannonClaudeCommand) {
          args.push("--path-to-claude-code-executable", shannonClaudeCommand);
        }
      }
      if (extraArgs.length > 0) args.push(...extraArgs);

      // Sandbox bridges still add lease warmup and transport overhead, but
      // the standard-2 Cloudflare tier now probes fast enough that a 90s
      // budget leaves headroom without masking real hangs.
      const helloProbeTimeoutSec = Math.max(
        1,
        asNumber(config.helloProbeTimeoutSec, targetIsSandbox ? 90 : 45),
      );

      const probe = await runAdapterExecutionTargetProcess(
        runId,
        target,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: helloProbeTimeoutSec,
          graceSec: 5,
          stdin: executionLauncher === "shannon" ? undefined : "Respond with hello.",
          onLog: async () => {},
        },
      );

      const parsedStream = parseClaudeStreamJson(probe.stdout);
      const parsed = parsedStream.resultJson;
      const loginMeta = detectClaudeLoginRequired({
        parsed,
        stdout: probe.stdout,
        stderr: probe.stderr,
      });
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr);

      if (probe.timedOut) {
        checks.push({
          code: executionLauncher === "shannon" ? "shannon_hello_probe_timed_out" : "claude_hello_probe_timed_out",
          level: "warn",
          message: `${executionLauncher === "shannon" ? "Shannon" : "Claude"} hello probe timed out.`,
          hint: executionLauncher === "shannon"
            ? "Retry the probe. If this persists, verify `shannon -p \"Respond with hello.\" --output-format stream-json --verbose` works from this directory manually."
            : "Retry the probe. If this persists, verify Claude can run `Respond with hello` from this directory manually.",
        });
      } else if (loginMeta.requiresLogin) {
        checks.push({
          code: executionLauncher === "shannon" ? "shannon_hello_probe_auth_required" : "claude_hello_probe_auth_required",
          level: "warn",
          message: `${executionLauncher === "shannon" ? "Shannon launched Claude" : "Claude CLI is installed"}, but login is required.`,
          ...(detail ? { detail } : {}),
          hint: loginMeta.loginUrl
            ? `Run \`claude login\` and complete sign-in at ${loginMeta.loginUrl}, then retry.`
            : "Run `claude login` in this environment, then retry the probe.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsedStream.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello
            ? executionLauncher === "shannon" ? "shannon_hello_probe_passed" : "claude_hello_probe_passed"
            : executionLauncher === "shannon" ? "shannon_hello_probe_unexpected_output" : "claude_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? `${executionLauncher === "shannon" ? "Shannon" : "Claude"} hello probe succeeded.`
            : `${executionLauncher === "shannon" ? "Shannon" : "Claude"} probe ran but did not return \`hello\` as expected.`,
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
                hint: executionLauncher === "shannon"
                  ? "Try the probe manually (`shannon -p \"Respond with hello.\" --output-format stream-json --verbose`)."
                  : "Try the probe manually (`claude --print - --output-format stream-json --verbose`) and prompt `Respond with hello`.",
              }),
        });
      } else {
        checks.push({
          code: executionLauncher === "shannon" ? "shannon_hello_probe_failed" : "claude_hello_probe_failed",
          level: "error",
          message: `${executionLauncher === "shannon" ? "Shannon" : "Claude"} hello probe failed.`,
          ...(detail ? { detail } : {}),
          hint: executionLauncher === "shannon"
            ? "Run `shannon -p \"Respond with hello.\" --output-format stream-json --verbose` manually in this directory to debug."
            : "Run `claude --print - --output-format stream-json --verbose` manually in this directory and prompt `Respond with hello` to debug.",
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
