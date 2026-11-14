# Local Codex-first memory policy

This optional healthwatch replaces the old Claude-to-Codex failover/restoration
loop. It pins Codex (`gpt-6.1-sol`) for memory capture and My Work refresh,
with Gemini (`gemini-4-hydrogen`) as the only inference fallback. Gemini uses
Antigravity CLI (`~/.local/bin/agy`) and its existing local Google login.
It does not use an API key, probe Claude, or restore a previous Claude provider.

Install the built plugin bundles first, then copy `claude_mem_healthwatch.py`
to `~/.claude-mem/healthwatch/` and run it with `--switch codex`. The existing
five-minute LaunchAgent can keep using that path. Settings are backed up before
changes; the obsolete `failover` state is removed. The Codex CLI path remains
machine-specific and is not overwritten.

The Gemini observer adapter verifies the requested model slug in `agy models`,
uses `gemini-4-hydrogen-low` (or `gemini-3.8-flash-low` if configured), and denies file, command, URL and MCP tool actions
with session-only settings. Inputs are passed on stdin, never command-line
arguments. Internal runs are excluded from memory capture. No Claude fallback
is used if Codex and Gemini are both unavailable.

Google's installed Gemini CLI README says personal/Google One login moved to
Antigravity CLI. The old `gemini` executable refuses these accounts with
`UNSUPPORTED_CLIENT`, including version 0.67.0; upgrading that executable is
not a substitute for using AGY.

Validation:

- `python3 tests/local_healthwatch_test.py`
- `bun test tests/observer-health.test.ts tests/gemini_provider.test.ts tests/gemini-cli-observer.test.ts tests/worker/provider-dispatch.test.ts tests/worker/quota-fallback-session-routes.test.ts`
- `bun run typecheck:root`
- `npm run build`

Keep this task branch until the changes are incorporated upstream. The local
marketplace's automatic updates are disabled during the custom installation to
avoid replacing its compiled adapter with an upstream build that lacks it.
