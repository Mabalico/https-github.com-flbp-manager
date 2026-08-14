import {
  commitLocalWorkspace,
  getLocalAdminToken,
  pullLocalWorkspace,
  resolveDataPlane,
  setLocalAdminToken,
} from '../../services/dataPlaneClient';
import {
  canContinueVerifiedAdminOnLocalNode,
  hasRecentVerifiedAdminSession,
  rememberVerifiedAdminSession,
} from '../../services/localAdminContinuity';
import { RemoteRepository } from '../../services/repository/RemoteRepository';
import { setSupabaseSession } from '../../services/supabaseRest';
import { acknowledgeRefereeReport, enqueueRefereeReport, readPendingRefereeReports } from '../../services/repository/refereeReportOutbox';
import { acknowledgeRemoteDraftCache, ensureRemoteDraftCacheDurable, readRemoteDraftPointer, REMOTE_DRAFT_CACHE_V2_PREFIX, writeRemoteDraftCache } from '../../services/repository/remoteDraftCache';
import { setAdminLeaseInfo } from '../../services/adminWriteLeaseState';

class MemoryStorage {
  private values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota exceeded');
    this.values.set(key, String(value));
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

class MemoryIndexedDb {
  private stores = new Map<string, Map<string, any>>();
  private opened = false;

