/** Run with `bun scripts/configure-local-ai-capture.ts --apply`; no restart or historical replay. */
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { createLocalCaptureProfile } from '../src/services/integrations/LocalCaptureProfile.js';
import { writeJsonFileAtomic } from '../src/shared/atomic-json.js';
import { loadTranscriptWatchConfig } from '../src/services/transcripts/config.js';

const root = join(homedir(), '.claude-mem');
const settingsPath = join(root, 'settings.json');
const watchPath = join(root, 'transcript-watch.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
const config = loadTranscriptWatchConfig(watchPath);
const example = JSON.parse(readFileSync(resolve(import.meta.dir, '../docs/transcript-watch.example.json'), 'utf8'));
const result = createLocalCaptureProfile(settings, config, example.schemas.codex);
// This opt-in starts at NOW. Old watcher checkpoints are not a reconstructed observer.
// A separate new state leaves original checkpoints intact and skips pre-opt-in history.
result.config.stateFile = join(root, 'live-terminal-capture-state.json');
if (!process.argv.includes('--apply')) {
  console.log('Dry run: enable all Codex sessions, keep provider settings, preserve unrelated watches.');
  console.log('Existing transcripts start at EOF in a new state file; no history backfill.');
  process.exit(0);
}
if (result.config.watches.some(w => w.startAtEnd !== true)) {
  throw new Error('Refusing a fresh state with historical replay enabled; review every watch startAtEnd first.');
}
const backup = join(root, 'backups', `local-ai-capture-${Date.now()}`);
mkdirSync(backup, { recursive: true });
for (const file of [settingsPath, watchPath]) {
  if (existsSync(file)) copyFileSync(file, join(backup, file.split('/').pop()!));
}
writeJsonFileAtomic(watchPath, result.config);
writeJsonFileAtomic(settingsPath, result.settings);
console.log(`Capture config saved. Original files backed up at ${backup}. Restart the local worker to activate.`);
