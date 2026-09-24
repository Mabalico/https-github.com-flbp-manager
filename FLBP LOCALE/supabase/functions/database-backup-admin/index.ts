import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { runDatabaseBackupOperation, BackupOperationError } from './operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const normalizeText = (value: unknown) => String(value ?? '').trim();

const ensureAdminUser = async (req: Request, adminClient: SupabaseClient) => {
  const token = normalizeText(req.headers.get('Authorization')).replace(/^Bearer\s+/i, '').trim();
  if (!token) throw json(401, { ok: false, restoreNotCommitted: true, reason: 'Admin session invalid or expired.' });
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) throw json(401, { ok: false, restoreNotCommitted: true, reason: 'Admin session invalid or expired.' });
  const { data: adminRow, error: adminError } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (adminError || !adminRow) throw json(403, { ok: false, restoreNotCommitted: true, reason: 'Admin access required.' });
  return user.id;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method not allowed.' });
  try {
    const supabaseUrl = normalizeText(Deno.env.get('SUPABASE_URL'));
    const serviceKey = normalizeText(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase Edge Function environment.');
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Identity comes exclusively from the verified session, never the request body.
    const actorId = await ensureAdminUser(req, adminClient);
    const body = await req.json().catch(() => null);
    const result = await runDatabaseBackupOperation(adminClient, body, actorId);
    return json(200, result);
  } catch (error) {
    if (error instanceof Response) return error;
    return json(error instanceof BackupOperationError ? error.status : 500, {
      ok: false, reason: error instanceof Error ? error.message : String(error),
      restoreNotCommitted: error instanceof BackupOperationError && error.restoreNotCommitted,
    });
  }
});