  open() {
    const request: any = {};
    queueMicrotask(() => {
      const firstOpen = !this.opened;
      this.opened = true;
      const database = {
        objectStoreNames: { contains: (name: string) => this.stores.has(name) },
        createObjectStore: (name: string) => {
          if (!this.stores.has(name)) this.stores.set(name, new Map());
          return { createIndex: () => ({}) };
        },
        transaction: (name: string) => {
          const tx: any = { oncomplete: null, onerror: null, onabort: null };
          const rows = this.stores.get(name) || new Map<string, any>();
          this.stores.set(name, rows);
          const run = (operation: () => any) => {
            const childRequest: any = {};
            queueMicrotask(() => {
              try {
                childRequest.result = operation();
                childRequest.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              } catch (error) {
                childRequest.error = error;
                childRequest.onerror?.();
                tx.onerror?.();
              }
            });
            return childRequest;
          };
          tx.objectStore = () => ({
            put: (entry: any) => run(() => { rows.set(entry.operationId, structuredClone(entry)); return entry.operationId; }),
            get: (operationId: string) => run(() => structuredClone(rows.get(operationId))),
            getAll: () => run(() => [...rows.values()].map((entry) => structuredClone(entry))),
            delete: (operationId: string) => run(() => rows.delete(operationId)),
          });
          return tx;
        },
        close: () => {},
      };
      request.result = database;
      if (firstOpen) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const memoryIndexedDb = new MemoryIndexedDb();
const calls: Array<{ url: string; init?: RequestInit }> = [];
let concurrentAdminSaves = false;
let rejectNextAdminSaveAsOperationCollision = false;
const concurrentCommitBodies: any[] = [];
let signalFirstCommit: (() => void) | null = null;
let releaseFirstCommit: (() => void) | null = null;
let signalSecondCommit: (() => void) | null = null;
const firstCommitEntered = new Promise<void>((resolve) => { signalFirstCommit = resolve; });
const firstCommitGate = new Promise<void>((resolve) => { releaseFirstCommit = resolve; });
const secondCommitCompleted = new Promise<void>((resolve) => { signalSecondCommit = resolve; });

Object.assign(globalThis, {
  localStorage: local,
  sessionStorage: session,
  indexedDB: memoryIndexedDb,
  window: {
    location: { origin: 'http://127.0.0.1:8787' },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  },
});

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.endsWith('/api/v1/discovery')) {
    return Response.json({ active: true, workspaceId: 'default', primaryEpoch: 9 });
  }
  if (url.endsWith('/control/local-session')) {
    return Response.json({ ok: true, token: 'local-test-session', expiresAt: '2026-08-02T00:00:00.000Z' });
  }
  if (url.endsWith('/api/v1/admin/workspace/default') && String(init?.method || 'GET') === 'GET') {
    const headers = new Headers(init?.headers);
    if (headers.get('x-flbp-local-token') !== 'local-test-session') {
      return Response.json({ error: 'token missing' }, { status: 401 });
    }
    return Response.json({ workspace_id: 'default', state: { tournament: { name: 'Prima' } }, version: 4 }, { headers: { etag: '"v4"' } });
  }
  if (url.endsWith('/api/v1/admin/workspace/default/commit')) {
    const headers = new Headers(init?.headers);
    if (headers.get('x-flbp-local-token') !== 'local-test-session') {
      return Response.json({ error: 'token missing' }, { status: 401 });
    }
    if (headers.get('x-flbp-writer-id') !== 'test-writer') {
      return Response.json({ error: 'writer missing' }, { status: 423 });
    }
    const body = JSON.parse(String(init?.body || '{}'));
    if (concurrentAdminSaves) {
      concurrentCommitBodies.push(body);
      if (rejectNextAdminSaveAsOperationCollision) {
        rejectNextAdminSaveAsOperationCollision = false;
        return Response.json({
          error: 'operationId già usato con un payload diverso.',
          code: 'FLBP_OPERATION_COLLISION',
        }, { status: 409 });
      }
      if (concurrentCommitBodies.length === 1) {
        signalFirstCommit?.();
        await firstCommitGate;
        return Response.json({ ok: true, workspace_id: 'default', version: 6, updated_at: '2026-08-01T12:01:00.000Z' });
      }
      signalSecondCommit?.();
      return Response.json({
        ok: true,
        workspace_id: 'default',
        version: Number(body.baseVersion || 0) + 1,
        updated_at: '2026-08-01T12:02:00.000Z',
      });
    }
    if (body.baseVersion !== 4 || body.operationId !== 'admin-local-op-1') {
      return Response.json({ error: 'bad version or operation id' }, { status: 400 });
    }
    return Response.json({ ok: true, workspace_id: 'default', version: 5, updated_at: '2026-08-01T12:00:00.000Z' });
  }
  return Response.json({ error: `unexpected ${url}` }, { status: 500 });
}) as typeof fetch;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const route = await resolveDataPlane({ force: true });
assert(route.mode === 'local', 'same-origin discovery must select the local data plane');

setLocalAdminToken('');
const pulled = await pullLocalWorkspace(route, true);
assert(pulled.version === 4, 'Admin must read the SQLite base version');
assert(getLocalAdminToken() === 'local-test-session', 'the server PC must bootstrap a temporary local Admin token');

const nextState = { tournament: { name: 'Gestito in Admin locale' } };
const committed = await commitLocalWorkspace(route, {
  state: nextState,
  publicState: nextState,
  operationId: 'admin-local-op-1',
  baseVersion: 4,
  writerId: 'test-writer',
});
assert(committed.version === 5, 'Admin commit must be accepted by the local node');

const realSession = { accessToken: 'real-supabase-jwt', userId: 'verified-admin-user', email: 'admin@example.test' };
rememberVerifiedAdminSession(realSession);
assert(hasRecentVerifiedAdminSession(realSession), 'a previously verified real Supabase Admin session must be recognized');
assert(await canContinueVerifiedAdminOnLocalNode(realSession), 'verified Admin continuity must work only with the active local node');

assert(calls.some((entry) => entry.url.endsWith('/control/local-session')), 'local Admin session endpoint was not used');
assert(calls.some((entry) => entry.url.endsWith('/commit')), 'local Admin commit endpoint was not used');

setSupabaseSession({
  accessToken: 'verified-admin-token',
  refreshToken: 'verified-admin-refresh',
  expiresAt: Date.now() + 60_000,
  userId: 'verified-admin-user',
  email: 'admin@example.test',
});
setAdminLeaseInfo({ status: 'active', holderId: 'test-writer' });
concurrentAdminSaves = true;
sessionStorage.setItem('flbp_active_view_v1', 'admin');
const repository = new RemoteRepository({} as any, { backgroundSync: false });
await repository.refresh();
const firstState = { tournament: { id: 't1', name: 'Prima modifica' } } as any;
const secondState = { tournament: { id: 't1', name: 'Seconda modifica, più recente' } } as any;
repository.save(firstState);
const firstFlush = repository.flush();
await firstCommitEntered;
repository.save(secondState);
releaseFirstCommit?.();
await firstFlush;
await Promise.race([
  secondCommitCompleted,
  new Promise((_, reject) => setTimeout(() => reject(new Error('second Admin commit timeout')), 2_000)),
]);
assert(concurrentCommitBodies.length === 2, 'a newer Admin edit must be flushed after the in-flight commit');
assert(concurrentCommitBodies[0].state.tournament.name === 'Prima modifica', 'the first commit payload changed unexpectedly');
assert(concurrentCommitBodies[1].state.tournament.name === 'Seconda modifica, più recente', 'the newer draft was lost after the first response');
assert(concurrentCommitBodies[0].operationId !== concurrentCommitBodies[1].operationId, 'consecutive state revisions must not reuse an in-flight operationId');
assert(concurrentCommitBodies[1].baseVersion === 6, 'the second commit must use the confirmed version of the first commit');

const externallyCommittedState = { tournament: { id: 't1', name: 'Referto confermato con patch dedicata' } } as any;
repository.acknowledgeExternalCommit?.(externallyCommittedState, {
  updatedAt: '2026-08-01T12:03:00.000Z',
  version: 8,
  operationId: 'match-result-op-1',
});

const unrelatedDraft = writeRemoteDraftCache(
  { tournament: { id: 't1', name: 'Modifica indipendente ancora da salvare' } } as any,
  '2026-08-01T12:03:00.000Z',
  'unrelated-full-draft-op',
  8,
);
repository.acknowledgeExternalCommit?.(externallyCommittedState, {
  updatedAt: '2026-08-01T12:03:01.000Z',
  version: 8,
  operationId: 'different-match-result-op',
});
assert(
  readRemoteDraftPointer()?.operationId === unrelatedDraft.operationId,
  'a match patch must not clear a durable draft owned by another operation',
);
acknowledgeRemoteDraftCache('2026-08-01T12:03:01.000Z', unrelatedDraft.operationId);

const commitsBeforeEquivalentSave = concurrentCommitBodies.length;
repository.save(externallyCommittedState);
await repository.flush();
assert(
  concurrentCommitBodies.length === commitsBeforeEquivalentSave,
  'a confirmed match patch must not trigger a redundant full-workspace snapshot',
);
const postPatchEdit = { tournament: { id: 't1', name: 'Modifica successiva al referto' } } as any;
repository.save(postPatchEdit);
await repository.flush();
assert(
  concurrentCommitBodies.at(-1)?.baseVersion === 8,
  `the next Admin edit must use the version confirmed by the match patch (${JSON.stringify(concurrentCommitBodies.at(-1))})`,
);

const commitsBeforeCollision = concurrentCommitBodies.length;
rejectNextAdminSaveAsOperationCollision = true;
const collisionRecoveryState = { tournament: { id: 't1', name: 'Retry con nuova operation id' } } as any;
repository.save(collisionRecoveryState);
await repository.flush();
await Promise.race([
  (async () => {
    while (concurrentCommitBodies.length < commitsBeforeCollision + 2) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('operation collision retry timeout')), 2_000)),
]);
const collidedBody = concurrentCommitBodies[commitsBeforeCollision];
const collisionRetryBody = concurrentCommitBodies[commitsBeforeCollision + 1];
assert(collidedBody.baseVersion === 9 && collisionRetryBody.baseVersion === 9, 'operation collision retry must preserve the confirmed base version');
assert(collidedBody.operationId !== collisionRetryBody.operationId, 'operation collision retry must mint a fresh idempotency key');
assert(JSON.stringify(collidedBody.state) === JSON.stringify(collisionRetryBody.state), 'operation collision retry must preserve the exact pending state');

session.clear();
const firstWindowDraft = writeRemoteDraftCache(firstState, '2026-08-01T12:02:00.000Z', 'window-a-operation', 7);
const firstWindowPointer = JSON.parse(local.getItem(`${REMOTE_DRAFT_CACHE_V2_PREFIX}:default:${firstWindowDraft.ownerId}`) || '{}');
assert(!('state' in firstWindowPointer), 'localStorage must contain only the emergency pointer, never the full Admin draft');
session.clear();
const secondWindowDraft = writeRemoteDraftCache(secondState, '2026-08-01T12:02:00.000Z', 'window-b-operation', 7);
assert(firstWindowDraft.ownerId !== secondWindowDraft.ownerId, 'different Admin windows must have different draft owners');
acknowledgeRemoteDraftCache('2026-08-01T12:03:00.000Z', secondWindowDraft.operationId);
assert(
  !!local.getItem(`${REMOTE_DRAFT_CACHE_V2_PREFIX}:default:${firstWindowDraft.ownerId}`),
  'confirming one Admin operation must not delete another window draft',
);

local.failWrites = true;
const indexedDbOnlyState = { tournament: { id: 't1', name: 'Bozza recuperata solo da IndexedDB' } } as any;
writeRemoteDraftCache(indexedDbOnlyState, '2026-08-01T11:59:00.000Z', 'indexeddb-only-admin-op');
assert(await ensureRemoteDraftCacheDurable('indexeddb-only-admin-op'), 'IndexedDB must durably commit the Admin draft when localStorage quota is exhausted');
setSupabaseSession(null);
let resolveRecovered: ((state: any) => void) | null = null;
const recoveredState = new Promise<any>((resolve) => { resolveRecovered = resolve; });
const recoveredRepository = new RemoteRepository({} as any, { realtime: false });
recoveredRepository.subscribe((state) => resolveRecovered?.(state));
const restored = await Promise.race([
  recoveredState,
  new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB draft recovery timeout')), 2_000)),
]);
assert(restored.tournament.name === indexedDbOnlyState.tournament.name, 'an IndexedDB-only Admin draft must be restored and emitted after reload');
assert(recoveredRepository.load().tournament.name === indexedDbOnlyState.tournament.name, 'load must not erase an in-memory draft restored from IndexedDB');
local.failWrites = false;
(globalThis as any).indexedDB = undefined;

const queuedReport = await enqueueRefereeReport({
  tournamentId: 't1',
  matchId: 'm1',
  matches: [{ id: 'm1', scoreA: 10, scoreB: 8 } as any],
  operationId: 'referee-durable-1',
});
assert(readPendingRefereeReports().some((entry) => entry.operationId === queuedReport.operationId), 'the referee report must be durable before any network call');
acknowledgeRefereeReport(queuedReport.operationId);
assert(!readPendingRefereeReports().some((entry) => entry.operationId === queuedReport.operationId), 'a confirmed referee report must leave the pending outbox');

local.failWrites = true;
let storageFailureWasBlocked = false;
try {
  await enqueueRefereeReport({
    tournamentId: 't1',
    matchId: 'm2',
    matches: [{ id: 'm2', scoreA: 7, scoreB: 5 } as any],
    operationId: 'referee-no-storage',
  });
} catch {
  storageFailureWasBlocked = true;
} finally {
  local.failWrites = false;
}
assert(storageFailureWasBlocked, 'a referee report must not be sent when no durable browser storage is available');
console.log('PASS local Admin data plane client flow');
