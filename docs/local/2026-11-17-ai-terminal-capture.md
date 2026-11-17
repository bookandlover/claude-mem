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

## This machine's activation and fresh evidence

Applied 2026-11-17. Local settings/config originals are under
`~/.claude-mem/backups/local-ai-capture-1794895478809/`; OpenCode/OpenClaw
originals are under `~/.claude-mem/backups/terminal-integrations-1794895502/`.
Gemini's six legacy hooks were migrated to the five current lifecycle events.
Antigravity CLI reports 5/5 capture events mapped; Claude Code's existing
Claude-Mem plugin remains enabled. OpenCode's plugin was refreshed and OpenClaw's
plugin installed. Prime Agent keeps its existing JSONL watch. No cloud/remote
server was restarted.

Local worker restart verified version 15.18.3, /api/health and /api/ready both
HTTP 200. The real previously-missing Codex main conversation registered as
session 8404 and new raw tool uses were captured. The observer automatically
saved records 28825, 28827, 28829 and 28831. MCP search returned 28827 by title,
then timeline and get_observations confirmed its content. This is live automatic
persistence, not manually inserted acceptance memory. Codex observers use
`ephemeral: true`, so this transcript watch does not recursively record them.

Behavioral checks: 29 passed + 1 Windows-only skipped for profile/config/Gemini
installer; 69 additional adapter/OpenCode contract checks passed. Root TypeScript
check and bundle build passed. The installed worker already implements the
required watcher and ingestion; the new helper applies the local profile rather
than altering the upstream public capture defaults or inference lifecycle.

Inactive host limits: Claude Code, Gemini CLI, OpenCode, OpenClaw and Prime Agent
have configured capture entrypoints, but no new real interactive session was
started for each of them in this task. Existing sessions may require a fresh
start to load hook/plugin changes. Antigravity was already actively writing
observations. No claim is made that an arbitrary future AI executable, a remote
SSH session, or an intentionally transcript-free process has a compatible
capture adapter. Raw capture also does not force every tool event to become a
separate durable observation; the observer selects meaningful information.

The pre-activation document-update event has not been replayed. Its OneDrive
handoff remains the source for explicit later recovery, in accordance with the
observer lifecycle contract. The earlier vector search error did not recur in
the post-restart lookup; no vector database rebuild or purge was performed.
