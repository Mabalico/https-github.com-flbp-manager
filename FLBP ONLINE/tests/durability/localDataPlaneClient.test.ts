import {
  commitLocalWorkspace,
  getLocalAdminToken,
  pullLocalWorkspace,
  recoverLocalWorkspace,
  resolveDataPlane,
  setLocalAdminToken,
} from '../../services/dataPlaneClient';
import { shouldReadPublicWorkspaceFromLocal } from '../../services/supabasePublic';
import {
  canContinueVerifiedAdminOnLocalNode,
  hasRecentVerifiedAdminSession,
  rememberVerifiedAdminSession,
} from '../../services/localAdminContinuity';
import { RemoteRepository } from '../../services/repository/RemoteRepository';
import { pushWorkspaceState, setSupabaseSession } from '../../services/supabaseRest';
import { acknowledgeRefereeReport, enqueueRefereeReport, readPendingRefereeReports } from '../../services/repository/refereeReportOutbox';
import { acknowledgeRemoteDraftCache, discardRemoteDraftOperation, ensureRemoteDraftCacheDurable, readRemoteDraftCache, readRemoteDraftPointer, REMOTE_DRAFT_CACHE_LS_KEY, REMOTE_DRAFT_CACHE_V2_PREFIX, writeRemoteDraftCache } from '../../services/repository/remoteDraftCache';
import { setAdminLeaseInfo } from '../../services/adminWriteLeaseState';
import { readAdminLeaseInfo } from '../../services/adminWriteLeaseState';
import { initAdminWriteLease, releaseAdminWriteLease } from '../../services/adminWriteLease';
import { normalizeWorkspaceVersion } from '../../services/workspaceVersion';
import { coerceAppState, type AppState } from '../../services/storageService';
import { listDurableStateCheckpoints, readDurableStateCheckpoint } from '../../services/repository/durableStateJournal';

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
  rejectCheckpoint: ((entry: any) => boolean) | null = null;

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
            put: (entry: any) => run(() => {
              if (this.rejectCheckpoint?.(entry)) throw new Error('simulated IndexedDB quota exceeded');
              rows.set(entry.operationId, structuredClone(entry));
              return entry.operationId;
            }),
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
let simulatedLeaseHolder: string | null = null;
let simulatedLeaseTakeovers = 0;
let workspaceScenario: {
  pull: () => Promise<Response>;
  commit: (body: any) => Promise<Response>;
} | null = null;
const firstCommitEntered = new Promise<void>((resolve) => { signalFirstCommit = resolve; });
const firstCommitGate = new Promise<void>((resolve) => { releaseFirstCommit = resolve; });
const secondCommitCompleted = new Promise<void>((resolve) => { signalSecondCommit = resolve; });

Object.assign(globalThis, {
  localStorage: local,
  sessionStorage: session,
  indexedDB: memoryIndexedDb,
  __FLBP_NATIVE_WRITER_WINDOW_ID: 'native-test-window-0001',
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
  if (url.endsWith('/api/v1/admin/write-lease/acquire')) {
    const body = JSON.parse(String(init?.body || '{}'));
    const holder = String(body.holderId || '');
    if (!simulatedLeaseHolder || simulatedLeaseHolder === holder || body.takeover) {
      if (body.takeover && simulatedLeaseHolder && simulatedLeaseHolder !== holder) simulatedLeaseTakeovers += 1;
      simulatedLeaseHolder = holder;
      return Response.json({ acquired: true, holder_id: holder, holder_label: body.holderLabel || 'Test native', acquired_at: '2026-08-17T20:00:00.000Z' });
    }
    return Response.json({ acquired: false, holder_id: simulatedLeaseHolder, holder_label: 'Precedente reload', acquired_at: '2026-08-17T20:00:00.000Z' });
  }
  if (url.endsWith('/api/v1/admin/write-lease/heartbeat')) {
    const body = JSON.parse(String(init?.body || '{}'));
    return Response.json({ acquired: simulatedLeaseHolder === String(body.holderId || ''), holder_id: simulatedLeaseHolder });
  }
  if (url.endsWith('/api/v1/admin/write-lease/release')) {
    // Simula il keepalive della vecchia pagina perso durante un reload: la
    // lease precedente resta viva e la nuova pagina deve riconoscerla come
    // appartenente alla stessa finestra nativa.
    return Response.json({ released: false });
  }
  if (url.endsWith('/api/v1/admin/workspace/default') && String(init?.method || 'GET') === 'GET') {
    const headers = new Headers(init?.headers);
    if (headers.get('x-flbp-local-token') !== 'local-test-session') {
      return Response.json({ error: 'token missing' }, { status: 401 });
    }
    if (workspaceScenario) return workspaceScenario.pull();
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
    if (workspaceScenario) return workspaceScenario.commit(body);
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
  if (url.endsWith('/api/v1/admin/workspace/default/recover-local')) {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body || '{}'));
    if (headers.get('x-flbp-local-token') !== 'local-test-session'
      || headers.get('x-flbp-writer-id') !== 'test-writer'
      || body.baseVersion !== 4
      || body.confirmLocalRecovery !== true) {
      return Response.json({ error: 'unsafe local recovery request' }, { status: 400 });
    }
    return Response.json({
      ok: true,
      state: body.state,
      version: 5,
      previous_version: 4,
      operation_id: body.operationId,
      preserved_referee_match_ids: ['m-protected'],
      updated_at: '2026-08-01T12:00:01.000Z',
    });
  }
  return Response.json({ error: `unexpected ${url}` }, { status: 500 });
}) as typeof fetch;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

