import type { FullDatabaseBackupRestoreResult } from './supabaseRest';

export const DATABASE_RESTORE_EVENT = 'flbp:database-restore';
export type DatabaseRestoreStatus = { error?: string; canCancel?: boolean } | null;
export type DatabaseRestoreRequest = {
  restore: () => Promise<FullDatabaseBackupRestoreResult>;
  resolve: (receipt: FullDatabaseBackupRestoreResult) => void;
  reject: (error: Error) => void;
};

export const requestDatabaseRestore = (restore: DatabaseRestoreRequest['restore']) =>
  new Promise<FullDatabaseBackupRestoreResult>((resolve, reject) => {
    const event = new CustomEvent<DatabaseRestoreRequest>(DATABASE_RESTORE_EVENT, {
      cancelable: true, detail: { restore, resolve, reject },
    });
    // The mounted App owns all autosave queues. Never run a restore without it.
    if (window.dispatchEvent(event)) reject(new Error('Controllo salvataggi non disponibile. Riapri l’area Admin.'));
  });

/** A retry after a confirmed commit reads back only; uncertain RPCs reuse the caller's operation id. */
export const createDatabaseRestoreSession = <Snapshot,>(options: DatabaseRestoreRequest & {
  prepare: () => Promise<void>;
  hydrate: (receipt: FullDatabaseBackupRestoreResult) => Promise<Snapshot>;
  commit: (snapshot: Snapshot, receipt: FullDatabaseBackupRestoreResult) => Promise<void>;
  resume: (committed: boolean) => void;
  status: (status: DatabaseRestoreStatus) => void;
}) => {
  let prepared = false;
  let remoteAttempted = false;
  let uncertainAttempt = false;
  let receipt: FullDatabaseBackupRestoreResult | null = null;
  let running = false;
  let settled = false;
  let canCancel = false;
  let lastError = new Error('Ripristino annullato.');

  const retry = async () => {
    if (running || settled) return;
    running = true;
    canCancel = false;
    options.status({});
    try {
      if (!prepared) {
        await options.prepare();
        prepared = true;
      }
      if (!receipt) {
        remoteAttempted = true;
        receipt = await options.restore();
      }
      const snapshot = await options.hydrate(receipt);
      await options.commit(snapshot, receipt);
      options.resume(true);
      settled = true;
      options.status(null);
      options.resolve(receipt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // A timeout is not proof of rollback. Keep all writes paused until the
      // same idempotent operation returns a receipt and hydration succeeds.
      const definitelyRejected = (error as { restoreNotCommitted?: boolean })?.restoreNotCommitted === true;
      if (remoteAttempted && !receipt && !definitelyRejected) uncertainAttempt = true;
      canCancel = !receipt && !uncertainAttempt && (!remoteAttempted || definitelyRejected);
      options.status({ error: lastError.message, canCancel });
    } finally {
      running = false;
    }
  };
  const cancel = () => {
    if (running || settled || !canCancel) return;
    options.resume(false);
    settled = true;
    options.status(null);
    options.reject(lastError);
  };
  return { retry, cancel };
};
