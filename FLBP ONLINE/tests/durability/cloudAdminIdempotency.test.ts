import { getSupabaseConfig, pushWorkspaceState, recoverWorkspaceFromLocalState, setRemoteBaseUpdatedAt, setSupabaseSession } from '../../services/supabaseRest';
import { readAdminLeaseInfo, setAdminLeaseInfo } from '../../services/adminWriteLeaseState';
import { initAdminWriteLease, reclaimCloudAcceptingMissingOperations, releaseAdminWriteLease } from '../../services/adminWriteLease';
import { flushAutoStructuredSync, replacePendingAutoStructuredSync, scheduleAutoStructuredSync } from '../../services/autoDbSync';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const calls: Array<{ url: string; body: any }> = [];
let requireLegacyFallback = false;
let workspaceStateRow: any = null;
// Enabled only by the structured-autosync section: normalized/public rows accept writes.
let allowProjectionWrites = false;
// Data-plane reclaim section: coordinator route and scripted reclaim answers.
let resolvedRoute: any = { mode: 'cloud', epoch: 4 };
let resolveFails = false;
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
  calls.push({ url, body });
  if (url.endsWith('/api/v1/discovery')) return Response.json({ error: 'not local' }, { status: 404 });
  if (url.endsWith('/rpc/flbp_resolve_data_plane')) {
    if (resolveFails) return Response.json({ message: 'coordinator unreachable' }, { status: 503 });
    return Response.json(resolvedRoute);
  }
  if (url.endsWith('/rpc/flbp_admin_reclaim_cloud_data_plane')) {
    const reply = reclaimReplies.shift() || { ok: false, reason: 'unexpected' };
    if (reply.ok && reply.mode === 'cloud') resolvedRoute = { mode: 'cloud', epoch: reply.epoch };
    return Response.json(reply);
  }
  if (url.endsWith('/rpc/flbp_admin_acquire_write_lease')) {
    return Response.json({ acquired: true, holder_id: body?.p_holder_id, holder_label: body?.p_holder_label });
  }
  if (url.endsWith('/rpc/flbp_admin_release_write_lease')) return Response.json({ released: true });
  if (url.includes('/rest/v1/workspace_state?')) return Response.json(workspaceStateRow ? [workspaceStateRow] : []);
  if (url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')) {
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
assert(leaseInfo.status === 'error' && leaseInfo.recovery?.reason === 'unavailable'
  && reclaimCalls().length === reclaimCountBeforeOutage,
  'a coordinator outage is never treated as an expired local lease');
await releaseAdminWriteLease();
resolveFails = false;

console.log('PASS cloud Admin idempotency, rollout fallback and safe local recovery');
console.log('PASS forgotten local mode: the Admin reclaims cloud authority only after the grace period');
console.log('PASS B3 structured autosync keeps compare-and-swap, re-arms the throttle and never republishes a stale queue');
(globalThis as any).process.exit(0);