for (const invalidVersion of [null, undefined, '', '   ', false, true, -1, 1.5, Number.NaN]) {
  assert(
    normalizeWorkspaceVersion(invalidVersion) === null,
    `invalid workspace version ${String(invalidVersion)} must remain missing`,
  );
}
assert(normalizeWorkspaceVersion(0) === 0, 'workspace version zero must remain a valid explicit cursor');
assert(normalizeWorkspaceVersion(922) === 922, 'numeric workspace versions must be preserved');
assert(normalizeWorkspaceVersion('924') === 924, 'serialized integer workspace versions must be parsed');

const nullVersionDraft = writeRemoteDraftCache(
  { tournament: { id: 'null-version', name: 'Bozza senza cursore' } } as any,
  null,
  'null-version-draft-op',
  null,
);
assert(nullVersionDraft.baseVersion === null, 'a missing draft version must never be coerced to zero');
assert(readRemoteDraftPointer()?.baseVersion === null, 'the durable pointer must preserve a missing draft version');
assert(await ensureRemoteDraftCacheDurable(nullVersionDraft.operationId), 'the null-version regression draft must reach IndexedDB');
acknowledgeRemoteDraftCache(null, nullVersionDraft.operationId);
await discardRemoteDraftOperation(nullVersionDraft.operationId);

local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
  state: { tournament: { id: 'legacy-null-version', name: 'Bozza legacy senza cursore' } },
  savedAt: '2026-09-05T10:00:00.000Z',
  baseUpdatedAt: null,
  baseVersion: null,
  workspaceId: 'default',
  operationId: 'legacy-null-version-op',
}));
const legacyNullVersionDraft = readRemoteDraftCache();
assert(legacyNullVersionDraft?.baseVersion === null, 'a legacy missing version must never become zero while restoring');
assert(await ensureRemoteDraftCacheDurable('legacy-null-version-op'), 'the legacy regression draft must migrate to IndexedDB');
acknowledgeRemoteDraftCache(null, 'legacy-null-version-op');
await discardRemoteDraftOperation('legacy-null-version-op');

local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
  state: { tournament: { id: 'migration-ack', name: 'Migrazione confermata subito' } },
  savedAt: '2026-09-10T10:00:00.000Z',
  baseVersion: 4,
  workspaceId: 'default',
  operationId: 'migration-ack-op',
}));
assert(!!readRemoteDraftCache() && !!readRemoteDraftCache(), 'two reads must reproduce queued legacy migrations');
acknowledgeRemoteDraftCache('2026-09-10T10:01:00.000Z', 'migration-ack-op');
await ensureRemoteDraftCacheDurable('migration-ack-op');
await new Promise((resolve) => setTimeout(resolve, 0));
assert(!readRemoteDraftPointer(), 'a late legacy migration must not recreate an acknowledged pointer');
assert(local.getItem(REMOTE_DRAFT_CACHE_LS_KEY) === null, 'an acknowledged legacy draft must stay removed');
assert((await readDurableStateCheckpoint('migration-ack-op'))?.status === 'synced', 'acknowledgement must run after every queued legacy write');

