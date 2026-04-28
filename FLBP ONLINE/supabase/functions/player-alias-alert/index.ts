import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6';

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
  code?: PushDispatchReasonCode | null;
  reason?: string | null;
};

type PushDispatchReasonCode =
  | 'no_device'
  | 'web_only'
  | 'permission_denied'
  | 'token_missing'
  | 'provider_config_missing'
  | 'provider_rejected'
  | 'provider_error'
  | 'unsupported_platform';

type PushDispatchStatus = {
  code: PushDispatchReasonCode;
  reason: string;
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizePrivateKey = (value: string | null) => normalizeText(value).replace(/\\n/g, '\n');

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
    throw new Error('Missing Supabase Edge Function environment.');
  }
};

const readBearerToken = (req: Request) => {
  const authHeader = normalizeText(req.headers.get('Authorization'));
  return authHeader.replace(/^Bearer\s+/i, '').trim();
};

const createAdminClient = (env: RuntimeEnv) => createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ensureAdminUser = async (req: Request, env: RuntimeEnv, adminClient = createAdminClient(env)) => {
  const token = readBearerToken(req);
  if (!token) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Missing Authorization bearer token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
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

const fetchTargetDevices = async (
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string,
  targetUserId: string,
) => {
  const { data, error } = await adminClient
    .from('player_app_devices')
    .select('id,platform,device_token,push_enabled')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);
  if (error) throw new Error(error.message);
  return (data || []) as DeviceRow[];
};

const getNoReadyDeviceStatus = (devices: DeviceRow[]): PushDispatchStatus => {
  if (!devices.length) {
    return {
      code: 'no_device',
      reason: 'Nessun dispositivo nativo registrato per questo giocatore. Apri l’app FLBP sul telefono con questo account e attiva le notifiche.',
    };
  }
  if (!devices.some((device) => device.platform === 'android' || device.platform === 'ios')) {
    return {
      code: 'web_only',
      reason: 'Per questo giocatore risultano solo sessioni web: serve aprire l’app Android/iOS e accedere con lo stesso account.',
    };
  }
  if (devices.some((device) => (device.platform === 'android' || device.platform === 'ios') && !device.push_enabled)) {
    return {
      code: 'permission_denied',
      reason: 'Il dispositivo del giocatore è registrato, ma le notifiche non risultano abilitate.',
    };
  }
  if (devices.some((device) => (device.platform === 'android' || device.platform === 'ios') && !normalizeText(device.device_token))) {
    return {
      code: 'token_missing',
      reason: 'Il dispositivo è registrato, ma non ha ancora un token push valido. Riapri l’app FLBP sul telefono e rientra nell’area giocatore.',
    };
  }
  return {
    code: 'unsupported_platform',
    reason: 'Nessun dispositivo Android/iOS pronto per ricevere notifiche push.',
  };
};

const getDeliveryErrorStatus = (error: unknown): PushDispatchStatus => {
  const reason = error instanceof Error ? error.message : String(error);
  if (/FCM|APNs|configured|Configurazione|Missing|APNS_|FCM_/i.test(reason)) {
    return { code: 'provider_config_missing', reason };
  }
  return { code: 'provider_error', reason };
};

const fetchGoogleAccessToken = async (env: RuntimeEnv) => {
  if (!env.fcmProjectId || !env.fcmClientEmail || !env.fcmPrivateKey) {
    throw new Error('FCM config missing (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY).');
  }
  const privateKey = await importPKCS8(env.fcmPrivateKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
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
  if (!response.ok) throw new Error(`FCM auth failed (${response.status})`);
  const accessToken = normalizeText((payload as Record<string, unknown>).access_token);
  if (!accessToken) throw new Error('FCM auth response missing access_token.');
  return accessToken;
};

const buildApnsJwt = async (env: RuntimeEnv) => {
  if (!env.apnsTeamId || !env.apnsKeyId || !env.apnsPrivateKey || !env.apnsBundleId) {
    throw new Error('APNs config missing.');
  }
  const privateKey = await importPKCS8(env.apnsPrivateKey, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ iss: env.apnsTeamId })
    .setProtectedHeader({ alg: 'ES256', kid: env.apnsKeyId })
    .setIssuedAt(now)
    .sign(privateKey);
};

type AlertContent = {
  title: string;
  body: string;
  candidatePlayerName: string;
  tournamentName: string;
};

