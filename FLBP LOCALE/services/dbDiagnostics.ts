/**
 * Best-effort diagnostics for DB sync.
 *
 * Stored in localStorage only (no UI regressions if missing).
 */

export type DbSyncKind = 'snapshot' | 'structured' | 'health' | 'migration' | 'auth';

export type DbSyncEventLevel = 'ok' | 'info' | 'warn' | 'error' | 'conflict';

export interface DbSyncEvent {
  at: string;
  kind: DbSyncKind;
  level: DbSyncEventLevel;
  message: string;
  meta?: Record<string, any>;
}

export interface DbSyncDiagnostics {
  lastSnapshotOkAt?: string;
  lastStructuredOkAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  lastStructuredSummary?: any;
  lastConflictAt?: string;
  lastConflictMessage?: string;
  lastRemoteUpdatedAt?: string;
  lastRemoteBaseUpdatedAt?: string;
  events?: DbSyncEvent[];
}

export const isAdminWriteOnlyDbIssue = (message?: string | null): boolean => {
  const lower = String(message || '').trim().toLowerCase();
  if (!lower) return false;
  const mentionsWorkspaceSnapshot = lower.includes('workspace_state') || lower.includes('sync snapshot');
  const mentionsAuthGate =
    lower.includes('row-level security') ||
    lower.includes('rls') ||
    lower.includes('non autorizzato') ||
    lower.includes('unauthorized') ||
    lower.includes('403') ||
    lower.includes('401') ||
    lower.includes('jwt') ||
    lower.includes('token');
  return mentionsWorkspaceSnapshot && mentionsAuthGate;
};

const LS_KEY = 'flbp_db_sync_diag_v1';

const pushEvent = (event: DbSyncEvent) => {
  const cur = readRaw();
  const next: DbSyncDiagnostics = { ...cur };
  const list = Array.isArray(cur.events) ? cur.events.slice() : [];
  list.push(event);
  // ring buffer
  next.events = list.slice(-60);
  writeRaw(next);
};

const readRaw = (): DbSyncDiagnostics => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as DbSyncDiagnostics;
  } catch {
    return {};
  }
};

const writeRaw = (next: DbSyncDiagnostics) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

export const readDbSyncDiagnostics = (): DbSyncDiagnostics => readRaw();

export const markDbSyncOk = (kind: DbSyncKind, summary?: any) => {
  const now = new Date().toISOString();
  const cur = readRaw();
  const next: DbSyncDiagnostics = { ...cur };

  if (kind === 'snapshot') {
    next.lastSnapshotOkAt = now;
  } else if (kind === 'structured') {
    next.lastStructuredOkAt = now;
    if (summary != null) next.lastStructuredSummary = summary;
  }
  // A successful sync/action should clear any stale "current issue" banner.
  delete next.lastErrorAt;
  delete next.lastErrorMessage;
  delete next.lastConflictAt;
  delete next.lastConflictMessage;
  writeRaw(next);
  pushEvent({ at: now, kind, level: 'ok', message: kind === 'structured' ? 'Sync strutturato OK' : kind === 'snapshot' ? 'Snapshot OK' : `${kind} OK`, meta: summary != null ? { summary } : undefined });
};

export const markDbSyncError = (message: string, kind: DbSyncKind = 'snapshot') => {
  const now = new Date().toISOString();
  const cur = readRaw();
  writeRaw({
    ...cur,
    lastErrorAt: now,
    lastErrorMessage: String(message || 'Errore sconosciuto')
  });
  pushEvent({ at: now, kind, level: 'error', message: String(message || 'Errore sconosciuto') });
};

export const markDbSyncConflict = (message: string, meta?: { remoteUpdatedAt?: string | null; remoteBaseUpdatedAt?: string | null }) => {
  const now = new Date().toISOString();
  const cur = readRaw();
  writeRaw({
    ...cur,
    lastConflictAt: now,
    lastConflictMessage: String(message || 'Conflitto rilevato'),
    lastRemoteUpdatedAt: meta?.remoteUpdatedAt || cur.lastRemoteUpdatedAt,
    lastRemoteBaseUpdatedAt: meta?.remoteBaseUpdatedAt || cur.lastRemoteBaseUpdatedAt
  });

  pushEvent({
    at: now,
    kind: 'structured',
    level: 'conflict',
    message: String(message || 'Conflitto rilevato'),
    meta: { remoteUpdatedAt: meta?.remoteUpdatedAt ?? null, remoteBaseUpdatedAt: meta?.remoteBaseUpdatedAt ?? null }
  });
};

export const clearDbSyncHistory = () => {
  const cur = readRaw();
  writeRaw({ ...cur, events: [] });
};

export const clearDbSyncCurrentIssue = () => {
  const cur = readRaw();
  const next: DbSyncDiagnostics = { ...cur };
  delete next.lastErrorAt;
  delete next.lastErrorMessage;
  delete next.lastConflictAt;
  delete next.lastConflictMessage;
  writeRaw(next);
};

export const markDbHealth = (ok: boolean, meta?: any) => {
  const now = new Date().toISOString();
  pushEvent({ at: now, kind: 'health', level: ok ? 'ok' : 'warn', message: ok ? 'Health check OK' : 'Health check con warning/error', meta });
};

export const markDbMigration = (ok: boolean, meta?: any) => {
  const now = new Date().toISOString();
  pushEvent({ at: now, kind: 'migration', level: ok ? 'ok' : 'error', message: ok ? 'Migrazione Locale→DB OK' : 'Migrazione Locale→DB fallita', meta });
};

export const markRemoteVersions = (meta: { remoteUpdatedAt?: string | null; remoteBaseUpdatedAt?: string | null }) => {
  const cur = readRaw();
  writeRaw({
    ...cur,
    lastRemoteUpdatedAt: meta.remoteUpdatedAt ?? cur.lastRemoteUpdatedAt,
    lastRemoteBaseUpdatedAt: meta.remoteBaseUpdatedAt ?? cur.lastRemoteBaseUpdatedAt
  });
};