local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
  state: { tournament: { id: 'migration-old', name: 'Vecchia migrazione' } },
  baseVersion: 4,
  workspaceId: 'default',
  operationId: 'migration-replaced-op',
}));
assert(!!readRemoteDraftCache(), 'the replaced legacy migration must start');
const replacementMigrationDraft = writeRemoteDraftCache(
  { tournament: { id: 'migration-new', name: 'Nuova bozza durante migrazione' } } as any,
  null,
  'migration-replacement-op',
  5,
);
local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
  state: { tournament: { id: 'other-legacy', name: 'Altra bozza legacy' } },
  baseVersion: 5,
  workspaceId: 'default',
  operationId: 'unrelated-legacy-during-migration',
}));
await ensureRemoteDraftCacheDurable('migration-replaced-op');
await ensureRemoteDraftCacheDurable(replacementMigrationDraft.operationId);
assert(readRemoteDraftPointer()?.operationId === replacementMigrationDraft.operationId, 'a late legacy migration must not replace a newer pointer');
assert(JSON.parse(local.getItem(REMOTE_DRAFT_CACHE_LS_KEY) || '{}').operationId === 'unrelated-legacy-during-migration', 'migration completion must not remove another legacy operation');
await discardRemoteDraftOperation('migration-replaced-op');
acknowledgeRemoteDraftCache(null, replacementMigrationDraft.operationId);
await discardRemoteDraftOperation(replacementMigrationDraft.operationId);
local.removeItem(REMOTE_DRAFT_CACHE_LS_KEY);

const route = await resolveDataPlane({ force: true });
assert(route.mode === 'local', 'same-origin discovery must select the local data plane');
assert(shouldReadPublicWorkspaceFromLocal(route), 'same-origin public views must read the local SQLite snapshot');
assert(
  !shouldReadPublicWorkspaceFromLocal({ ...route, publicReadMode: 'cloud' }),
  'remote public views must honor public_read_mode=cloud and use the Supabase live mirror',
);

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

const recovered = await recoverLocalWorkspace(route, {
  state: { tournament: { name: 'Bozza locale recuperata' } },
  publicState: { tournament: { name: 'Bozza locale recuperata' } },
  operationId: 'admin-local-recovery-1',
  baseVersion: 4,
  writerId: 'test-writer',
});
assert(recovered.version === 5, 'local recovery must create a new SQLite version');
assert(recovered.previous_version === 4, 'local recovery must report the protected pre-recovery version');
assert(recovered.preserved_referee_match_ids?.[0] === 'm-protected', 'local recovery must report preserved referee results');

const realSession = { accessToken: 'real-supabase-jwt', userId: 'verified-admin-user', email: 'admin@example.test' };
rememberVerifiedAdminSession(realSession);
assert(hasRecentVerifiedAdminSession(realSession), 'a previously verified real Supabase Admin session must be recognized');
assert(await canContinueVerifiedAdminOnLocalNode(realSession), 'verified Admin continuity must work only with the active local node');

assert(calls.some((entry) => entry.url.endsWith('/control/local-session')), 'local Admin session endpoint was not used');
assert(calls.some((entry) => entry.url.endsWith('/commit')), 'local Admin commit endpoint was not used');

setSupabaseSession({
  accessToken: 'verified-admin-token',
  refreshToken: 'verified-admin-refresh',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  userId: 'verified-admin-user',
  email: 'admin@example.test',
});
setAdminLeaseInfo({ status: 'active', holderId: 'test-writer' });

const commitsBeforeMissingVersion = calls.filter((entry) => entry.url.endsWith('/commit')).length;
let missingVersionRejected = false;
try {
  await pushWorkspaceState(
    { tournament: { id: 'missing-version', name: 'Non deve partire' } } as any,
    { operationId: 'missing-version-push', baseVersion: null },
  );
} catch (error: any) {
  missingVersionRejected = error?.code === 'FLBP_DB_CONFLICT';
}
assert(missingVersionRejected, 'a local full-state push without an explicit base version must fail closed');
assert(
  calls.filter((entry) => entry.url.endsWith('/commit')).length === commitsBeforeMissingVersion,
  'a missing base version must be rejected before the local commit request',
);