const sendAndroidAlert = async (env: RuntimeEnv, device: DeviceRow, content: AlertContent): Promise<DispatchResult> => {
  const accessToken = await fetchGoogleAccessToken(env);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.fcmProjectId}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: normalizeText(device.device_token),
          data: {
            action: 'alias_alert',
            candidatePlayerName: content.candidatePlayerName,
            tournamentName: content.tournamentName,
            title: content.title,
            body: content.body,
            route: 'player_area',
          },
          android: { priority: 'high' },
        },
      }),
    }
  );
  const payloadText = await response.text();
  return {
    deviceId: device.id,
    platform: 'android',
    provider: 'fcm',
    ok: response.ok,
    status: response.status,
    code: response.ok ? null : 'provider_rejected',
    reason: response.ok ? null : payloadText,
  };
};

const sendIosAlert = async (env: RuntimeEnv, device: DeviceRow, content: AlertContent): Promise<DispatchResult> => {
  const jwt = await buildApnsJwt(env);
  const endpoint = env.apnsUseSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const response = await fetch(`${endpoint}/3/device/${normalizeText(device.device_token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': env.apnsBundleId!,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': `alias-${device.id.slice(0, 32)}`,
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: content.title, body: content.body },
        sound: 'default',
        'thread-id': 'alias_alerts',
      },
      flbp: {
        action: 'alias_alert',
        candidatePlayerName: content.candidatePlayerName,
        tournamentName: content.tournamentName,
        route: 'player_area',
      },
    }),
  });
  const payloadText = await response.text();
  return {
    deviceId: device.id,
    platform: 'ios',
    provider: 'apns',
    ok: response.ok,
    status: response.status,
    code: response.ok ? null : 'provider_rejected',
    reason: response.ok ? null : payloadText,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method not allowed.' });

  const env = getEnv();
  try {
    ensureBaseEnv(env);
    const body = await req.json().catch(() => ({}));
    const bodyRecord = body as Record<string, unknown>;
    const workspaceId = normalizeText(bodyRecord.workspaceId);
    const targetUserId = normalizeText(bodyRecord.targetUserId);
    const candidatePlayerName = normalizeText(bodyRecord.candidatePlayerName);
    const tournamentName = normalizeText(bodyRecord.tournamentName) || 'torneo live';

    if (!workspaceId || !targetUserId || !candidatePlayerName) {
      return json(400, { ok: false, reason: 'Invalid alias-alert payload (workspaceId, targetUserId, candidatePlayerName required).' });
    }

    const adminClient = createAdminClient(env);
    await ensureAdminUser(req, env, adminClient);

    const devices = await fetchTargetDevices(adminClient, workspaceId, targetUserId);
    const readyDevices = devices.filter((device) =>
      normalizeText(device.device_token) && device.push_enabled === true && device.platform !== 'web'
    );

    if (!readyDevices.length) {
      const noReadyDeviceStatus = getNoReadyDeviceStatus(devices);
      return json(200, {
        ok: true,
        targetUserId,
        skipped: true,
        code: noReadyDeviceStatus.code,
        reasonCode: noReadyDeviceStatus.code,
        reason: noReadyDeviceStatus.reason,
        deliveries: [],
      });
    }

    const content: AlertContent = {
      title: 'FLBP • Possibile alias rilevato',
      body: `${candidatePlayerName} è iscritto a ${tournamentName}: potrebbe essere un tuo profilo storico. Apri l'app per verificare.`,
      candidatePlayerName,
      tournamentName,
    };

    const deliveries: DispatchResult[] = [];
    for (const device of readyDevices) {
      try {
        if (device.platform === 'android') deliveries.push(await sendAndroidAlert(env, device, content));
        else if (device.platform === 'ios') deliveries.push(await sendIosAlert(env, device, content));
      } catch (error) {
        const deliveryErrorStatus = getDeliveryErrorStatus(error);
        deliveries.push({
          deviceId: device.id,
          platform: device.platform,
          provider: device.platform === 'ios' ? 'apns' : 'fcm',
          ok: false,
          code: deliveryErrorStatus.code,
          reason: deliveryErrorStatus.reason,
        });
      }
    }

    return json(200, {
      ok: true,
      targetUserId,
      deliveries,
      skipped: deliveries.length === 0,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json(500, {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
});
