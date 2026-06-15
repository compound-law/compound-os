import { randomUUID } from "node:crypto";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  parseObject,
  renderTemplate,
  renderPaperclipWakePrompt,
  joinPromptSections,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import {
  buildClaudeRuntimeConfig,
  resolveClaudeBillingType,
} from "./execute.js";
import {
  findTranscriptBySessionId,
  readTranscript,
  collectTurn,
  isTurnComplete,
  summarizeTurnUsage,
  turnResponseText,
  turnModel,
  turnServiceTier,
  type TranscriptEntry,
} from "./transcript.js";
import {
  tmuxAvailable,
  sessionExists,
  ensureSession,
  sendPrompt,
  capturePane,
  paneStable,
  killSession,
} from "./tmux-session.js";
import {
  readAdapterExecutionTarget,
  adapterExecutionTargetIsRemote,
} from "@paperclipai/adapter-utils/execution-target";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function executeInteractive(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, authToken } = ctx;
  const log = onLog ?? (async () => {});

  // ponytail: local-only in v1 — reject only genuinely remote targets; Paperclip
  // always attaches a (local) execution target, so presence alone isn't remote.
  const executionTarget = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });
  if (adapterExecutionTargetIsRemote(executionTarget)) {
    throw new Error("claude-local interactive mode supports local execution only");
  }
  if (!(await tmuxAvailable())) {
    throw new Error("tmux is not installed; required for claude-local interactive mode");
  }

  const runtimeConfig = await buildClaudeRuntimeConfig({
    runId,
    agent,
    config,
    context,
    authToken,
    onLog: log,
  });

  const billingType = resolveClaudeBillingType(runtimeConfig.env);
  if (billingType !== "subscription") {
    throw new Error(`claude-local interactive mode requires subscription auth, found ${billingType}`);
  }

  const model = asString(config.model, "");
  const skipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
  const maxTurns = asNumber(config.maxTurnsPerRun, 0);
  const quietMs = asNumber(config.interactiveQuietMs, 2000);
  const readyTimeoutMs = asNumber(config.interactiveReadyTimeoutMs, 20000);
  // headless treats timeoutSec<=0 as "no limit" (passed to the process runner),
  // but the interactive poll loop needs a finite deadline or it never polls.
  // ponytail: 0/unset → 30min cap; set config.timeoutSec to raise it.
  const timeoutSec = runtimeConfig.timeoutSec > 0 ? runtimeConfig.timeoutSec : 1800;

  const sessionName = "paperclip-" + agent.id.replace(/[^A-Za-z0-9_-]/g, "-");

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const priorSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? "");
  const priorTmux = asString(runtimeSessionParams.tmuxSession, "");
  const priorTranscript = asString(runtimeSessionParams.transcriptPath, "");
  const reusing =
    priorTmux === sessionName && priorSessionId.length > 0 && (await sessionExists(sessionName));

  let sessionId = reusing ? priorSessionId : randomUUID();

  const launchArgs: string[] = ["--session-id", sessionId];
  if (skipPermissions) launchArgs.push("--dangerously-skip-permissions");
  if (model) launchArgs.push("--model", model);
  // Bound a single interactive heartbeat turn (only applied at session launch).
  if (maxTurns > 0) launchArgs.push("--max-turns", String(maxTurns));
  launchArgs.push(...runtimeConfig.extraArgs);

  if (!reusing) {
    if (await sessionExists(sessionName)) {
      await killSession(sessionName);
    }
    await ensureSession({
      sessionName,
      cwd: runtimeConfig.cwd,
      env: runtimeConfig.env,
      command: runtimeConfig.command,
      args: launchArgs,
      readyTimeoutMs,
    });
  }

  // Prompt assembly (mirrors execute.ts; `reusing` plays the role of a resumed session).
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const bootstrapPromptTemplate = asString(config.bootstrapPromptTemplate, "");
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedBootstrap =
    !reusing && bootstrapPromptTemplate.trim().length > 0
      ? renderTemplate(bootstrapPromptTemplate, templateData).trim()
      : "";
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: reusing });
  const shouldUseResumeDelta = reusing && wakePrompt.length > 0;
  const renderedPrompt = shouldUseResumeDelta ? "" : renderTemplate(promptTemplate, templateData);
  const handoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const taskNote = asString(context.paperclipTaskMarkdown, "").trim();
  const prompt = joinPromptSections([renderedBootstrap, wakePrompt, handoffNote, taskNote, renderedPrompt]);

  const sendIso = new Date().toISOString();
  await sendPrompt(sessionName, prompt);

  let transcriptFile = reusing ? priorTranscript : "";
  let lastTurn: TranscriptEntry[] = [];
  let timedOut = true;
  const sendMs = Date.parse(sendIso);
  const deadline = Date.now() + timeoutSec * 1000;

  while (Date.now() < deadline) {
    await sleep(1500);

    if (!transcriptFile) {
      const f = await findTranscriptBySessionId(sessionId);
      if (f) transcriptFile = f;
      else continue;
    }

    const all = await readTranscript(transcriptFile);
    const sliced = all.filter((entry) => {
      if (!entry.timestamp) return true;
      const ts = Date.parse(entry.timestamp);
      if (Number.isNaN(ts)) return true;
      return ts >= sendMs;
    });
    const turn = collectTurn(sliced);
    if (turn.length === 0) continue;

    if (isTurnComplete(turn) && (await paneStable(sessionName, quietMs))) {
      lastTurn = turn;
      timedOut = false;
      break;
    }
    lastTurn = turn;
  }

  const response = turnResponseText(lastTurn);
  const usage = summarizeTurnUsage(lastTurn);

  await log("stdout", response || (await capturePane(sessionName)).split("\n").slice(-30).join("\n"));

  return {
    exitCode: timedOut ? 124 : 0,
    signal: null,
    timedOut,
    errorMessage: timedOut ? "Interactive turn timed out" : null,
    usage,
    sessionId: sessionId || null,
    sessionParams: sessionId
      ? { sessionId, tmuxSession: sessionName, cwd: runtimeConfig.cwd, transcriptPath: transcriptFile }
      : null,
    sessionDisplayId: sessionId || null,
    provider: "anthropic",
    biller: "anthropic_subscription",
    model: turnModel(lastTurn) ?? (model || null),
    billingType: "subscription",
    resultJson: {
      response,
      serviceTier: turnServiceTier(lastTurn),
      paneTail: (await capturePane(sessionName)).split("\n").slice(-30).join("\n"),
    },
    summary: response ? response.slice(0, 280) : null,
  };
}
