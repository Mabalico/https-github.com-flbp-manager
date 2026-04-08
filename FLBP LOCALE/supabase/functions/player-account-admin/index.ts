import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RuntimeEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
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

const getEnv = (): RuntimeEnv => ({
  supabaseUrl: normalizeText(Deno.env.get('SUPABASE_URL')),
  supabaseServiceRoleKey: normalizeText(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
});

const ensureBaseEnv = (env: RuntimeEnv) => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Missing Supabase Edge Function environment. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const readBearerToken = (req: Request) => {
  const authHeader = normalizeText(req.headers.get('Authorization'));
  return authHeader.replace(/^Bearer\s+/i, '').trim();
};

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

  return { adminClient, adminUserId: user.id };
};

const deletePlayerAccount = async (
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string,
  targetUserId: string,
  adminUserId: string
) => {
  if (!workspaceId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'workspaceId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!targetUserId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'userId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (targetUserId === adminUserId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'You cannot delete the currently authenticated admin account.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: protectedAdmin } = await adminClient
    .from('admin_users')
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (protectedAdmin) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Protected admin account: deletion blocked.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cleanupTargets = [
    adminClient.from('player_app_calls').delete().eq('workspace_id', workspaceId).eq('target_user_id', targetUserId),
    adminClient.from('player_app_devices').delete().eq('workspace_id', workspaceId).eq('user_id', targetUserId),
    adminClient.from('player_app_profiles').delete().eq('workspace_id', workspaceId).eq('user_id', targetUserId),
  ];

  for (const operation of cleanupTargets) {
    const { error } = await operation;
    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (authDeleteError && !/user not found|not found/i.test(authDeleteError.message || '')) {
    throw new Error(authDeleteError.message);
  }

  return { ok: true, deletedUserId: targetUserId };
};

const listAdminUsers = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('admin_users')
    .select('user_id,email')
    .order('email', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    rows: Array.isArray(data)
      ? data.map((row) => ({
          user_id: normalizeText(row.user_id),
          email: normalizeText(row.email) || null,
        }))
      : [],
  };
};

const grantAdminUser = async (
  adminClient: ReturnType<typeof createClient>,
  targetUserId: string,
  email: string
) => {
  const safeUserId = normalizeText(targetUserId);
  const safeEmail = normalizeText(email).toLowerCase();
  if (!safeUserId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'userId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!safeEmail) {
    throw new Response(JSON.stringify({ ok: false, reason: 'email is required to promote an admin account.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await adminClient
    .from('admin_users')
    .upsert({ user_id: safeUserId, email: safeEmail }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, userId: safeUserId, email: safeEmail };
};

const revokeAdminUser = async (
  adminClient: ReturnType<typeof createClient>,
  targetUserId: string,
  adminUserId: string
) => {
  const safeUserId = normalizeText(targetUserId);
  if (!safeUserId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'userId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (safeUserId === adminUserId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'You cannot remove admin rights from the currently authenticated admin account.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await adminClient
    .from('admin_users')
    .delete()
    .eq('user_id', safeUserId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, userId: safeUserId };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'Method not allowed.' });
  }

  try {
    const env = getEnv();
    ensureBaseEnv(env);
    const { adminClient, adminUserId } = await ensureAdminUser(req, env);
    const body = await req.json().catch(() => ({}));
    const action = normalizeText(body?.action);
    const workspaceId = normalizeText(body?.workspaceId);
    const userId = normalizeText(body?.userId);

    switch (action) {
      case 'list_admins':
        return json(200, await listAdminUsers(adminClient));
      case 'grant_admin':
        return json(200, await grantAdminUser(adminClient, userId, normalizeText(body?.email)));
      case 'revoke_admin':
        return json(200, await revokeAdminUser(adminClient, userId, adminUserId));
      case 'delete':
        return json(200, await deletePlayerAccount(adminClient, workspaceId, userId, adminUserId));
      default:
        return json(400, { ok: false, reason: 'Unsupported action.' });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, reason: message });
  }
});
