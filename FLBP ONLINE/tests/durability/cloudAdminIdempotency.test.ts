import { ensureFreshPlayerSupabaseSession, ensureFreshSupabaseSession, getPlayerSupabaseSession, getSupabaseSession, isSupabaseAdminSessionExpired, playerSignOutSupabase, setPlayerSupabaseSession, signOutCurrentSupabaseSessions, signOutSupabase, getSupabaseConfig, pushWorkspaceState, recoverWorkspaceFromLocalState, setRemoteBaseUpdatedAt, setSupabaseSession } from '../../services/supabaseRest';
import { isAdminWriteBlockedByLease, readAdminLeaseInfo, setAdminLeaseInfo } from '../../services/adminWriteLeaseState';
import { initAdminWriteLease, reclaimCloudAcceptingMissingOperations, releaseAdminWriteLease, takeoverAdminWriteLease } from '../../services/adminWriteLease';
import { flushAutoStructuredSync, replacePendingAutoStructuredSync, scheduleAutoStructuredSync } from '../../services/autoDbSync';
import { readDbSyncDiagnostics } from '../../services/dbDiagnostics';
import { RemoteRepository } from '../../services/repository/RemoteRepository';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const calls: Array<{ url: string; body: any; authorization: string | null; method?: string }> = [];
let refreshReply: Response | Promise<Response> | null = null;
let rejectLeaseToken: string | null = null;
let requireLegacyFallback = false;
let workspaceStateRow: any = null;
// Enabled only by the structured-autosync section: normalized/public rows accept writes.
let allowProjectionWrites = false;
let rejectPublicProjection = false;
let rejectWorkspaceConflict = false;
// Data-plane reclaim section: coordinator route and scripted reclaim answers.
let resolvedRoute: any = { mode: 'cloud', epoch: 4 };
let resolveFails = false;
// Number of next discovery calls that fail before the coordinator answers again.
let resolveFailures = 0;
let reclaimReplies: any[] = [];

Object.assign(globalThis, {
  localStorage: local,
  sessionStorage: session,
  document: {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  window: {
    location: { origin: 'https://flbp-pages.pages.dev' },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: () => {},
    dispatchEvent: () => true,
  },
});

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const authorization = new Headers(init?.headers).get('Authorization');
  calls.push({ url, body, authorization, method: init?.method });
  if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
    const reply = refreshReply;
    refreshReply = null;
    return reply || Response.json({ error: 'Unexpected refresh' }, { status: 500 });
  }
  if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
  if (url.endsWith('/api/v1/discovery')) return Response.json({ error: 'not local' }, { status: 404 });
  if (url.endsWith('/rpc/flbp_resolve_data_plane')) {
    if (resolveFailures > 0) {
      resolveFailures -= 1;
      return Response.json({ message: 'coordinator slow' }, { status: 503 });
    }
    if (resolveFails) return Response.json({ message: 'coordinator unreachable' }, { status: 503 });
    return Response.json(resolvedRoute);
  }
  if (url.endsWith('/rpc/flbp_admin_reclaim_cloud_data_plane')) {
    const reply = reclaimReplies.shift() || { ok: false, reason: 'unexpected' };
    if (reply.ok && reply.mode === 'cloud') resolvedRoute = { mode: 'cloud', epoch: reply.epoch };
    return Response.json(reply);
  }
  if (url.endsWith('/rpc/flbp_admin_acquire_write_lease')) {
    if (rejectLeaseToken && authorization === rejectLeaseToken) {
      return Response.json({ code: 'PGRST303', message: 'JWT expired' }, { status: 401 });
    }
    return Response.json({ acquired: true, holder_id: body?.p_holder_id, holder_label: body?.p_holder_label });
  }
  if (url.endsWith('/rpc/flbp_admin_release_write_lease')) return Response.json({ released: true });
  if (url.includes('/rest/v1/workspace_state?')) return Response.json(workspaceStateRow ? [workspaceStateRow] : []);
  if (url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')) {
    if (rejectWorkspaceConflict) {
      return Response.json({ code: 'P0001', message: 'FLBP_DB_CONFLICT: stale snapshot' }, { status: 400 });
    }
    if (requireLegacyFallback) {
      return Response.json({ code: 'PGRST202', message: 'Could not find the function flbp_admin_push_workspace_state_v2' }, { status: 404 });
    }
    const isRecovery = body?.p_operation_id === 'cloud-recovery-op-43';
    return Response.json({
      ok: true,
      updated_at: isRecovery ? '2026-08-01T15:03:00.000Z' : '2026-08-01T15:00:00.000Z',
      version: isRecovery ? 43 : 42,
      operation_id: body.p_operation_id,
      idempotent: false,
    });
  }
  if (url.endsWith('/rpc/flbp_admin_push_workspace_state')) {
    return Response.json({ ok: true, updated_at: '2026-08-01T15:01:00.000Z' });
  }
  if (rejectPublicProjection && url.includes('/rest/v1/public_tournaments?') && init?.method === 'POST') {
    return Response.json({ message: 'fixture public projection write failed' }, { status: 503 });
  }
  if (allowProjectionWrites && url.includes('/rest/v1/')) return Response.json([]);
  return Response.json({ error: `unexpected ${url}` }, { status: 500 });
}) as typeof fetch;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const config = getSupabaseConfig();
assert(config?.url === 'https://durability-test.invalid'
  && config.anonKey === 'synthetic-durability-anon-key'
  && config.workspaceId === 'default', 'the cloud durability fixture must be configured independently of private environment values');

