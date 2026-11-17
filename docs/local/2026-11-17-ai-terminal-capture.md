# Explicit local AI-terminal capture

The owner opted this machine into capturing all installed AI terminal sessions.
This is not a new public default. Keep Codex as the observer provider and Gemini
as its only fallback; never enable Claude inference as a side effect.

`bun scripts/configure-local-ai-capture.ts` previews configuration.
`--apply` backs up the two local config files, enables Codex main/subagent
transcript capture and removes the stale subagent-only restriction. It uses a
new watcher state so old checkpoints cannot replay historical inference inputs.
Every configured watch must startAtEnd. Subsequent restarts resume this new state.

Use existing native installers for Gemini CLI, Antigravity, OpenCode, OpenClaw
and Claude Code's enabled plugin. Preserve unrelated hooks, authentication and
other user settings. Prime Agent remains on its existing transcript watch.
The profile is machine-wide by transcript root, so separate terminals, folders
and worktrees do not require per-project opt-in. Do not install a keylogger or
copy authentication files. A provider without hooks or a supported transcript
format needs an adapter; do not claim arbitrary unseen AI programs are captured.

After applying, restart the local memory worker once, and verify an actual new
Codex tool call reaches sdk_sessions/tool_uses and produces an observation.
An installed plugin alone is not an end-to-end verification of an inactive host.
Existing interactive hosts may need a new session to load changed hooks.

Preserve the live observer lifecycle contract: no durable inference backlog,
no automatic replay after quota/auth failure, and no recursive capture of
Claude-Mem's internal helper/observer conversations. Native and transcript
paths must keep original session/tool-call IDs for existing deduplication.
