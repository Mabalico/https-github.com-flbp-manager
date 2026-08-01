import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const REQUIRED_TABLES = ['metadata', 'current_workspace', 'snapshots', 'outbox'];

const scalar = (row) => row ? Object.values(row)[0] : null;

export const inspectBackupDatabase = (filename, expectedWorkspaceId = null) => {
  const resolved = path.resolve(filename);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Backup SQLite non trovato: ${resolved}`);
  }

  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const integrityRows = db.prepare('PRAGMA integrity_check').all();
    const integrity = integrityRows.map((row) => String(scalar(row) || ''));
    if (integrity.length !== 1 || integrity[0].toLowerCase() !== 'ok') {
      throw new Error(`Backup SQLite corrotto: ${integrity.join('; ') || 'integrity_check senza esito'}`);
    }

    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length) throw new Error(`Backup FLBP non valido: tabelle mancanti ${missing.join(', ')}.`);

    const current = db.prepare(`
      SELECT workspace_id, version, operation_id, checksum, updated_at, primary_epoch
      FROM current_workspace
      ORDER BY version DESC LIMIT 1
    `).get();
    if (!current) throw new Error('Backup FLBP non valido: snapshot corrente assente.');
    if (expectedWorkspaceId && String(current.workspace_id) !== String(expectedWorkspaceId)) {
      throw new Error(`Workspace del backup ${current.workspace_id} diverso da quello atteso ${expectedWorkspaceId}.`);
    }

    const pending = db.prepare('SELECT count(*) AS count FROM outbox WHERE workspace_id = ? AND synced_at IS NULL').get(current.workspace_id);
    const meta = db.prepare('SELECT key, value FROM metadata WHERE key IN (?, ?, ?)').all('active', 'node_id', 'transition_state');
    const metadata = Object.fromEntries(meta.map((row) => [row.key, row.value]));
    return {
      filename: resolved,
      workspaceId: String(current.workspace_id),
      version: Number(current.version),
      operationId: String(current.operation_id),
      checksum: String(current.checksum),
      updatedAt: String(current.updated_at),
      primaryEpoch: current.primary_epoch == null ? null : Number(current.primary_epoch),
      pendingOperations: Number(pending?.count || 0),
      active: metadata.active === '1',
      nodeId: metadata.node_id || null,
      transition: metadata.transition_state || 'idle',
      integrity: 'ok',
    };
  } finally {
    db.close();
  }
};

const flushFile = (filename) => {
  // Su Windows fsync su un handle aperto in sola lettura restituisce EPERM.
  const handle = fs.openSync(filename, 'r+');
  try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
};

const markRestoredCopy = (filename, backupFile) => {
  const db = new DatabaseSync(filename);
  try {
    const active = scalar(db.prepare("SELECT value FROM metadata WHERE key='active'").get()) === '1';
    const setMeta = db.prepare(`
      INSERT INTO metadata(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
      setMeta.run('transition_state', active ? 'restore-pending' : 'idle');
      setMeta.run('restored_at', new Date().toISOString());
      setMeta.run('restored_from', path.basename(backupFile));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
};

export const restoreBackupDatabase = ({
  backupFile,
  targetFile,
  workspaceId = null,
  confirmation,
}) => {
  if (confirmation !== 'RIPRISTINA') {
    throw new Error('Ripristino annullato: conferma esatta RIPRISTINA richiesta.');
  }
  const source = path.resolve(backupFile);
  const target = path.resolve(targetFile);
  if (source === target) throw new Error('Il backup sorgente e il database di destinazione coincidono.');
  const sourceInfo = inspectBackupDatabase(source, workspaceId);
  const targetDir = path.dirname(target);
  fs.mkdirSync(targetDir, { recursive: true });

  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const partial = path.join(targetDir, `.${path.basename(target)}.restore-${suffix}.partial`);
  fs.copyFileSync(source, partial, fs.constants.COPYFILE_EXCL);
  flushFile(partial);
  markRestoredCopy(partial, source);
  flushFile(partial);
  const restoredInfo = inspectBackupDatabase(partial, workspaceId);

  const existingFiles = [target, `${target}-wal`, `${target}-shm`].filter((candidate) => fs.existsSync(candidate));
  const safetyDir = existingFiles.length
    ? path.join(targetDir, `pre-restore-${suffix}`)
    : null;
  const moved = [];
  let installed = false;
  try {
    if (safetyDir) fs.mkdirSync(safetyDir);
    for (const existing of existingFiles) {
      const destination = path.join(safetyDir, path.basename(existing));
      fs.renameSync(existing, destination);
      moved.push({ existing, destination });
    }
    fs.renameSync(partial, target);
    installed = true;
  } catch (error) {
    if (!installed) {
      for (const item of moved.reverse()) {
        if (!fs.existsSync(item.existing) && fs.existsSync(item.destination)) {
          fs.renameSync(item.destination, item.existing);
        }
      }
    }
    try { fs.rmSync(partial, { force: true }); } catch { /* best effort */ }
    throw error;
  }

  return {
    restored: true,
    source: sourceInfo,
    target,
    safetyDirectory: safetyDir,
    transition: restoredInfo.active ? 'restore-pending' : 'idle',
  };
};

export const latestBackupFile = (directory) => {
  const resolved = path.resolve(directory || '.');
  if (!directory || !fs.existsSync(resolved)) return null;
  return fs.readdirSync(resolved)
    .filter((name) => /^flbp-local-v\d+-.+\.sqlite$/.test(name))
    .map((name) => ({ filename: path.join(resolved, name), modified: fs.statSync(path.join(resolved, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)[0]?.filename || null;
};
