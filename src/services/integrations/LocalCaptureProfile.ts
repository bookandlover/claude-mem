import { isNativeHookBackedCodexWatch } from '../transcripts/config.js';
import type { TranscriptSchema, TranscriptWatchConfig, WatchTarget } from '../transcripts/types.js';

/** Explicit machine-local opt-in, never the public defaults. Does not replay transcripts. */
export function createLocalCaptureProfile(
  settings: Record<string, unknown>,
  config: TranscriptWatchConfig,
  codexSchema: TranscriptSchema,
): { settings: Record<string, unknown>; config: TranscriptWatchConfig } {
  const watches = config.watches.map((watch): WatchTarget => {
    if (!isNativeHookBackedCodexWatch(watch)) return { ...watch };
    const { subagentOnly, subagentSource, ...allSessions } = watch;
    return { ...allSessions, startAtEnd: true };
  });
  if (!watches.some(isNativeHookBackedCodexWatch)) {
    watches.push({ name: 'codex', schema: 'codex', path: '~/.codex/sessions/**/*.jsonl', startAtEnd: true });
  }
  return {
    settings: {
      ...settings,
      CLAUDE_MEM_TRANSCRIPTS_ENABLED: 'true',
      CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION: 'true',
      CLAUDE_MEM_CODEX_SUBAGENT_INGESTION: 'true',
      CLAUDE_MEM_SKIP_SUBAGENT_OBSERVATIONS: 'false',
    },
    config: { ...config, schemas: { ...config.schemas, codex: codexSchema }, watches },
  };
}
