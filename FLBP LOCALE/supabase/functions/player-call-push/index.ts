import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6';

type PushAction = 'ringing' | 'cancelled' | 'acknowledged';

type CallRow = {
  id: string;
  workspace_id: string;
  tournament_id: string;
  team_id: string;
  team_name: string | null;
  target_user_id: string;
  target_player_id: string | null;
  target_player_name: string | null;
  status: string;
};

type DeviceRow = {
  id: string;
  platform: 'web' | 'android' | 'ios';
  device_token: string | null;
  push_enabled: boolean | null;
};

type DispatchResult = {
  deviceId: string;
  platform: string;
  provider: string;
  ok: boolean;
  status?: number | null;
  reason?: string | null;
};

type RuntimeEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  fcmProjectId: string | null;
  fcmClientEmail: string | null;
  fcmPrivateKey: string | null;
  apnsTeamId: string | null;
  apnsKeyId: string | null;
  apnsPrivateKey: string | null;
  apnsBundleId: string | null;
  apnsUseSandbox: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const normalizeText = (value: unknown) => String(value ?? '').trim();

const normalizePrivateKey = (value: string | null) =>
  normalizeText(value).replace(/\\n/g, '\n');

const getEnv = (): RuntimeEnv => ({
  supabaseUrl: normalizeText(Deno.env.get('SUPABASE_URL')),
  supabaseAnonKey: normalizeText(Deno.env.get('SUPABASE_ANON_KEY')),
  supabaseServiceRoleKey: normalizeText(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
  fcmProjectId: normalizeText(Deno.env.get('FCM_PROJECT_ID')) || null,
  fcmClientEmail: normalizeText(Deno.env.get('FCM_CLIENT_EMAIL')) || null,
  fcmPrivateKey: normalizePrivateKey(Deno.env.get('FCM_PRIVATE_KEY')) || null,
  apnsTeamId: normalizeText(Deno.env.get('APNS_TEAM_ID')) || null,
  apnsKeyId: normalizeText(Deno.env.get('APNS_KEY_ID')) || null,
  apnsPrivateKey: normalizePrivateKey(Deno.env.get('APNS_PRIVATE_KEY')) || null,
  apnsBundleId: normalizeText(Deno.env.get('APNS_BUNDLE_ID')) || null,
  apnsUseSandbox: ['1', 'true', 'yes'].includes(normalizeText(Deno.env.get('APNS_USE_SANDBOX')).toLowerCase()),
});

const ensureBaseEnv = (env: RuntimeEnv) => {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new Error('Missing Supabase Edge Function environment. Configure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const readBearerToken = (req: Request) => {
  const authHeader = normalizeText(req.headers.get('Authorization'));
  return authHeader.replace(/^Bearer\s+/i, '').trim();
};

const buildNotificationContent = (action: PushAction, call: CallRow) => {
  const safeTeam = call.team_name || 'La tua squadra';
  switch (action) {
    case 'cancelled':
      return {
        title: 'FLBP • Chiamata annullata',
        body: `${safeTeam}: la chiamata per la partita è stata annullata.`,
      };
    case 'acknowledged':
      return {
        title: 'FLBP • Conferma registrata',
        body: `${safeTeam}: la conferma di ricezione è stata registrata.`,
      };
    default:
      return {
        title: 'FLBP • Chiamata squadra',
        body: `${safeTeam} è stata chiamata per la partita. Apri FLBP per confermare.`,
      };
  }
};

const buildDataPayload = (action: PushAction, call: CallRow) => ({
  callId: call.id,
  tournamentId: call.tournament_id,
  teamId: call.team_id,
  teamName: call.team_name || '',
  targetPlayerId: call.target_player_id || '',
  targetPlayerName: call.target_player_name || '',
  action,
  route: 'player_area',
});

const ensureAdminUser = async (req: Request, env: RuntimeEnv) => {
  const token = readBearerToken(req);
  if (!token) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Missing Authorization bearer token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(token);
  if (userError || !user) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Admin session invalid or expired.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: adminRow, error: adminError } = await adminClient
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Admin access required.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return adminClient;
};

const fetchCallRow = async (adminClient: ReturnType<typeof createClient>, workspaceId: string, callId: string) => {
  const { data, error } = await adminClient
    .from('player_app_calls')
    .select('id,workspace_id,tournament_id,team_id,team_name,target_user_id,target_player_id,target_player_name,status')
    .eq('workspace_id', workspaceId)
    .eq('id', callId)
    .maybeSingle<CallRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Response(JSON.stringify({ ok: false, reason: 'Call not found.' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  return data;
};

const fetchTargetDevices = async (adminClient: ReturnType<typeof createClient>, call: CallRow) => {
  const { data, error } = await adminClient
    .from('player_app_devices')
    .select('id,platform,device_token,push_enabled')
    .eq('workspace_id', call.workspace_id)
    .eq('user_id', call.target_user_id)
    .eq('push_enabled', true);

  if (error) throw new Error(error.message);
  return (data || []).filter((device: DeviceRow) => normalizeText(device.device_token) && device.platform !== 'web');
};

const fetchGoogleAccessToken = async (env: RuntimeEnv) => {
  if (!env.fcmProjectId || !env.fcmClientEmail || !env.fcmPrivateKey) {
    throw new Error('FCM is not configured yet. Missing FCM_PROJECT_ID, FCM_CLIENT_EMAIL or FCM_PRIVATE_KEY.');
  }

  const privateKey = await importPKCS8(env.fcmPrivateKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(env.fcmClientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`FCM auth failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const accessToken = normalizeText((payload as Record<string, unknown>).access_token);
  if (!accessToken) {
    throw new Error('FCM auth response did not include an access_token.');
  }
  return accessToken;
};

const buildApnsJwt = async (env: RuntimeEnv) => {
  if (!env.apnsTeamId || !env.apnsKeyId || !env.apnsPrivateKey || !env.apnsBundleId) {
    throw new Error('APNs is not configured yet. Missing APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY or APNS_BUNDLE_ID.');
  }

  const privateKey = await importPKCS8(env.apnsPrivateKey, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ iss: env.apnsTeamId })
    .setProtectedHeader({ alg: 'ES256', kid: env.apnsKeyId })
    .setIssuedAt(now)
    .sign(privateKey);
};

const sendAndroidPush = async (env: RuntimeEnv, device: DeviceRow, action: PushAction, call: CallRow): Promise<DispatchResult> => {
  const accessToken = await fetchGoogleAccessToken(env);
  const content = buildNotificationContent(action, call);
  const data = buildDataPayload(action, call);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.fcmProjectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: normalizeText(device.device_token),
          notification: content,
          data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
          android: {
            priority: 'high',
            notification: {
              channel_id: 'team_calls',
              sound: 'default',
              tag: `call-${call.id}`,
            },
          },
        },
      }),
    }
  );
  const payload = await response.text();
  return {
    deviceId: device.id,
    platform: 'android',
    provider: 'fcm',
    ok: response.ok,
    status: response.status,
    reason: response.ok ? null : payload,
  };
};

const sendIosPush = async (env: RuntimeEnv, device: DeviceRow, action: PushAction, call: CallRow): Promise<DispatchResult> => {
  const jwt = await buildApnsJwt(env);
  const content = buildNotificationContent(action, call);
  const endpoint = env.apnsUseSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const response = await fetch(`${endpoint}/3/device/${normalizeText(device.device_token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': env.apnsBundleId!,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: content,
        sound: 'default',
      },
      flbp: buildDataPayload(action, call),
    }),
  });
  const payload = await response.text();
  return {
    deviceId: device.id,
    platform: 'ios',
    provider: 'apns',
    ok: response.ok,
    status: response.status,
    reason: response.ok ? null : payload,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'Method not allowed.' });
  }

  const env = getEnv();
  try {
    ensureBaseEnv(env);
    const body = await req.json().catch(() => ({}));
    const workspaceId = normalizeText((body as Record<string, unknown>).workspaceId);
    const callId = normalizeText((body as Record<string, unknown>).callId);
    const action = normalizeText((body as Record<string, unknown>).action).toLowerCase() as PushAction;

    if (!workspaceId || !callId || !['ringing', 'cancelled', 'acknowledged'].includes(action)) {
      return json(400, { ok: false, reason: 'Invalid push dispatch payload.' });
    }

    const adminClient = await ensureAdminUser(req, env);
    const call = await fetchCallRow(adminClient, workspaceId, callId);
    const devices = await fetchTargetDevices(adminClient, call);

    if (!devices.length) {
      return json(200, {
        ok: true,
        callId: call.id,
        action,
        skipped: true,
        reason: 'No push-ready devices found for this player.',
        deliveries: [],
      });
    }

    const deliveries: DispatchResult[] = [];
    for (const device of devices) {
      try {
        if (device.platform === 'android') {
          deliveries.push(await sendAndroidPush(env, device, action, call));
        } else if (device.platform === 'ios') {
          deliveries.push(await sendIosPush(env, device, action, call));
        }
      } catch (error) {
        deliveries.push({
          deviceId: device.id,
          platform: device.platform,
          provider: device.platform === 'ios' ? 'apns' : 'fcm',
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json(200, {
      ok: true,
      callId: call.id,
      action,
      deliveries,
      skipped: deliveries.length === 0,
      reason: deliveries.length === 0 ? 'No supported native devices found for push delivery.' : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json(500, {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
});