setSupabaseSession({
  accessToken: 'verified-cloud-admin-token',
  refreshToken: 'verified-cloud-refresh-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  userId: 'admin-cloud-test',
  email: 'admin@example.test',
});

const nativeWebSocket = globalThis.WebSocket;
let socketOpens = 0;
let socketCloses = 0;
class FixtureWebSocket {
  readyState = 0;
  constructor() { socketOpens += 1; }
  close() {
    this.readyState = 3;
    socketCloses += 1;
  }
}
globalThis.WebSocket = FixtureWebSocket as unknown as typeof WebSocket;
const realtimeRepository = new RemoteRepository({} as any);
assert(socketOpens === 0, 'a persisted Admin session must not open Realtime on a public, referee or TV route');
realtimeRepository.setAdminRealtimeActive(true);
assert(socketOpens === 1, 'entering Admin with a session must open one Realtime socket');
realtimeRepository.setAdminRealtimeActive(true);
assert(socketOpens === 1, 're-rendering Admin must retain the current subscription');
realtimeRepository.setAdminRealtimeActive(false);
assert(socketCloses === 1, 'leaving Admin must disconnect Realtime');
const adminSession = getSupabaseSession();
setSupabaseSession(null);
realtimeRepository.setAdminRealtimeActive(true);
assert(socketOpens === 1, 'the Admin login page must not open Realtime before authentication');
setSupabaseSession(adminSession);
globalThis.WebSocket = nativeWebSocket;

const state = { tournament: { id: 't1', name: 'Cloud idempotente' } } as any;
const pushed = await pushWorkspaceState(state, {
  operationId: 'cloud-admin-op-42',
  baseUpdatedAt: '2026-08-01T14:59:00.000Z',
});
assert(pushed.version === 42, 'the v2 cloud RPC version must reach the repository');
const v2Call = calls.find((call) => call.url.endsWith('/rpc/flbp_admin_push_workspace_state_v2'));
assert(v2Call?.body.p_operation_id === 'cloud-admin-op-42', 'the durable operationId must reach the v2 cloud RPC');
assert(v2Call?.body.p_base_updated_at === '2026-08-01T14:59:00.000Z', 'an IndexedDB-restored base timestamp must be sent explicitly');
assert('p_lease_holder' in v2Call.body && v2Call.body.p_lease_holder === null, 'the v2 RPC must receive a deterministic lease-holder argument');

