import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { queryGeminiCli } from '../src/services/worker/gemini-cli-observer.js';

test('uses the requested model and local OAuth with all external tool actions denied', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-cli-test-'));
  const fake = join(dir, 'gemini');
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
if (process.argv.includes('models')) { console.log('gemini-3.8-flash-low\tGemini 3.8 Flash (Low)'); process.exit(0); }
const settings = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--settings')+1], 'utf8'));
let input=''; process.stdin.on('data', x => input+=x); process.stdin.on('end', () => {
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response: JSON.stringify({args:process.argv.slice(2), settings, input, apiKeyPresent:!!process.env.GEMINI_API_KEY})}}));
});`, {mode:0o700});
  try {
    const result = await queryGeminiCli([{role:'user',content:'Extract this event'}], 'gemini-3.8-flash', fake);
    const received = JSON.parse(result.content);
    expect(received.args).toContain('gemini-3.8-flash-low');
    expect(received.settings.permissions.deny).toContain('command(*)');
    expect(received.settings.permissions.deny).toContain('read_file(*)');
    expect(received.settings.permissions.deny).toContain('mcp(*)');
    expect(received.settings.modelProvider).toBe('');
    expect(received.apiKeyPresent).toBe(false);
    expect(received.input).toContain('Extract this event');
  } finally { rmSync(dir, {recursive:true,force:true}); }
});

test('failed CLI output never falls back to another provider', async () => {
  await expect(queryGeminiCli([], 'gemini-3.8-flash', '/usr/bin/false')).rejects.toThrow('Gemini CLI');
});
