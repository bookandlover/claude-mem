import { describe, expect, it } from 'bun:test';
import { createLocalCaptureProfile } from '../../src/services/integrations/LocalCaptureProfile.js';
import { scopeNativeHookBackedCodexWatches } from '../../src/services/transcripts/config.js';

describe('explicit local all-session capture profile', () => {
  const schema = { name: 'codex', events: [] };
  const config = { version: 1 as const, schemas: { codex: schema }, watches: [
    { name: 'codex', schema: 'codex', path: '~/.codex/sessions/**/*.jsonl', startAtEnd: false, subagentOnly: true },
    { name: 'prime-agent', schema: 'prime-agent', path: '~/.prime/agent/sessions/*.jsonl', startAtEnd: true },
  ] };
  it('admits primary and subagent Codex rollouts without changing provider selection or other watches', () => {
    const settings = { CLAUDE_MEM_PROVIDER: 'codex', CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER: 'gemini' };
    const result = createLocalCaptureProfile(settings, config, schema);
    expect(result.settings.CLAUDE_MEM_CODEX_TRANSCRIPT_INGESTION).toBe('true');
    expect(result.settings.CLAUDE_MEM_PROVIDER).toBe('codex');
    expect(result.settings.CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER).toBe('gemini');
    const scoped = scopeNativeHookBackedCodexWatches(result.config, result.settings as any);
    expect(scoped.config.watches[0].subagentOnly).toBeUndefined();
    expect(scoped.config.watches[0].startAtEnd).toBe(true);
    expect(scoped.config.watches[1]).toEqual(config.watches[1]);
    expect(config.watches[0].subagentOnly).toBe(true);
  });
  it('installs a missing canonical watch and is idempotent', () => {
    const first = createLocalCaptureProfile({}, { version: 1, watches: [] }, schema);
    const second = createLocalCaptureProfile(first.settings, first.config, schema);
    expect(second).toEqual(first);
    expect(second.config.watches).toHaveLength(1);
  });
  it('does not expand a deliberately scoped custom archive watch', () => {
    const custom = { name: 'archive', schema: 'codex', path: '~/archive/*.jsonl', subagentOnly: true };
    const result = createLocalCaptureProfile({}, { version: 1, watches: [custom] }, schema);
    expect(result.config.watches[0]).toEqual(custom);
  });
});
