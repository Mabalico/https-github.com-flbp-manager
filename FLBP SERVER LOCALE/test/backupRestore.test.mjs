import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectBackupDatabase, restoreBackupDatabase } from '../src/backupRestore.mjs';
import { LocalStore } from '../src/store.mjs';

const stateAt = (name) => ({
  state: { tournament: { id: 't1', name, matches: [{ id: 'm1' }] }, tournamentMatches: [{ id: 'm1' }] },
  publicState: {},
});

test('secondary restore verifies integrity, preserves the old DB and blocks writes pending epoch confirmation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-restore-'));
  const sourceDir = path.join(root, 'source');
  const replicaDir = path.join(root, 'replica');
  const targetDir = path.join(root, 'target');
  let source = new LocalStore({ dataDir: sourceDir, workspaceId: 'default', filename: 'source.sqlite' });
  try {
    source.importCloudSnapshot({ ...stateAt('Cloud'), version: 1, operationId: 'cloud-v1' });
    source.setActive(true, 9);
    source.commitSnapshot({ ...stateAt('Ultimo referto'), operationId: 'local-v2', baseVersion: 1 });
    const backup = await source.createSecondaryBackup(replicaDir, 4);
    source.close();
    source = null;

    const oldTarget = new LocalStore({ dataDir: targetDir, workspaceId: 'default', filename: 'flbp-local.sqlite' });
    oldTarget.importCloudSnapshot({ ...stateAt('Vecchio target'), version: 1, operationId: 'old-v1' });
    oldTarget.close();

    const targetFile = path.join(targetDir, 'flbp-local.sqlite');
    const restored = restoreBackupDatabase({
      backupFile: backup.filename,
      targetFile,
      workspaceId: 'default',
      confirmation: 'RIPRISTINA',
    });
    assert.equal(restored.transition, 'restore-pending');
    assert.ok(restored.safetyDirectory);
    assert.ok(fs.existsSync(path.join(restored.safetyDirectory, 'flbp-local.sqlite')));

    const info = inspectBackupDatabase(targetFile, 'default');
    assert.equal(info.integrity, 'ok');
    assert.equal(info.version, 2);
    assert.equal(info.pendingOperations, 1);
    assert.equal(info.transition, 'restore-pending');

    const reopened = new LocalStore({ dataDir: targetDir, workspaceId: 'default', filename: 'flbp-local.sqlite' });
    assert.equal(reopened.getCurrent().state.tournament.name, 'Ultimo referto');
    assert.equal(reopened.getTransitionState(), 'restore-pending');
    reopened.close();
  } finally {
    if (source) source.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('restore rejects a corrupt source and leaves the current target untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-restore-bad-'));
  try {
    const targetDir = path.join(root, 'target');
    const target = new LocalStore({ dataDir: targetDir, workspaceId: 'default', filename: 'flbp-local.sqlite' });
    target.importCloudSnapshot({ ...stateAt('Da conservare'), version: 1, operationId: 'keep-v1' });
    target.close();
    const targetFile = path.join(targetDir, 'flbp-local.sqlite');
    const corrupt = path.join(root, 'corrupt.sqlite');
    fs.writeFileSync(corrupt, 'non è sqlite');

    assert.throws(() => restoreBackupDatabase({
      backupFile: corrupt,
      targetFile,
      workspaceId: 'default',
      confirmation: 'RIPRISTINA',
    }));
    const info = inspectBackupDatabase(targetFile, 'default');
    assert.equal(info.operationId, 'keep-v1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