requireLegacyFallback = true;
await pushWorkspaceState({ tournament: { id: 't1', name: 'Rollout compatibile' } } as any, {
  operationId: 'cloud-admin-legacy-rollout',
  baseUpdatedAt: '2026-08-01T15:00:00.000Z',
});
assert(calls.some((call) => call.url.endsWith('/rpc/flbp_admin_push_workspace_state')), 'a bundle deployed before the migration must fall back to the legacy RPC');

requireLegacyFallback = false;
setAdminLeaseInfo({ status: 'active', holderId: 'cloud-recovery-writer' });

const authoritativeReport = {
  id: 'm-report',
  teamAId: 'team-a',
  teamBId: 'team-b',
  status: 'finished',
  played: true,
  scoreA: 10,
  scoreB: 6,
  refereeReportFinalId: 'report-cloud-newer',
  refereeReportSavedAt: '2026-08-01T15:02:00.000Z',
};
const staleLocalReport = {
  ...authoritativeReport,
  scoreA: 8,
  scoreB: 5,
  refereeReportFinalId: 'report-local-older',
  refereeReportSavedAt: '2026-08-01T14:58:00.000Z',
};
const cloudPreviewUpdatedAt = '2026-08-01T15:02:00.000Z';
const cloudPreviewVersion = 42;
workspaceStateRow = {
  workspace_id: 'default',
  updated_at: cloudPreviewUpdatedAt,
  version: cloudPreviewVersion,
  state: {
    tournament: { id: 't1', name: 'Versione Supabase' },
    matches: [authoritativeReport],
    tournamentMatches: [authoritativeReport],
  },
};

const localRecoveryState = {
  tournament: { id: 't1', name: 'Bozza locale scelta' },
  matches: [staleLocalReport],
  tournamentMatches: [staleLocalReport],
} as any;
const recovered = await recoverWorkspaceFromLocalState(localRecoveryState, {
  operationId: 'cloud-recovery-op-43',
  expectedRemoteUpdatedAt: cloudPreviewUpdatedAt,
  expectedRemoteVersion: cloudPreviewVersion,
  requiredDataPlane: 'cloud',
});
const recoveryCall = calls.find((call) => (
  call.url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')
  && call.body?.p_operation_id === 'cloud-recovery-op-43'
));
assert(!!recoveryCall, 'cloud recovery must use the versioned Admin snapshot RPC');
assert(recoveryCall?.body.p_force === false, 'cloud recovery must keep compare-and-swap enabled');
assert(recoveryCall?.body.p_base_updated_at === cloudPreviewUpdatedAt, 'cloud recovery must use the freshly read Supabase timestamp as its base');
assert(recoveryCall?.body.p_lease_holder === 'cloud-recovery-writer', 'cloud recovery must keep the active Admin write lease');
assert(recoveryCall?.body.p_state.tournamentMatches[0].refereeReportFinalId === 'report-cloud-newer', 'cloud recovery must preserve a newer authoritative referee report');
assert(recovered.version === 43 && recovered.previous_version === cloudPreviewVersion, 'cloud recovery must report the new and previous Supabase versions');
assert(recovered.operation_id === 'cloud-recovery-op-43', 'cloud recovery must retain its explicit idempotency key');
assert(recovered.preserved_referee_match_ids?.[0] === 'm-report', 'cloud recovery must report every preserved referee match');

