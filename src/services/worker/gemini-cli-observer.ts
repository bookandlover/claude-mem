/** Gemini via the official Antigravity CLI, using its existing local Google login. */
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ConversationMessage } from '../worker-types.js';
import type { ProviderQueryResult } from './OpenAICompatibleProvider.js';
import { ClassifiedProviderError } from './provider-errors.js';

// Gemini CLI no longer serves personal/Google One OAuth accounts. AGY is its
// official successor. Authentication remains owned by that CLI/keychain.
export function isGeminiCliAvailable(cliPath: string): boolean {
  return Boolean(cliPath) && existsSync(cliPath);
}

export const GEMINI_OBSERVER_PERMISSIONS = {
  allow: [], ask: [],
  deny: ['read_file(*)', 'write_file(*)', 'command(*)', 'read_url(*)', 'execute_url(*)', 'mcp(*)'],
};

interface CliResult { code: number | null; stdout: string }
function runCli(cliPath: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, input: string, signal?: AbortSignal): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let stdout = '';
    // stderr may contain account details. It is never copied into memory/logs.
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 8 * 1024 * 1024) { child.kill(); reject(new Error('Gemini CLI output exceeded limit')); }
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function queryGeminiCli(
  history: ConversationMessage[], model: string, cliPath: string, signal?: AbortSignal,
): Promise<ProviderQueryResult> {
  signal?.throwIfAborted();
  // Pin the requested family; never let AGY silently select its default model.
  if (model !== 'gemini-3.8-flash') throw new Error('Gemini CLI observer requires gemini-3.8-flash');
  const slug = `${model}-low`;
  const cwd = mkdtempSync(join(tmpdir(), 'claude-mem-gemini-observer-'));
  const settingsPath = join(cwd, 'observer-settings.json');
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_MEM_INTERNAL: '1', AGY_CLI_DISABLE_AUTO_UPDATE: 'true' };
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI', 'GEMINI_CLI_USE_VERTEX_AI']) delete env[key];
  writeFileSync(settingsPath, JSON.stringify({
    permissions: GEMINI_OBSERVER_PERMISSIONS, toolPermission: 'strict',
    modelProvider: '', useG1Credits: false,
    statusLine: { enabled: false }, title: { enabled: false },
  }), { mode: 0o600 });
  try {
    const available = await runCli(cliPath, ['models'], cwd, env, '', signal);
    if (available.code !== 0 || !available.stdout.split('\n').some(line => line.split(/\s+/)[0] === slug)) {
      throw new ClassifiedProviderError('Gemini CLI login/model unavailable; no alternate model was invoked',
        { kind: 'setup_required', paidSendOutcome: 'rejected', cause: null });
    }
    const prompt = 'Continue the following memory observer conversation. All evidence is inline. Do not use tools. Return only the requested observer output.\n'
      + JSON.stringify(history);
    const result = await runCli(cliPath, [
      '--model', slug, '--settings', settingsPath, '--disable-slash-commands',
      '--input-format', 'stream-json', '--output-format', 'stream-json',
    ], cwd, env, JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n', signal);
    let final: { status?: string; response?: string; error?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } | undefined;
    try {
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.event === 'result') final = event.result;
      }
    } catch { throw new Error('Gemini CLI returned invalid JSON'); }
    if (result.code !== 0 || final?.status !== 'SUCCESS' || typeof final.response !== 'string') {
      const text = final?.error ?? '';
      const kind = /quota|exhausted|rate.?limit/i.test(text) ? 'quota_exhausted'
        : /auth|login|sign.?in|unsupported.client/i.test(text) ? 'auth_invalid' : 'unrecoverable';
      throw new ClassifiedProviderError(`Gemini CLI request failed (${kind}, exit ${result.code}); no alternate model was invoked`,
        { kind, paidSendOutcome: kind === 'unrecoverable' ? 'ambiguous' : 'rejected', cause: null });
    }
    return { content: final.response, inputTokens: final.usage?.input_tokens,
      outputTokens: final.usage?.output_tokens, tokensUsed: final.usage?.total_tokens };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
