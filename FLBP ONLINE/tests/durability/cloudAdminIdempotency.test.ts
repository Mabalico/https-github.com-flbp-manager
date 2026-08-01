import { pushWorkspaceState, setSupabaseSession } from '../../services/supabaseRest';

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
  if (url.endsWith('/rpc/flbp_admin_push_workspace_state_v2')) {
    if (requireLegacyFallback) {
      return Response.json({ code: 'PGRST202', message: 'Could not find the function flbp_admin_push_workspace_state_v2' }, { status: 404 });
    }
    return Response.json({
      ok: true,
      updated_at: '2026-08-01T15:00:00.000Z',
      version: 42,
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

console.log('PASS cloud Admin idempotency and migration rollout fallback');
(globalThis as any).process.exit(0);