const countSnapshotWriteCalls = () => calls.filter((call) => (
  call.url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')
  || call.url.endsWith('/rpc/flbp_admin_push_workspace_state')
)).length;
const writesBeforeStalePreview = countSnapshotWriteCalls();
workspaceStateRow = {
  ...workspaceStateRow,
  updated_at: '2026-08-01T15:04:00.000Z',
  version: 44,
};
let stalePreviewError: any = null;
try {
  await recoverWorkspaceFromLocalState(localRecoveryState, {
    operationId: 'cloud-recovery-stale-preview',
    expectedRemoteUpdatedAt: cloudPreviewUpdatedAt,
    expectedRemoteVersion: cloudPreviewVersion,
    requiredDataPlane: 'cloud',
  });
} catch (error) {
  stalePreviewError = error;
}
assert(stalePreviewError?.code === 'FLBP_DB_CONFLICT', 'a changed Supabase timestamp must invalidate the confirmed preview');
assert(stalePreviewError?.remoteUpdatedAt === '2026-08-01T15:04:00.000Z', 'the stale-preview conflict must expose the current Supabase timestamp');
assert(countSnapshotWriteCalls() === writesBeforeStalePreview, 'a stale preview must stop before any additional snapshot write RPC');

workspaceStateRow = {
  ...workspaceStateRow,
  updated_at: cloudPreviewUpdatedAt,
  version: 45,
};
let staleVersionError: any = null;
try {
  await recoverWorkspaceFromLocalState(localRecoveryState, {
    operationId: 'cloud-recovery-stale-version',
    expectedRemoteUpdatedAt: cloudPreviewUpdatedAt,
    expectedRemoteVersion: cloudPreviewVersion,
    requiredDataPlane: 'cloud',
  });
} catch (error) {
  staleVersionError = error;
}
assert(staleVersionError?.code === 'FLBP_DB_CONFLICT', 'a changed Supabase version must invalidate the confirmed preview even if its timestamp matches');
assert(countSnapshotWriteCalls() === writesBeforeStalePreview, 'a stale version must also stop before any additional snapshot write RPC');

// B3 #1 (audit 16/11/2026): the structured autosync must never republish a
// queued state over newer commits. `force` only skips the 20 s throttle.
allowProjectionWrites = true;
local.setItem('flbp_auto_structured_sync', '1');
const autosyncTimers: Array<{ id: number; callback: () => void; delay: number; cleared: boolean }> = [];
Object.assign((globalThis as any).window, {
  setTimeout: (callback: () => void, delay?: number) => {
    const timer = { id: autosyncTimers.length + 1, callback, delay: Number(delay) || 0, cleared: false };
    autosyncTimers.push(timer);
    return timer.id;
  },
  clearTimeout: (id: number) => {
    const timer = autosyncTimers.find((entry) => entry.id === id);
    if (timer) timer.cleared = true;
  },
});
const settle = () => new Promise((resolve) => globalThis.setTimeout(resolve, 20));
const autosyncState = (label: string) => ({ tournament: { id: 't1', name: `Autosync ${label}` }, tournamentMatches: [] } as any);
const autosyncPushes = () => calls.filter((call) => (
  call.url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')
  && String(call.body?.p_state?.tournament?.name || '').startsWith('Autosync ')
));
const pushedNames = () => autosyncPushes().map((call) => call.body.p_state.tournament.name);

setRemoteBaseUpdatedAt('2026-08-01T15:00:00.000Z');
await flushAutoStructuredSync(autosyncState('first'), { force: true });
assert(autosyncPushes().length === 1, 'an explicit structured flush must reach the snapshot RPC');
assert(autosyncPushes()[0].body.p_force === false, 'a forced autosync must keep the updated_at compare-and-swap (p_force=false)');
assert(autosyncPushes()[0].body.p_base_updated_at === '2026-08-01T15:00:00.000Z', 'the autosync push must send the current base cursor');

// Second edit inside the 20 s throttle: it must not stay parked until an unrelated event.
scheduleAutoStructuredSync(autosyncState('throttled'));
const debounce = autosyncTimers.filter((timer) => !timer.cleared).at(-1);
assert(debounce?.delay === 1500, 'a scheduled edit starts the debounce timer');
debounce!.cleared = true;
debounce!.callback();
await settle();
assert(autosyncPushes().length === 1, 'the throttled edit is not pushed before the interval');
const rearmed = autosyncTimers.filter((timer) => !timer.cleared).at(-1);
assert(!!rearmed && rearmed !== debounce && rearmed.delay > 0 && rearmed.delay <= 20_000,
  'the throttle must re-arm the timer for the remaining time');

