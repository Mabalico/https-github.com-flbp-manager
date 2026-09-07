import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the scheduled launcher keeps Node hidden and kills it when the task closes', () => {
  const launcher = fs.readFileSync(path.join(serverRoot, 'Esegui FLBP Server in background.ps1'), 'utf8');
  assert.match(launcher, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(launcher, /AssignProcessToJobObject/);
  assert.match(launcher, /CreateNoWindow\s*=\s*\$true/);
  assert.match(launcher, /WindowStyle\s*=\s*\[System\.Diagnostics\.ProcessWindowStyle\]::Hidden/);
});

test('the scheduled task explicitly ignores duplicate instances', () => {
  const installer = fs.readFileSync(path.join(serverRoot, 'Installa avvio automatico.ps1'), 'utf8');
  assert.match(installer, /New-ScheduledTaskAction[\s\S]*-Execute\s+'powershell\.exe'/);
  assert.match(installer, /-WindowStyle Hidden/);
  assert.match(installer, /New-ScheduledTaskSettingsSet[\s\S]*-MultipleInstances\s+IgnoreNew/);
});
