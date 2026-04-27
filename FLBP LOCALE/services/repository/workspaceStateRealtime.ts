import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';
import { SUPABASE_AUTH_STATE_CHANGE_EVENT, getSupabaseConfig, getSupabaseSession } from '../supabaseRest';

type RealtimeUpdate = { updatedAt: string | null };
type Listener = (event: RealtimeUpdate) => void;

let client: RealtimeClient | null = null;
let channel: RealtimeChannel | null = null;
const listeners = new Set<Listener>();
let lastAuthToken: string | null = null;
let authBridgeInstalled = false;

const buildEndpoint = (httpsUrl: string): string => {
  const trimmed = httpsUrl.replace(/\/+$/, '');
  return `${trimmed.replace(/^http/i, 'ws')}/realtime/v1`;
};

const installAuthBridge = () => {
  if (authBridgeInstalled || typeof window === 'undefined') return;
  authBridgeInstalled = true;
  const sync = () => {
    const token = getSupabaseSession()?.accessToken || null;
    if (token === lastAuthToken) return;
    lastAuthToken = token;
    try {
      if (client && token) client.setAuth(token);
    } catch {
      // best-effort; reconnect handled by transport
    }
  };
  window.addEventListener(SUPABASE_AUTH_STATE_CHANGE_EVENT, sync);
  // also keep current token snapshot for first connect
  lastAuthToken = getSupabaseSession()?.accessToken || null;
};

const ensureClient = (): RealtimeClient | null => {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  if (client) return client;
  installAuthBridge();
  const session = getSupabaseSession();
  client = new RealtimeClient(buildEndpoint(cfg.url), {
    params: { apikey: cfg.anonKey },
  });
  if (session?.accessToken) {
    try { client.setAuth(session.accessToken); } catch { /* ignore */ }
  }
  try { client.connect(); } catch { /* ignore */ }
  return client;
};

const ensureChannel = (): RealtimeChannel | null => {
  const c = ensureClient();
  const cfg = getSupabaseConfig();
  if (!c || !cfg) return null;
  if (channel) return channel;
  const topic = `flbp:workspace_state:${cfg.workspaceId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chan = c.channel(topic) as any;
  chan.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'workspace_state',
      filter: `workspace_id=eq.${cfg.workspaceId}`,
    },
    (payload: { new?: { updated_at?: string | null } }) => {
      const updatedAt = String(payload?.new?.updated_at || '').trim() || null;
      for (const listener of listeners) {
        try { listener({ updatedAt }); } catch { /* ignore */ }
      }
    },
  );
  chan.subscribe();
  channel = chan;
  return chan;
};

const teardown = () => {
  try { channel?.unsubscribe(); } catch { /* ignore */ }
  try { client?.disconnect(); } catch { /* ignore */ }
  channel = null;
  client = null;
};

export const subscribeWorkspaceStateRealtime = (listener: Listener): (() => void) => {
  listeners.add(listener);
  try {
    ensureChannel();
  } catch {
    // realtime is best-effort: polling fallback in RemoteRepository keeps working
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardown();
  };
};