// A remote snapshot reaches React meanwhile (other referees' reports): the
// queued pre-remote state must never be pushed on top of it.
replacePendingAutoStructuredSync(autosyncState('remote'));
await flushAutoStructuredSync(undefined, { force: true }); // e.g. the tab comes back to the foreground
assert(pushedNames().at(-1) === 'Autosync remote', 'the queue must hold the remote state that replaced it');
assert(!pushedNames().includes('Autosync throttled'), 'the stale queued state must never be republished');
assert(autosyncPushes().at(-1)?.body.p_force === false, 'the lifecycle flush must keep compare-and-swap too');

// A commit already confirmed by an RPC drops the queue entirely.
scheduleAutoStructuredSync(autosyncState('dropped'));
replacePendingAutoStructuredSync(null);
await flushAutoStructuredSync(undefined, { force: true });
assert(!pushedNames().includes('Autosync dropped'), 'a dropped queue must not be pushed');

// Nothing pending: a remote state must not create a new structured export.
const pushesBeforeIdleRemote = autosyncPushes().length;
replacePendingAutoStructuredSync(autosyncState('idle-remote'));
await flushAutoStructuredSync(undefined, { force: true });
assert(autosyncPushes().length === pushesBeforeIdleRemote, 'a remote state alone never queues an export');

// A repository commit and its automatic export share one canonical snapshot.
const committed = autosyncState('committed');
await pushWorkspaceState(committed, { operationId: 'repository-projection-test' });
await flushAutoStructuredSync(committed, { force: true });
assert(pushedNames().filter((name) => name === 'Autosync committed').length === 1,
  'an automatic export must reuse the acknowledged workspace snapshot');
const publicProjections = () => calls.filter(({ url, method }) => url.includes('/rest/v1/public_tournaments?') && method === 'POST');
const projectionsBeforeRepeat = publicProjections().length;
await flushAutoStructuredSync(committed, { force: true });
assert(publicProjections().length === projectionsBeforeRepeat, 'identical lifecycle flushes must not repeat a completed projection');

const overlapping = autosyncState('overlapping');
const starting = flushAutoStructuredSync(overlapping, { force: true });
const reentering = flushAutoStructuredSync(undefined, { force: true });
await Promise.all([starting, reentering]);
assert(pushedNames().filter((name) => name === 'Autosync overlapping').length === 1,
  'overlapping flushes must reserve the queue before route discovery');

const outdated = flushAutoStructuredSync(autosyncState('preflight'), { force: true });
replacePendingAutoStructuredSync(null);
await outdated;
assert(!pushedNames().includes('Autosync preflight'), 'dropping a queue during route discovery must prevent its snapshot write');

// A stale cursor only counts as success when the entire persisted state matches.
const equivalent = autosyncState('conflict');
workspaceStateRow = {
  workspace_id: 'default',
  state: { tournamentMatches: [], tournament: { name: equivalent.tournament.name, id: 't1' } },
  version: 43,
  updated_at: '2026-08-01T15:00:01.000Z',
};
rejectWorkspaceConflict = true;
const equivalentRow = await pushWorkspaceState(equivalent, { operationId: 'equivalent-test' });
assert(equivalentRow.version === 43 && equivalentRow.updated_at === workspaceStateRow.updated_at,
  'an identical remote snapshot must supply its real cursor after P0001');
let distinctConflict: unknown;
try {
  await pushWorkspaceState(autosyncState('divergent'), { operationId: 'divergent-test' });
} catch (error) {
  distinctConflict = error;
}
assert((distinctConflict as { code?: string })?.code === 'FLBP_DB_CONFLICT',
  'the equivalent-content acknowledgement must not hide a different remote state');
rejectWorkspaceConflict = false;
workspaceStateRow = null;

