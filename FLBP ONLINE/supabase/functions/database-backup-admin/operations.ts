type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type BackupClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult> };

export class BackupOperationError extends Error {
  constructor(message: string, readonly status: number, readonly restoreNotCommitted = true) { super(message); }
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const runDatabaseBackupOperation = async (
  client: BackupClient,
  input: unknown,
  verifiedActorId: string,
): Promise<Record<string, unknown>> => {
  if (!object(input)) throw new BackupOperationError('Richiesta backup non valida.', 400);
  const action = String(input.action ?? '').trim().toLowerCase();
  if (action === 'capabilities') return { ok: true, transactionalRestore: 1 };
  const workspaceId = String(input.workspaceId ?? '').trim() || 'default';
  let name: string;
  let args: Record<string, unknown>;
  if (action === 'export') {
    name = 'flbp_export_application_database';
    args = { p_workspace_id: workspaceId };
  } else if (action === 'restore') {
    const backup = input.backup;
    if (!object(backup) || backup.exportType !== 'flbp_application_database_backup'
      || backup.schemaVersion !== 1 || !object(backup.tables) || backup.workspaceId !== workspaceId) {
      throw new BackupOperationError('File backup DB applicativo o workspace non valido.', 400);
    }
    // Older clients do not supply an ID. New clients keep it through auth retries.
    const operationId = String(input.operationId ?? '').trim() || crypto.randomUUID();
    if (operationId.length > 160) throw new BackupOperationError('Identificatore ripristino non valido.', 400);
    name = 'flbp_restore_application_database';
    args = {
      p_workspace_id: workspaceId, p_backup: backup, p_actor_id: verifiedActorId,
      p_operation_id: operationId, p_lease_holder: String(input.leaseHolder ?? '').trim() || null,
    };
  } else {
    throw new BackupOperationError('Azione backup non valida.', 400);
  }
  // One RPC is one PostgreSQL transaction. No REST delete/insert fallback.
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new BackupOperationError('Backup transazionale non disponibile: applicare la migrazione database 20260924000200 prima di riprovare.', 503);
    }
    const status = error.code === '42501' ? 403 : error.code === 'P0001' ? 409 : 500;
    // Only known transaction rejections permit resuming old writers. Connection
    // exceptions (08xxx) and 40003 explicitly have an unknown commit outcome.
    const code = error.code || '';
    const notCommitted = /^(22|23|28|42|44|0A|25)[0-9A-Z]{3}$/.test(code)
      || ['P0001', '40001', '40P01'].includes(code);
    throw new BackupOperationError(error.message, status, notCommitted);
  }
  if (!object(data) || (action === 'restore' && data.ok !== true)
    || (action === 'export' && data.exportType !== 'flbp_application_database_backup')) {
    throw new BackupOperationError('Risposta backup non valida dal database.', 500, false);
  }
  return action === 'export' ? { ok: true, backup: data } : data;
};