session.clear();
sessionStorage.setItem('flbp_active_view_v1', 'admin');
local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
  state: { tournament: { id: 'test-04', name: 'Torneo 04/09/2026' } },
  savedAt: '2026-09-05T10:05:00.000Z',
  baseUpdatedAt: '2026-09-05T10:00:00.000Z',
  baseVersion: 3,
  workspaceId: 'default',
  operationId: 'stale-restored-draft-op',
}));
const staleRepository = new RemoteRepository({} as any, { backgroundSync: false });
const staleState = staleRepository.load();
assert(staleState.tournament?.name === 'Torneo 04/09/2026', 'the stale draft must remain recoverable before a decision');
// Reproduce the React persistence echo that used to replace baseVersion 3
// with Number(null) === 0 before the first authoritative pull.
staleRepository.save(staleState);
assert(readRemoteDraftPointer()?.baseVersion === 3, 'React echo must preserve the recovered draft cursor');
const commitsBeforeStaleValidation = calls.filter((entry) => entry.url.endsWith('/commit')).length;
await staleRepository.flush();
assert(
  calls.filter((entry) => entry.url.endsWith('/commit')).length === commitsBeforeStaleValidation,
  'a stale restored draft must be compared with the DB and never auto-posted',
);
assert(readRemoteDraftPointer()?.operationId === 'stale-restored-draft-op', 'the blocked stale draft must remain exportable');
staleRepository.acknowledgeExternalCommit?.(
  { tournament: { name: 'Prima' } } as any,
  {
    updatedAt: '2026-08-01T11:59:00.000Z',
    version: 4,
    operationId: 'stale-restored-draft-op',
    discardPendingDraft: true,
  },
);
await discardRemoteDraftOperation('stale-restored-draft-op');
assert(!readRemoteDraftPointer(), 'using the authoritative DB version must remove the stale pointer');
assert(
  staleRepository.load().tournament?.name !== 'Torneo 04/09/2026',
  'authoritative hydration must remove the in-memory stale draft',
);

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
await repository.flush();

// These workspaces simulate version-checked local commits and deliberately
// delayed responses. Every request still goes through the real repository,
// durability journal and local data-plane client; no server is contacted.
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const waitForGate = async (promise: Promise<void>, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), 2_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
const conflictBaseState = () => coerceAppState({
  tournament: { id: 'conflict-tournament', name: 'Torneo regressione conflitto' },
});
const titleEntry = (id: string) => ({
  id,
  tournamentId: `manual-${id}`,
  tournamentName: 'Titolo aggiunto da Integrazioni',
  year: 2026,
  type: 'winner',
  teamName: 'Squadra locale',
  playerNames: ['Giocatore Uno', 'Giocatore Due'],
});
const withTitles = (state: AppState, ...ids: string[]) => coerceAppState({
  ...state,
  hallOfFame: [...state.hallOfFame, ...ids.map(titleEntry)],
});
const hasTitle = (state: AppState, id: string) => state.hallOfFame.some((entry) => entry.id === id);
const createWorkspaceScenario = (base: AppState) => {
  const mock = {
    state: structuredClone(base),
    version: 40,
    pulls: 0,
    commits: [] as any[],
    beforePullResponse: null as ((requestNumber: number) => Promise<void>) | null,
    beforeCommitResponse: null as ((body: any, requestNumber: number) => Promise<void>) | null,
    publish(state: AppState) {
      mock.state = structuredClone(state);
      mock.version += 1;
    },
  };
  workspaceScenario = {
    async pull() {
      const row = {
        workspace_id: 'default',
        state: structuredClone(mock.state),
        version: mock.version,
        updated_at: `2026-09-10T12:00:${mock.version}.000Z`,
      };
      mock.pulls += 1;
      await mock.beforePullResponse?.(mock.pulls);
      return Response.json(row, { headers: { etag: `"v${row.version}"` } });
    },
    async commit(body: any) {
      mock.commits.push(structuredClone(body));
      if (body.baseVersion !== mock.version) {
        return Response.json({ error: 'Versione superata', code: 'FLBP_DB_CONFLICT', currentVersion: mock.version }, { status: 409 });
      }
      await mock.beforeCommitResponse?.(body, mock.commits.length);
      mock.publish(coerceAppState(body.state));
      return Response.json({
        ok: true,
        workspace_id: 'default',
        version: mock.version,
        updated_at: `2026-09-10T12:00:${mock.version}.000Z`,
      });
    },
  };
  return mock;
};
const assertNoPendingScenarioDrafts = async (mock: ReturnType<typeof createWorkspaceScenario>, label: string) => {
  const operationIds = new Set(mock.commits.map((body) => body.operationId));
  // Acknowledgements are deliberately asynchronous, so wait for their queued
  // journal transactions before checking for drafts that could return on reload.
  await waitForGate((async () => {
    while ((await listDurableStateCheckpoints()).some((row) => operationIds.has(row.operationId) && row.status === 'pending')) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })(), `${label}: obsolete IndexedDB draft`);
};