rejectPublicProjection = true;
await flushAutoStructuredSync(autosyncState('projection-retry'), { force: true });
assert(readDbSyncDiagnostics().lastErrorMessage?.includes('fixture public projection write failed'),
  'a public mirror failure must appear in structured sync diagnostics');
rejectPublicProjection = false;
await flushAutoStructuredSync(undefined, { force: true, allowDuringBackoff: true });
assert(pushedNames().filter((name) => name === 'Autosync projection-retry').length === 1,
  'retrying a failed mirror must not write the canonical snapshot again');

// Forgotten local mode: the tournament PC stopped answering without closing
// local mode, so the coordinator reports recovery for its expired lease.
const reclaimCalls = () => calls.filter((call) => call.url.endsWith('/rpc/flbp_admin_reclaim_cloud_data_plane'));
resolvedRoute = { mode: 'recovery', authority: 'local', epoch: 7, reason: 'local_lease_expired' };
reclaimReplies = [{
  ok: false,
  reason: 'grace',
  epoch: 7,
  lease_expired_at: '2026-11-20T22:00:00.000Z',
  reclaim_at: '2026-11-21T10:00:00.000Z',
  missing_operations: 0,
}];
await initAdminWriteLease();
let leaseInfo = readAdminLeaseInfo();
assert(leaseInfo.status === 'error' && leaseInfo.recovery?.reason === 'grace'
  && leaseInfo.recovery.reclaimAt === '2026-11-21T10:00:00.000Z',
  'before the grace period the window stays read-only and knows when it unlocks');
assert(reclaimCalls().at(-1)?.body.p_expected_epoch === 7 && reclaimCalls().at(-1)?.body.p_accept_missing === false,
  'the automatic attempt targets the expired epoch and never accepts losses');
await releaseAdminWriteLease();

reclaimReplies = [
  { ok: false, reason: 'missing_operations', epoch: 7, missing_operations: 3, last_missing_operation_at: '2026-11-20T21:58:00.000Z' },
  { ok: true, reclaimed: true, mode: 'cloud', epoch: 8 },
];
await initAdminWriteLease();
leaseInfo = readAdminLeaseInfo();
assert(leaseInfo.status === 'error' && leaseInfo.recovery?.reason === 'missing_operations'
  && leaseInfo.recovery.missingOperations === 3,
  'operations missing from the cloud snapshot stop the automatic reclaim');
await reclaimCloudAcceptingMissingOperations();
leaseInfo = readAdminLeaseInfo();
assert(leaseInfo.status === 'active' && !leaseInfo.recovery, 'an explicit choice reclaims cloud authority and acquires the lease');
assert(reclaimCalls().at(-1)?.body.p_accept_missing === true, 'only the explicit choice accepts the missing operations');
assert(local.getItem('flbp_normalized_sync_required_v1') === '1' && !!local.getItem('flbp_data_plane_change_v1'),
  'a reclaim asks for a normalized rebuild and notifies the other tabs');
await releaseAdminWriteLease();

resolvedRoute = { mode: 'recovery', authority: 'local', epoch: 8, reason: 'local_lease_expired' };
reclaimReplies = [{ ok: true, reclaimed: true, mode: 'cloud', epoch: 9 }];
await initAdminWriteLease();
assert(readAdminLeaseInfo().status === 'active', 'a fully backed-up journal is reclaimed without asking');
await releaseAdminWriteLease();

const reclaimCountBeforeOutage = reclaimCalls().length;
resolveFails = true;
await initAdminWriteLease();
leaseInfo = readAdminLeaseInfo();
assert(leaseInfo.status === 'error' && leaseInfo.recovery?.reason === 'unreachable'
  && reclaimCalls().length === reclaimCountBeforeOutage,
  'a coordinator outage is never treated as an expired local lease, nor blamed on the tournament PC');
await releaseAdminWriteLease();
resolveFails = false;

