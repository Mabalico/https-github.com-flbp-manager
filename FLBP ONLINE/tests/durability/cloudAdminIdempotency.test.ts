import { pushWorkspaceState, recoverWorkspaceFromLocalState, setSupabaseSession } from '../../services/supabaseRest';
import { setAdminLeaseInfo } from '../../services/adminWriteLeaseState';

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
  if (url.endsWith('/rpc/flbp_resolve_data_plane')) return Response.json({ mode: 'cloud', epoch: 4 });
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
  return Response.json({ error: `unexpected ${url}` }, { status: 500 });
}) as typeof fetch;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

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

console.log('PASS cloud Admin idempotency, rollout fallback and safe local recovery');
(globalThis as any).process.exit(0);