{
  const base = conflictBaseState();
  const mock = createWorkspaceScenario(base);
  const mergingRepository = new RemoteRepository({} as any, { backgroundSync: false });
  let uiState = base;
  const unsubscribe = mergingRepository.subscribe((state) => { uiState = state; });
  await mergingRepository.refresh();
  mock.publish(coerceAppState({ ...base, logo: 'remote-logo-after-baseline' }));
  uiState = withTitles(uiState, 'manual-title');
  mergingRepository.save(uiState);
  const confirmed = await mergingRepository.flush();

  assert(mock.commits.length === 2, 'an independent HOF title must merge after one rejected stale commit');
  assert(!!confirmed && hasTitle(confirmed, 'manual-title') && confirmed.logo === 'remote-logo-after-baseline', 'durable confirmation must return the merged state that the caller should apply to React');
  assert(hasTitle(uiState, 'manual-title'), 'the merge emitted to React must contain the new local HOF title');
  assert(uiState.logo === 'remote-logo-after-baseline', 'the merge must publish the independent remote update to subscribers');
  assert(mock.commits[1].baseVersion === 41, 'the merged commit must use the version read after the 409');
  assert(mock.commits[0].operationId !== mock.commits[1].operationId, 'a merged payload must receive a fresh operation id');
  assert(!readRemoteDraftPointer() && !readRemoteDraftCache(), 'a successful merged commit must clear its recoverable draft');

  uiState = coerceAppState({ ...uiState, playerAliases: { 'nome precedente': 'Nome corretto' } });
  mergingRepository.save(uiState);
  await mergingRepository.flush();
  assert(mock.state.logo === 'remote-logo-after-baseline', 'the next React save must preserve the remote part of the merge');
  assert(hasTitle(mock.state, 'manual-title'), 'the next React save must preserve the manual HOF title');
  assert(mock.commits.length === 3 && mock.commits[2].baseVersion === 42, 'the next edit must use the confirmed merged version without another conflict');
  assert(!readRemoteDraftPointer() && !readRemoteDraftCache(), 'the follow-up save must leave no residual draft');
  await assertNoPendingScenarioDrafts(mock, 'merged HOF title');
  unsubscribe();
}

for (const responseKind of ['equivalent', 'mergeable'] as const) {
  const base = conflictBaseState();
  const firstEdit = withTitles(base, `${responseKind}-first-title`);
  const latestEdit = withTitles(firstEdit, `${responseKind}-newer-title`);
  const mock = createWorkspaceScenario(base);
  const conflictRepository = new RemoteRepository({} as any, { backgroundSync: false });
  const emittedStates: AppState[] = [];
  const unsubscribe = conflictRepository.subscribe((state) => { emittedStates.push(structuredClone(state)); });
  await conflictRepository.refresh();
  mock.publish(responseKind === 'equivalent'
    ? firstEdit
    : coerceAppState({ ...base, logo: 'remote-change-during-conflict' }));
  const pullEntered = deferred();
  const releasePull = deferred();
  mock.beforePullResponse = async (requestNumber) => {
    if (requestNumber === 2) {
      pullEntered.resolve();
      await releasePull.promise;
    }
  };
  conflictRepository.save(firstEdit);
  const flush = conflictRepository.flush();
  await waitForGate(pullEntered.promise, `${responseKind} conflict pull`);
  const emissionCountBeforeNewEdit = emittedStates.length;
  conflictRepository.save(latestEdit);
  const latestOperationId = readRemoteDraftPointer()?.operationId;
  assert(!!latestOperationId, 'the newer edit must be durable while conflict resolution is waiting');
  releasePull.resolve();
  await flush;

  assert(hasTitle(mock.state, `${responseKind}-newer-title`), `a delayed ${responseKind} response must not erase the newer title`);
  assert(hasTitle(mock.state, `${responseKind}-first-title`), `a delayed ${responseKind} response must preserve the original title too`);
  if (responseKind === 'mergeable') {
    assert(mock.state.logo === 'remote-change-during-conflict', 'resolving a superseded merge must retain the independent remote change');
  }
  assert(
    emittedStates.slice(emissionCountBeforeNewEdit).every((state) => hasTitle(state, `${responseKind}-newer-title`)),
    `a delayed ${responseKind} response must never emit the obsolete draft over the newer React state`,
  );
  assert(!readRemoteDraftPointer() && !readRemoteDraftCache(), `the newer edit after a ${responseKind} response must finish saving`);
  await assertNoPendingScenarioDrafts(mock, `${responseKind} conflict with newer edit`);
  unsubscribe();
}