// Local mode with Internet reads from the mirror: the coordinator answers
// mode=cloud, authority=local. The online Admin stays read-only and never asks
// for the cloud lease, then writes again once the PC closes local mode.
const acquireCallsBeforeLocal = calls.filter((call) => call.url.endsWith('/rpc/flbp_admin_acquire_write_lease')).length;
resolvedRoute = { mode: 'cloud', authority: 'local', public_read_mode: 'cloud', epoch: 16, lease_expires_at: '2099-01-01T00:00:00.000Z' };
await initAdminWriteLease();
leaseInfo = readAdminLeaseInfo();
assert(leaseInfo.status === 'error' && leaseInfo.recovery?.reason === 'local_active' && !leaseInfo.lastError,
  'while the tournament PC writes, the online Admin is read-only with the local mode notice');
assert(calls.filter((call) => call.url.endsWith('/rpc/flbp_admin_acquire_write_lease')).length === acquireCallsBeforeLocal,
  'the online Admin must not acquire the cloud lease while the PC holds authority');
resolvedRoute = { mode: 'cloud', authority: 'cloud', epoch: 17 };
await takeoverAdminWriteLease();
assert(readAdminLeaseInfo().status === 'active' && !readAdminLeaseInfo().recovery,
  'after Chiudi modalità locale the online Admin writes again');
await releaseAdminWriteLease();

// One slow answer from the coordinator is retried before the window locks.
resolvedRoute = { mode: 'cloud', epoch: 9 };
resolveFailures = 1;
const discoveryCallsBeforeRetry = calls.filter((call) => call.url.endsWith('/rpc/flbp_resolve_data_plane')).length;
await initAdminWriteLease();
assert(readAdminLeaseInfo().status === 'active' && !readAdminLeaseInfo().recovery,
  'a single failed discovery must be retried instead of locking the Admin');
assert(calls.filter((call) => call.url.endsWith('/rpc/flbp_resolve_data_plane')).length - discoveryCallsBeforeRetry >= 2,
  'the retry must ask the coordinator again');
await releaseAdminWriteLease();

const authSession = (accessToken: string, expiresIn = 3600) => ({
  accessToken,
  refreshToken: 'refresh-' + accessToken,
  expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  userId: 'admin-cloud-test',
  email: 'admin@example.test',
});

setSupabaseSession(authSession('first-lease-token'));
resolvedRoute = { mode: 'cloud', epoch: 9 };
await initAdminWriteLease();
assert(readAdminLeaseInfo().status === 'active', 'a valid session acquires the cloud lease');

const leaseRequests = () => calls.filter(({ url }) => url.endsWith('/rpc/flbp_admin_acquire_write_lease'));
const refreshRequests = () => calls.filter(({ url }) => url.endsWith('/auth/v1/token?grant_type=refresh_token'));
const logoutRequests = () => calls.filter(({ url }) => url.includes('/auth/v1/logout'));
const tokenResponse = (token: string) => Response.json({
  access_token: token,
  refresh_token: 'refresh-' + token,
  expires_in: 3600,
});

const expiring = authSession('expiring-lease-token', 30);
setSupabaseSession(expiring);
setPlayerSupabaseSession({ ...expiring, flowType: 'session' });
refreshReply = tokenResponse('rotated-lease-token');
const refreshBeforeRotation = refreshRequests().length;
await Promise.all([takeoverAdminWriteLease(), ensureFreshPlayerSupabaseSession()]);
assert(refreshRequests().length === refreshBeforeRotation + 1, 'mirrored Admin and Player sessions share an in-flight refresh');
assert(leaseRequests().at(-1)?.authorization === 'Bearer rotated-lease-token'
  && getPlayerSupabaseSession()?.accessToken === 'rotated-lease-token'
  && getSupabaseSession()?.accessToken === 'rotated-lease-token',
  'cloud lease renewal and both session stores use the refreshed token');

