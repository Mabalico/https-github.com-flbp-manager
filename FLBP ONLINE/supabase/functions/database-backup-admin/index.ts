import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RuntimeEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type BackupTable = {
  name: string;
  scope: 'workspace' | 'all' | 'preserve';
  deleteColumn?: string;
};

type TableExport = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

type DatabaseBackupPayload = {
  exportType: 'flbp_application_database_backup';
  schemaVersion: 1;
  workspaceId: string;
  exportedAt: string;
  tables: Record<string, TableExport>;
  warnings: string[];
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

const ensureAdminUser = async (req: Request, adminClient: ReturnType<typeof createAdminClient>) => {
  const token = readBearerToken(req);
  if (!token) {
    throw new Response(JSON.stringify({ ok: false, reason: 'Admin session invalid or expired.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  return user.id;
};

const TABLES: BackupTable[] = [
  { name: 'workspaces', scope: 'preserve' },
  { name: 'app_settings', scope: 'workspace' },
  { name: 'workspace_state', scope: 'workspace' },
  { name: 'public_workspace_state', scope: 'workspace' },
  { name: 'player_aliases', scope: 'workspace' },
  { name: 'integrations_scorers', scope: 'workspace' },
  { name: 'hall_of_fame_entries', scope: 'workspace' },
  { name: 'public_hall_of_fame_entries', scope: 'workspace' },
  { name: 'public_career_leaderboard', scope: 'workspace' },
  { name: 'public_site_views_daily', scope: 'workspace' },
  { name: 'app_supabase_usage_daily', scope: 'workspace' },
  { name: 'sim_pool_team_names', scope: 'workspace' },
  { name: 'sim_pool_people', scope: 'workspace' },
  { name: 'admin_users', scope: 'preserve', deleteColumn: 'user_id' },
  { name: 'player_app_profiles', scope: 'workspace' },
  { name: 'player_app_devices', scope: 'workspace' },
  { name: 'player_app_calls', scope: 'workspace' },
  { name: 'player_account_merge_requests', scope: 'workspace' },
  { name: 'referee_auth_audit', scope: 'workspace' },
  { name: 'tournaments', scope: 'workspace' },
  { name: 'tournament_teams', scope: 'workspace' },
  { name: 'tournament_groups', scope: 'workspace' },
  { name: 'tournament_group_teams', scope: 'workspace' },
  { name: 'tournament_matches', scope: 'workspace' },
  { name: 'tournament_match_stats', scope: 'workspace' },
  { name: 'public_tournaments', scope: 'workspace' },
  { name: 'public_tournament_teams', scope: 'workspace' },
  { name: 'public_tournament_groups', scope: 'workspace' },
  { name: 'public_tournament_group_teams', scope: 'workspace' },
  { name: 'public_tournament_matches', scope: 'workspace' },
  { name: 'public_tournament_match_stats', scope: 'workspace' },
  { name: 'fanta_config', scope: 'workspace' },
  { name: 'fanta_teams', scope: 'workspace' },
  { name: 'fanta_rosters', scope: 'all', deleteColumn: 'id' },
  { name: 'fanta_roster_change_notices', scope: 'workspace' },
  { name: 'fanta_archived_editions', scope: 'workspace' },
  { name: 'fanta_archived_standings', scope: 'workspace' },
  { name: 'fanta_archived_players', scope: 'workspace' },
];

const RESTORE_DELETE_ORDER = [
  'fanta_roster_change_notices',
  'fanta_rosters',
  'fanta_archived_players',
  'fanta_archived_standings',
  'fanta_archived_editions',
  'fanta_teams',
  'fanta_config',
  'player_app_calls',
  'player_app_devices',
  'player_account_merge_requests',
  'player_app_profiles',
  'referee_auth_audit',
  'tournament_match_stats',
  'tournament_matches',
  'tournament_group_teams',
  'tournament_groups',
  'tournament_teams',
  'tournaments',
  'public_tournament_match_stats',
  'public_tournament_matches',
  'public_tournament_group_teams',
  'public_tournament_groups',
  'public_tournament_teams',
  'public_tournaments',
  'public_hall_of_fame_entries',
  'public_career_leaderboard',
  'hall_of_fame_entries',
  'integrations_scorers',
  'player_aliases',
  'sim_pool_people',
  'sim_pool_team_names',
  'public_site_views_daily',
  'app_supabase_usage_daily',
  'public_workspace_state',
  'workspace_state',
  'app_settings',
  'admin_users',
];

const RESTORE_INSERT_ORDER = [
  'workspaces',
  'admin_users',
  'app_settings',
  'workspace_state',
  'public_workspace_state',
  'player_aliases',
  'integrations_scorers',
  'hall_of_fame_entries',
  'public_hall_of_fame_entries',
  'public_career_leaderboard',
  'public_site_views_daily',
  'app_supabase_usage_daily',
  'sim_pool_team_names',
  'sim_pool_people',
  'player_app_profiles',
  'player_app_devices',
  'player_app_calls',
  'player_account_merge_requests',
  'referee_auth_audit',
  'tournaments',
  'tournament_teams',
  'tournament_groups',
  'tournament_group_teams',
  'tournament_matches',
  'tournament_match_stats',
  'public_tournaments',
  'public_tournament_teams',
  'public_tournament_groups',
  'public_tournament_group_teams',
  'public_tournament_matches',
  'public_tournament_match_stats',
  'fanta_config',
  'fanta_teams',
  'fanta_rosters',
  'fanta_roster_change_notices',
  'fanta_archived_editions',
  'fanta_archived_standings',
  'fanta_archived_players',
];

const tableByName = new Map(TABLES.map((table) => [table.name, table]));

const isMissingRelationError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || error || '');
  const code = String((error as { code?: string })?.code || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find|relation .* not found/i.test(message);
};

const fetchTableRows = async (
  adminClient: SupabaseClient,
  table: BackupTable,
  workspaceId: string,
): Promise<TableExport | null> => {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = adminClient.from(table.name).select('*');
    if (table.scope === 'workspace') {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      if (isMissingRelationError(error)) return null;
      throw new Error(`${table.name}: ${error.message}`);
    }

    const page = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return { rows, rowCount: rows.length };
};

const exportDatabase = async (
  adminClient: SupabaseClient,
  workspaceId: string,
): Promise<DatabaseBackupPayload> => {
  const warnings: string[] = [];
  const tables: Record<string, TableExport> = {};

  for (const table of TABLES) {
    const exported = await fetchTableRows(adminClient, table, workspaceId);
    if (!exported) {
      warnings.push(`Tabella non trovata o non esportabile: ${table.name}`);
      continue;
    }
    tables[table.name] = exported;
  }

  return {
    exportType: 'flbp_application_database_backup',
    schemaVersion: 1,
    workspaceId,
    exportedAt: new Date().toISOString(),
    tables,
    warnings,
  };
};

const deleteTableRows = async (
  adminClient: SupabaseClient,
  table: BackupTable,
  workspaceId: string,
) => {
  if (table.scope === 'preserve') return 0;

  let query = adminClient.from(table.name).delete({ count: 'exact' });
  if (table.scope === 'workspace') {
    query = query.eq('workspace_id', workspaceId);
  } else {
    const deleteColumn = table.deleteColumn || 'id';
    query = query.not(deleteColumn, 'is', null);
  }

  const { count, error } = await query;
  if (error) {
    if (isMissingRelationError(error)) return 0;
    throw new Error(`${table.name}: ${error.message}`);
  }
  return count || 0;
};

const insertRows = async (
  adminClient: SupabaseClient,
  table: BackupTable,
  rows: Record<string, unknown>[],
) => {
  if (!rows.length) return 0;

  let inserted = 0;
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = table.scope === 'preserve'
      ? await adminClient.from(table.name).upsert(chunk)
      : await adminClient.from(table.name).insert(chunk);

    if (error) {
      if (isMissingRelationError(error)) return inserted;
      throw new Error(`${table.name}: ${error.message}`);
    }
    inserted += chunk.length;
  }
  return inserted;
};

const restoreDatabase = async (
  adminClient: SupabaseClient,
  workspaceId: string,
  backup: DatabaseBackupPayload,
) => {
  if (backup?.exportType !== 'flbp_application_database_backup' || backup.schemaVersion !== 1 || !backup.tables) {
    throw new Response(JSON.stringify({ ok: false, reason: 'File backup DB applicativo non valido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const backupWorkspaceId = normalizeText(backup.workspaceId) || workspaceId;
  if (backupWorkspaceId !== workspaceId) {
    throw new Response(JSON.stringify({ ok: false, reason: `Workspace backup non coerente: file=${backupWorkspaceId}, app=${workspaceId}.` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const summary: Record<string, { deleted: number; inserted: number }> = {};
  const warnings: string[] = [];

  // Restore is intentionally table-scoped and ordered. It is not a Postgres
  // transaction because Edge Functions cannot safely expose direct SQL access
  // from the browser; preflight export should always be kept before restore.
  for (const tableName of RESTORE_DELETE_ORDER) {
    const table = tableByName.get(tableName);
    if (!table || !backup.tables[tableName]) continue;
    try {
      const deleted = await deleteTableRows(adminClient, table, workspaceId);
      summary[tableName] = { deleted, inserted: 0 };
    } catch (error) {
      throw new Error(`Restore delete failed on ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const tableName of RESTORE_INSERT_ORDER) {
    const table = tableByName.get(tableName);
    const exported = backup.tables[tableName];
    if (!table || !exported) continue;
    try {
      const inserted = await insertRows(adminClient, table, exported.rows || []);
      summary[tableName] = { deleted: summary[tableName]?.deleted || 0, inserted };
    } catch (error) {
      throw new Error(`Restore insert failed on ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const tableName of Object.keys(backup.tables)) {
    if (!tableByName.has(tableName)) warnings.push(`Tabella nel backup ignorata perché non prevista dalla whitelist: ${tableName}`);
  }

  return { ok: true, workspaceId, summary, warnings };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'Method not allowed.' });

  const env = getEnv();
  try {
    ensureBaseEnv(env);
    const adminClient = createAdminClient(env);
    await ensureAdminUser(req, adminClient);

    const body = await req.json().catch(() => ({}));
    const action = normalizeText((body as Record<string, unknown>).action).toLowerCase();
    const workspaceId = normalizeText((body as Record<string, unknown>).workspaceId) || 'default';

    if (action === 'export') {
      const backup = await exportDatabase(adminClient, workspaceId);
      return json(200, { ok: true, backup });
    }

    if (action === 'restore') {
      const backup = (body as Record<string, unknown>).backup as DatabaseBackupPayload;
      const result = await restoreDatabase(adminClient, workspaceId, backup);
      return json(200, result);
    }

    return json(400, { ok: false, reason: 'Invalid action.' });
  } catch (error) {
    if (error instanceof Response) return error;
    return json(500, {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
});