{
  const base = conflictBaseState();
  const mock = createWorkspaceScenario(base);
  const pollingRepository = new RemoteRepository({} as any, { backgroundSync: false });
  const emittedStates: AppState[] = [];
  const unsubscribe = pollingRepository.subscribe((state) => { emittedStates.push(structuredClone(state)); });
  await pollingRepository.refresh();
  mock.publish(coerceAppState({ ...base, logo: 'remote-logo-before-delayed-poll' }));
  const pullEntered = deferred();
  const releasePull = deferred();
  mock.beforePullResponse = async (requestNumber) => {
    if (requestNumber === 2) {
      pullEntered.resolve();
      await releasePull.promise;
    }
  };
  const poll = pollingRepository.refresh();
  await waitForGate(pullEntered.promise, 'background poll');
  const uiState = withTitles(base, 'title-during-poll');
  const emissionCountBeforeEdit = emittedStates.length;
  pollingRepository.save(uiState);
  releasePull.resolve();
  await poll;
  assert(emittedStates.length === emissionCountBeforeEdit, 'a poll started before save must not overwrite the UI after save');
  assert(readRemoteDraftPointer()?.baseVersion === 40, 'a delayed poll must not rebase a draft it did not observe');
  pollingRepository.save(withTitles(uiState, 'title-after-poll'));
  assert(readRemoteDraftPointer()?.baseVersion === 40, 'the next React save must retain the original comparison baseline');
  await pollingRepository.flush();

  assert(mock.state.logo === 'remote-logo-before-delayed-poll', 'a delayed poll must not turn the remote update into an apparent local deletion');
  assert(hasTitle(mock.state, 'title-during-poll') && hasTitle(mock.state, 'title-after-poll'), 'both edits around the delayed poll must survive conflict resolution');
  assert(!readRemoteDraftPointer() && !readRemoteDraftCache(), 'the draft created during a poll must be fully committed');
  await assertNoPendingScenarioDrafts(mock, 'draft during poll');
  unsubscribe();
}

{
  const base = conflictBaseState();
  const mock = createWorkspaceScenario(base);
  const mergingRepository = new RemoteRepository({} as any, { backgroundSync: false });
  let uiState = base;
  const emittedStates: AppState[] = [];
  const unsubscribe = mergingRepository.subscribe((state) => {
    uiState = state;
    emittedStates.push(structuredClone(state));
  });
  await mergingRepository.refresh();
  mock.publish(coerceAppState({ ...base, logo: 'remote-logo-during-merge-push' }));
  const mergePushEntered = deferred();
  const releaseMergePush = deferred();
  mock.beforeCommitResponse = async (_body, requestNumber) => {
    if (requestNumber === 2) {
      mergePushEntered.resolve();
      await releaseMergePush.promise;
    }
  };
  uiState = withTitles(uiState, 'title-before-merge-push');
  mergingRepository.save(uiState);
  const flush = mergingRepository.flush();
  await waitForGate(mergePushEntered.promise, 'merged commit');
  const mergedOperationId = mock.commits[1].operationId;
  const emissionCountBeforeNewEdit = emittedStates.length;
  assert(uiState.logo === 'remote-logo-during-merge-push', 'the reconciled state must reach React before its commit completes');
  uiState = withTitles(uiState, 'title-during-merge-push');
  mergingRepository.save(uiState);
  assert(readRemoteDraftPointer()?.operationId !== mergedOperationId, 'a new edit during the merged commit must own a separate operation id');
  releaseMergePush.resolve();
  await flush;

  assert(mock.commits.length === 3, 'a save during the merged commit must trigger one more commit');
  assert(mock.commits[2].baseVersion === 42, 'the edit during merge push must use the confirmed merged version');
  assert(mock.commits[2].operationId !== mergedOperationId, 'the follow-up commit must not reuse the merged payload operation id');
  assert(hasTitle(mock.state, 'title-before-merge-push') && hasTitle(mock.state, 'title-during-merge-push'), 'both titles must survive the merged commit response');
  assert(mock.state.logo === 'remote-logo-during-merge-push', 'the edit during merge push must preserve the remote change already shown in React');
  assert(
    emittedStates.slice(emissionCountBeforeNewEdit).every((state) => hasTitle(state, 'title-during-merge-push')),
    'the merged commit response must not emit an older state over an edit made while saving',
  );
  assert(!readRemoteDraftPointer() && !readRemoteDraftCache(), 'saving during merge push must leave no pending draft after flush');
  await assertNoPendingScenarioDrafts(mock, 'draft during merged push');
  unsubscribe();
}

