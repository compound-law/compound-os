#!/usr/bin/env bash
# Patch @dexh/shannon's sendPrompt to use `tmux load-buffer -b NAME FILE`
# instead of `tmux set-buffer -b NAME PROMPT`.
#
# Why: set-buffer takes the prompt as a positional command-line argument.
# When the prompt is large (Paperclip's full agent instructions can be 15-20KB),
# tmux silently rejects or truncates the command at the shell ARG_MAX boundary
# and the second message in Shannon's prompt loop never reaches Claude. Only
# the small bootstrap "READY" message gets through, so agents respond "READY"
# and do no actual work.
#
# load-buffer reads from a file path (or stdin via `-`), bypassing the
# command-line length cap entirely.
#
# Idempotent: bails cleanly if the patch is already applied.

set -euo pipefail

SHANNON_INDEX="/usr/local/lib/node_modules/@dexh/shannon/index.ts"

if [ ! -f "$SHANNON_INDEX" ]; then
  echo "patch-shannon-load-buffer: $SHANNON_INDEX not found, skipping" >&2
  exit 0
fi

if grep -q "load-buffer" "$SHANNON_INDEX"; then
  echo "patch-shannon-load-buffer: already patched, skipping"
  exit 0
fi

python3 - "$SHANNON_INDEX" <<'PYEOF'
import sys, pathlib

path = pathlib.Path(sys.argv[1])
text = path.read_text()

old = '''async function sendPrompt(tmuxSession: string, prompt: string) {
  await runCommand(["tmux", "set-buffer", "-b", `shannon-${tmuxSession}`, prompt]);
  await runCommand(["tmux", "paste-buffer", "-b", `shannon-${tmuxSession}`, "-t", tmuxSession]);
  await runCommand(["tmux", "send-keys", "-t", tmuxSession, "C-m"]);
}'''

new = '''async function sendPrompt(tmuxSession: string, prompt: string) {
  // Write the prompt to a tempfile and use `tmux load-buffer -b NAME FILE`
  // instead of `tmux set-buffer -b NAME PROMPT`. set-buffer puts the prompt
  // on the command line as an argv, which silently fails / truncates around
  // the shell ARG_MAX boundary for large payloads. Paperclip agent prompts
  // routinely run 15-20KB and were getting dropped before they reached
  // Claude, so the agent only ever processed Shannon's bootstrap "READY".
  const tempPath = `/tmp/shannon-${tmuxSession}-${randomUUID()}.txt`;
  await Bun.write(tempPath, prompt);
  try {
    await runCommand(["tmux", "load-buffer", "-b", `shannon-${tmuxSession}`, tempPath]);
    await runCommand(["tmux", "paste-buffer", "-b", `shannon-${tmuxSession}`, "-t", tmuxSession]);
    await runCommand(["tmux", "send-keys", "-t", tmuxSession, "C-m"]);
  } finally {
    try { await Bun.file(tempPath).delete(); } catch {}
  }
}'''

if old not in text:
    sys.stderr.write("patch-shannon-load-buffer: original sendPrompt body not found verbatim — Shannon upstream changed?\n")
    sys.exit(1)

path.write_text(text.replace(old, new))
print("patch-shannon-load-buffer: applied")
PYEOF
