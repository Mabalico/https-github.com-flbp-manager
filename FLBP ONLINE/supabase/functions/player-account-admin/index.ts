import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RuntimeEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type MergeRequestStatus = 'pending' | 'resolved' | 'ignored';

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

const normalizeEmail = (value: unknown) => normalizeText(value).toLowerCase();

const normalizeDate = (value: unknown) => {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

const normalizeMergeRequestStatus = (value: unknown): MergeRequestStatus => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'resolved' || normalized === 'ignored' ? normalized : 'pending';
};

const getEnv = (): RuntimeEnv => ({
  supabaseUrl: normalizeText(Deno.env.get('SUPABASE_URL')),
  supabaseServiceRoleKey: normalizeText(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
});

const ensureBaseEnv = (env: RuntimeEnv) => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Missing Supabase Edge Function environment. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const createAdminClient = (env: RuntimeEnv) =>
  createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const readBearerToken = (req: Request) => {
  const authHeader = normalizeText(req.headers.get('Authorization'));
  return authHeader.replace(/^Bearer\s+/i, '').trim();
};

const getOptionalUser = async (
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<User | null> => {
  const token = readBearerToken(req);
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);
  if (error || !user) return null;
  return user;
};

const ensureAdminUser = async (req: Request, env: RuntimeEnv) => {
  const adminClient = createAdminClient(env);
  const user = await getOptionalUser(req, adminClient);
  if (!user) {
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

const ensureWorkspace = async (adminClient: ReturnType<typeof createAdminClient>, workspaceId: string) => {
  const safeWorkspaceId = normalizeText(workspaceId);
  if (!safeWorkspaceId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'workspaceId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await adminClient
    .from('workspaces')
    .upsert({ id: safeWorkspaceId }, { onConflict: 'id' });

  if (error) {
    throw new Error(error.message);
  }

  return safeWorkspaceId;
};

const deletePlayerAccount = async (
  adminClient: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  targetUserId: string,
  adminUserId: string
) => {
  const safeWorkspaceId = await ensureWorkspace(adminClient, workspaceId);
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
    adminClient.from('player_account_merge_requests').delete().eq('workspace_id', safeWorkspaceId).eq('requester_user_id', targetUserId),
    adminClient.from('player_app_calls').delete().eq('workspace_id', safeWorkspaceId).eq('target_user_id', targetUserId),
    adminClient.from('player_app_devices').delete().eq('workspace_id', safeWorkspaceId).eq('user_id', targetUserId),
    adminClient.from('player_app_profiles').delete().eq('workspace_id', safeWorkspaceId).eq('user_id', targetUserId),
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

const listAdminUsers = async (adminClient: ReturnType<typeof createAdminClient>) => {
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
  adminClient: ReturnType<typeof createAdminClient>,
  targetUserId: string,
  email: string
) => {
  const safeUserId = normalizeText(targetUserId);
  const safeEmail = normalizeEmail(email);
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
  adminClient: ReturnType<typeof createAdminClient>,
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

const submitMergeRequest = async (
  adminClient: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
  authenticatedUser: User | null
) => {
  const workspaceId = await ensureWorkspace(adminClient, body.workspaceId);
  const requesterEmail = normalizeEmail(body.requesterEmail ?? authenticatedUser?.email ?? '');
  const requesterFirstName = normalizeText(body.requesterFirstName);
  const requesterLastName = normalizeText(body.requesterLastName);
  const requesterBirthDate = normalizeDate(body.requesterBirthDate);
  const requesterUserId = normalizeText(body.requesterUserId ?? authenticatedUser?.id ?? '') || null;
  const requesterCanonicalPlayerId = normalizeText(body.requesterCanonicalPlayerId) || null;
  const requesterCanonicalPlayerName =
    normalizeText(body.requesterCanonicalPlayerName)
    || `${requesterLastName} ${requesterFirstName}`.trim()
    || null;
  const candidatePlayerId = normalizeText(body.candidatePlayerId);
  const candidatePlayerName = normalizeText(body.candidatePlayerName);
  const candidateBirthDate = normalizeDate(body.candidateBirthDate) || null;
  const comment = normalizeText(body.comment).slice(0, 2000) || null;

  if (!requesterEmail || !requesterFirstName || !requesterLastName || !requesterBirthDate) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Requester identity is incomplete.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!candidatePlayerId || !candidatePlayerName) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Candidate player is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: existing, error: existingError } = await adminClient
    .from('player_account_merge_requests')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .eq('requester_email', requesterEmail)
    .eq('candidate_player_id', candidatePlayerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    workspace_id: workspaceId,
    requester_user_id: requesterUserId,
    requester_email: requesterEmail,
    requester_first_name: requesterFirstName,
    requester_last_name: requesterLastName,
    requester_birth_date: requesterBirthDate,
    requester_canonical_player_id: requesterCanonicalPlayerId,
    requester_canonical_player_name: requesterCanonicalPlayerName,
    candidate_player_id: candidatePlayerId,
    candidate_player_name: candidatePlayerName,
    candidate_birth_date: candidateBirthDate,
    comment,
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await adminClient
      .from('player_account_merge_requests')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true, row: data };
  }

  const { data, error } = await adminClient
    .from('player_account_merge_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, row: data };
};

const listMergeRequests = async (
  adminClient: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  statusRaw: unknown
) => {
  const safeWorkspaceId = await ensureWorkspace(adminClient, workspaceId);
  const status = normalizeMergeRequestStatus(statusRaw);
  let query = adminClient
    .from('player_account_merge_requests')
    .select('*')
    .eq('workspace_id', safeWorkspaceId)
    .order('created_at', { ascending: false });

  if (statusRaw != null && normalizeText(statusRaw)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    rows: Array.isArray(data) ? data : [],
  };
};

const listMyMergeRequests = async (
  adminClient: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
  authenticatedUser: User | null,
) => {
  if (!authenticatedUser) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Player session invalid or expired.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const safeWorkspaceId = await ensureWorkspace(adminClient, body.workspaceId);
  const requesterEmail = normalizeEmail(authenticatedUser.email ?? body.requesterEmail ?? '');
  if (!requesterEmail) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Requester email unavailable.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const statusValue = normalizeText(body.status);
  let query = adminClient
    .from('player_account_merge_requests')
    .select('*')
    .eq('workspace_id', safeWorkspaceId)
    .eq('requester_email', requesterEmail)
    .order('created_at', { ascending: false });

  if (statusValue) {
    query = query.eq('status', normalizeMergeRequestStatus(statusValue));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    rows: Array.isArray(data) ? data : [],
  };
};

const setMergeRequestStatus = async (
  adminClient: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  requestId: string,
  statusRaw: unknown,
  adminUserId: string
) => {
  const safeWorkspaceId = await ensureWorkspace(adminClient, workspaceId);
  const requestStatus = normalizeMergeRequestStatus(statusRaw);
  const safeRequestId = normalizeText(requestId);
  if (!safeRequestId) {
    throw new Response(JSON.stringify({ ok: false, reason: 'requestId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (requestStatus !== 'resolved' && requestStatus !== 'ignored') {
    throw new Response(JSON.stringify({ ok: false, reason: 'Unsupported merge request status.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await adminClient
    .from('player_account_merge_requests')
    .update({
      status: requestStatus,
      updated_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: adminUserId,
    })
    .eq('workspace_id', safeWorkspaceId)
    .eq('id', safeRequestId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, row: data };
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
    const body = await req.json().catch(() => ({}));
    const action = normalizeText(body?.action);

    if (action === 'submit_merge_request') {
      const adminClient = createAdminClient(env);
      const authenticatedUser = await getOptionalUser(req, adminClient);
      return json(200, await submitMergeRequest(adminClient, body, authenticatedUser));
    }

    if (action === 'list_my_merge_requests') {
      const adminClient = createAdminClient(env);
      const authenticatedUser = await getOptionalUser(req, adminClient);
      return json(200, await listMyMergeRequests(adminClient, body, authenticatedUser));
    }

    const { adminClient, adminUserId } = await ensureAdminUser(req, env);
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
      case 'list_merge_requests':
        return json(200, await listMergeRequests(adminClient, workspaceId, body?.status));
      case 'set_merge_request_status':
        return json(
          200,
          await setMergeRequestStatus(adminClient, workspaceId, normalizeText(body?.requestId), body?.status, adminUserId),
        );
      default:
        return json(400, { ok: false, reason: 'Unsupported action.' });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, reason: message });
  }
});