{
  const base = conflictBaseState();
  const mock = createWorkspaceScenario(base);
  const patchRepository = new RemoteRepository({} as any, { backgroundSync: false });
  await patchRepository.refresh();
  const firstEdit = withTitles(base, 'title-before-independent-patch');
  patchRepository.save(firstEdit);
  mock.publish(coerceAppState({ ...base, logo: 'independently-confirmed-remote-change' }));
  patchRepository.acknowledgeExternalCommit(mock.state, {
    version: mock.version,
    updatedAt: '2026-09-10T12:00:41.000Z',
    operationId: 'independent-dedicated-patch',
  });
  patchRepository.save(withTitles(firstEdit, 'title-after-independent-patch'));
  assert(readRemoteDraftPointer()?.baseVersion === 40, 'a separate patch acknowledgement must not rebase the pending full-state draft');
  await patchRepository.flush();
  assert(mock.state.logo === 'independently-confirmed-remote-change', 'a save after an independent acknowledgement must preserve the confirmed remote change');
  assert(hasTitle(mock.state, 'title-before-independent-patch') && hasTitle(mock.state, 'title-after-independent-patch'), 'local titles around an independent patch must both survive reconciliation');
  assert(!readRemoteDraftPointer(), 'the local draft around an independent patch must finish saving');
  await assertNoPendingScenarioDrafts(mock, 'draft around independent patch');
}