rejectLeaseToken = 'Bearer rotated-lease-token';
refreshReply = tokenResponse('recovered-lease-token');
const leaseBeforeRetry = leaseRequests().length;
await takeoverAdminWriteLease();
assert(leaseRequests().length === leaseBeforeRetry + 2 && leaseRequests().at(-1)?.authorization === 'Bearer recovered-lease-token'
  && readAdminLeaseInfo().status === 'active', 'a JWT rejection forces one refresh and retries the lease with the new token');

rejectLeaseToken = 'Bearer recovered-lease-token';
refreshReply = Response.json({ code: 'session_not_found' }, { status: 400 });
const leaseBeforeExpiry = leaseRequests().length;
await takeoverAdminWriteLease();
assert(readAdminLeaseInfo().status === 'session-expired' && !readAdminLeaseInfo().lastError
  && isAdminWriteBlockedByLease(), 'rejected refresh leaves Admin read-only with no raw error');
assert(leaseRequests().length === leaseBeforeExpiry + 1 && !getSupabaseSession() && !getPlayerSupabaseSession()
  && isSupabaseAdminSessionExpired(), 'a rejected refresh clears the shared credentials and prevents another rejected lease call');
await releaseAdminWriteLease();

setSupabaseSession(authSession('verify-relogin'));
await initAdminWriteLease();
assert(readAdminLeaseInfo().status === 'active' && !isSupabaseAdminSessionExpired(), 'signing in again restores the lease');
await releaseAdminWriteLease();

const raceSession = authSession('logout-during-refresh', 30);
setSupabaseSession(raceSession);
setPlayerSupabaseSession({ ...raceSession, flowType: 'session' });
let completeRefresh!: (response: Response) => void;
refreshReply = new Promise<Response>((resolve) => { completeRefresh = resolve; });
const refreshDuringLogout = ensureFreshSupabaseSession();
const countBeforeSharedLogout = logoutRequests().length;
const signOut = signOutCurrentSupabaseSessions();
assert(!getSupabaseSession() && !getPlayerSupabaseSession(), 'logout removes both shared session copies before it yields');
completeRefresh(tokenResponse('logged-out-token'));
await Promise.all([signOut, refreshDuringLogout]);
assert(!getSupabaseSession() && !getPlayerSupabaseSession() && !isSupabaseAdminSessionExpired()
  && logoutRequests().length === countBeforeSharedLogout + 1,
  'a late refresh cannot put a logged-out session back, and a shared session is revoked once');

setSupabaseSession(authSession('distinct-admin-token'));
setPlayerSupabaseSession({ ...authSession('distinct-player-token'), flowType: 'session' });
await signOutCurrentSupabaseSessions();
assert(logoutRequests().slice(-2).some(({ authorization }) => authorization === 'Bearer distinct-admin-token')
  && logoutRequests().slice(-2).some(({ authorization }) => authorization === 'Bearer distinct-player-token'),
  'unified sign-out revokes distinct Admin and Player sessions separately');

setSupabaseSession(authSession('admin-only-token'));
setPlayerSupabaseSession({ ...authSession('player-only-token'), flowType: 'session' });
await signOutSupabase();
assert(!getSupabaseSession() && getPlayerSupabaseSession()?.accessToken === 'player-only-token',
  'Admin-only logout keeps a distinct Player session signed in');
await playerSignOutSupabase();
assert(!getPlayerSupabaseSession(), 'Player-only logout clears the Player session');
assert(logoutRequests().every(({ url, method }) => new URL(url).search === '?scope=local' && method === 'POST'),
  'every explicit logout is scoped to the current Supabase session');
console.log('PASS local logout, refresh races and cloud Admin lease recovery');

console.log('PASS cloud Admin idempotency, rollout fallback and safe local recovery');
console.log('PASS forgotten local mode: the Admin reclaims cloud authority only after the grace period');
console.log('PASS B3 structured autosync keeps compare-and-swap, re-arms the throttle and never republishes a stale queue');
(globalThis as any).process.exit(0);
