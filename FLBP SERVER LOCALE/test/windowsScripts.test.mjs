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

test('the Windows shell opens local popups in a dedicated fullscreen-capable projection window', () => {
  const shell = fs.readFileSync(
    path.join(serverRoot, 'windows-app', 'src', 'FLBPManagerLocale.cs'),
    'utf8',
  );

  assert.match(shell, /internal sealed class ProjectionForm\s*:\s*Form/);
  assert.match(shell, /args\.NewWindow\s*=\s*projection\.WebView/);
  assert.match(shell, /RegisterHotKey\(/);
  assert.match(shell, /WindowsMessageHotKey/);
  assert.match(shell, /VirtualKeyF11/);
  assert.match(shell, /FormBorderStyle\s*=\s*FormBorderStyle\.None/);
  assert.match(shell, /Bounds\s*=\s*targetScreen\.Bounds/);
  assert.match(shell, /__FLBP_NATIVE_PROJECTION_WINDOW/);
});

test('the Windows shell permits only one Admin host process per PC', () => {
  const shell = fs.readFileSync(
    path.join(serverRoot, 'windows-app', 'src', 'FLBPManagerLocale.cs'),
    'utf8',
  );

  assert.match(shell, /SingleInstanceMutexName/);
  assert.match(shell, /new System\.Threading\.Mutex\(true, SingleInstanceMutexName/);
  assert.match(shell, /if \(!ownsSingleInstance\)[\s\S]{0,160}ActivateExistingInstance\(\)/);
  assert.match(shell, /browser\.Dispose\(\)/);
});