{
  const base = conflictBaseState();
  const mock = createWorkspaceScenario(base);
  const quotaRepository = new RemoteRepository({} as any, { backgroundSync: false });
  await quotaRepository.refresh();
  mock.publish(coerceAppState({ ...base, logo: 'remote-logo-in-larger-merged-checkpoint' }));
  memoryIndexedDb.rejectCheckpoint = (entry) => entry.status === 'pending'
    && entry.state?.logo === 'remote-logo-in-larger-merged-checkpoint';
  quotaRepository.save(withTitles(base, 'title-before-checkpoint-quota'));
  const originalOperationId = readRemoteDraftPointer()?.operationId;
  await quotaRepository.flush();
  assert(mock.commits.length === 1, 'a merged checkpoint that could not reach IndexedDB must never be sent');
  assert(!!originalOperationId, 'the original edit must own a durable operation');
  const originalCheckpoint = await readDurableStateCheckpoint(originalOperationId!);
  assert(originalCheckpoint?.status === 'pending', 'a failed replacement checkpoint must not retire the recoverable original draft');
  assert(hasTitle(originalCheckpoint!.state, 'title-before-checkpoint-quota'), 'the original durable title must remain available after merge storage failure');
  assert(!!readRemoteDraftPointer(), 'a merge storage failure must remain visible as a pending draft');
  memoryIndexedDb.rejectCheckpoint = null;
  quotaRepository.acknowledgeExternalCommit(mock.state, {
    version: mock.version,
    updatedAt: '2026-09-10T12:00:41.000Z',
    discardPendingDraft: true,
  });
  await discardRemoteDraftOperation(originalOperationId!);
}
{
  // Reopening an older draft must still block automatic full-state replay.
  // The Admin can explicitly review a patch on the current DB inside the app.
  const base = coerceAppState({ ...conflictBaseState(), logo: 'current-db-logo' });
  const mock = createWorkspaceScenario(base);
  const staleDraft = withTitles(coerceAppState({ ...base, logo: 'stale-draft-logo' }), 'reviewed-title');
  local.setItem(REMOTE_DRAFT_CACHE_LS_KEY, JSON.stringify({
    state: staleDraft, savedAt: new Date().toISOString(), baseVersion: 39,
    baseUpdatedAt: '2026-09-10T12:00:39.000Z', workspaceId: 'default', operationId: 'reviewed-stale-draft',
  }));
  const reviewedRepository = new RemoteRepository({} as any, { backgroundSync: false });
  const loaded = reviewedRepository.load();
  await reviewedRepository.flush();
  assert(mock.commits.length === 0, 'an unreviewed old draft must remain blocked');
  const activeRoute = await resolveDataPlane({ force: true });
  const review = {
    baseState: base, baseVersion: 40, baseUpdatedAt: '2026-09-10T12:00:40.000Z',
    expectedDraftState: loaded, expectedDraftOperationId: 'reviewed-stale-draft',
    dataPlane: { mode: 'local' as const, epoch: activeRoute.epoch, baseUrl: activeRoute.baseUrl },
  };
  const selected = withTitles(base, 'reviewed-title');
  for (const invalid of [
    { ...review, dataPlane: { ...review.dataPlane, epoch: Number(activeRoute.epoch) + 1 } },
    { ...review, expectedDraftState: base },
    { ...review, expectedDraftOperationId: 'another-draft' },
  ]) {
    let rejected = false;
    try { await reviewedRepository.reconcileDraft(selected, invalid); } catch { rejected = true; }
    assert(rejected && mock.commits.length === 0, 'a changed route or draft must invalidate the review without a write');
    assert(readRemoteDraftPointer()?.operationId === 'reviewed-stale-draft', 'invalid review must preserve the original draft');
  }
  mock.publish(coerceAppState({ ...base, playerAliases: { 'remote-alias': 'remote-player' } }));
  const confirmed = await reviewedRepository.reconcileDraft(selected, review);
  if (!confirmed) throw new Error('the reviewed title must return its confirmed state');
  assert(hasTitle(confirmed, 'reviewed-title'), 'the reviewed title must be committed');
  assert(confirmed?.logo === 'current-db-logo', 'the unchecked stale logo must not overwrite the database');
  assert(confirmed?.playerAliases['remote-alias'] === 'remote-player', 'independent updates after the preview must survive CAS reconciliation');
  assert(mock.commits.length === 2 && mock.commits[0].baseVersion === 40 && mock.commits[1].baseVersion === 41,
    'reviewed recovery must use normal version-checked writes');
  assert(mock.commits.every(body => body.operationId !== 'reviewed-stale-draft'), 'review must own a fresh operation id');
  await assertNoPendingScenarioDrafts(mock, 'reviewed recovery');
  assert((await readDurableStateCheckpoint('reviewed-stale-draft'))?.status === 'discarded', 'the original draft is closed after the replacement is durable');
  assert(!readRemoteDraftPointer(), 'reviewed recovery must clear the conflict draft');
}

workspaceScenario = null;

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
assert(restored.tournament.name === indexedDbOnlyState.tournament.name, `an IndexedDB-only Admin draft must be restored and emitted after reload (received ${restored.tournament.name})`);
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

await initAdminWriteLease();
const firstNativeHolder = readAdminLeaseInfo().holderId;
assert(readAdminLeaseInfo().status === 'active', 'the native Admin window must acquire its first write lease');
assert(firstNativeHolder?.startsWith('native-test-window-0001:'), 'the native host id must scope the writer identity');
await releaseAdminWriteLease();
await initAdminWriteLease();
const reloadedNativeHolder = readAdminLeaseInfo().holderId;
assert(readAdminLeaseInfo().status === 'active', 'the same native window must reacquire after reload without waiting for TTL');
assert(reloadedNativeHolder?.startsWith('native-test-window-0001:'), 'reload must preserve the native writer scope');
assert(reloadedNativeHolder !== firstNativeHolder, 'a reloaded document must still receive a fresh operation nonce');
assert(simulatedLeaseTakeovers === 1, 'the new document must reclaim only the stale lease from the same native window');
await releaseAdminWriteLease();
console.log('PASS local Admin data plane client flow');
