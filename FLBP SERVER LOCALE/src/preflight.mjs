import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadConfig, validateOperationalConfig } from './config.mjs';
import { buildSupabaseServerHeaders } from './supabaseSync.mjs';

const config = loadConfig();
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail || '') });

const safeResponseBody = async (response) => {
  try {
    const text = await response.text();
    return text
      .replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]')
      .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[secret-key]')
      .slice(0, 500);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const serviceHeaders = () => buildSupabaseServerHeaders(config.supabaseServiceRoleKey);

let supabaseCircuitOpen = false;
const timedFetch = async (url, init = {}, timeoutMs = 8_000) => {
  if (supabaseCircuitOpen) {
    throw new Error('Controllo saltato: Supabase non ha risposto al primo probe entro 8 secondi.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') supabaseCircuitOpen = true;
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const operationalErrors = validateOperationalConfig(config);
add('Configurazione server', operationalErrors.length === 0, operationalErrors.join(' ') || 'Valori obbligatori presenti.');
add('Node.js 24+', Number(process.versions.node.split('.')[0]) >= 24, process.version);
add('Build React locale', fs.existsSync(path.join(config.webDist, 'index.html')), config.webDist);

try {
  const dataParent = fs.existsSync(config.dataDir) ? config.dataDir : path.dirname(config.dataDir);
  fs.accessSync(dataParent, fs.constants.R_OK | fs.constants.W_OK);
  add('Cartella SQLite', true, config.dataDir);
} catch (error) {
  add('Cartella SQLite', false, error?.message || error);
}

if (config.secondaryBackupDir) {
  try {
    const secondaryParent = fs.existsSync(config.secondaryBackupDir) ? config.secondaryBackupDir : path.dirname(config.secondaryBackupDir);
    fs.accessSync(secondaryParent, fs.constants.R_OK | fs.constants.W_OK);
    const primaryRoot = path.parse(config.dataDir).root.toLowerCase();
    const secondaryRoot = path.parse(config.secondaryBackupDir).root.toLowerCase();
    add('Replica SQLite secondaria', primaryRoot !== secondaryRoot, primaryRoot !== secondaryRoot
      ? config.secondaryBackupDir
      : 'La replica è scrivibile ma si trova sullo stesso volume del DB primario.');
  } catch (error) {
    add('Replica SQLite secondaria', false, error?.message || error);
  }
} else {
  add('Replica SQLite secondaria', !config.requireSecondaryBackup, config.requireSecondaryBackup
    ? 'Supporto USB/SSD obbligatorio non configurato.'
    : 'Non configurata (consentito soltanto in sviluppo).');
}

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  add('Supabase control plane', false, 'SUPABASE_URL o Secret key server assente.');
} else {
  const workspace = encodeURIComponent(config.workspaceId);
  try {
    const response = await timedFetch(
      `${config.supabaseUrl}/rest/v1/workspace_state?workspace_id=eq.${workspace}&select=workspace_id,version,last_operation_id&limit=1`,
      { headers: serviceHeaders() },
    );
    const body = response.ok ? await response.json() : null;
    add('Snapshot Supabase', response.ok && Array.isArray(body) && body.length === 1, response.ok ? `workspace=${config.workspaceId}, version=${body?.[0]?.version ?? '—'}` : await safeResponseBody(response));
  } catch (error) {
    add('Snapshot Supabase', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_resolve_data_plane`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_workspace_id: config.workspaceId }),
    });
    const body = response.ok ? await response.json() : null;
    const authority = body?.mode === 'local' ? 'SQLite locale' : body?.mode === 'cloud' ? 'Supabase' : 'nessuna (recovery)';
    const publicReads = body?.public_read_mode === 'local' ? 'nodo locale' : 'mirror Supabase';
    add('RPC coordinatore', response.ok && ['cloud', 'local', 'recovery'].includes(body?.mode), response.ok
      ? `autorità=${authority}, letture pubbliche=${publicReads}, epoch=${body?.epoch ?? 0}, lease=${body?.lease_expires_at || '—'}`
      : await safeResponseBody(response));
  } catch (error) {
    add('RPC coordinatore', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_local_reconcile_data_plane`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_node_id: '',
        p_epoch: 0,
        p_local_version: 0,
        p_local_operation_id: null,
        p_ttl_seconds: 60,
      }),
    });
    const detail = await safeResponseBody(response);
    const missing = response.status === 404 || detail.includes('PGRST202') || detail.includes('Could not find the function');
    const callable = !missing && detail.includes('node_id mancante');
    add('RPC riconciliazione', callable, callable ? 'Funzione service-only presente; prova terminata prima di qualsiasi modifica.' : detail);
  } catch (error) {
    add('RPC riconciliazione', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_local_prune_workspace_history`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_node_id: 'preflight-non-writing-probe',
        p_epoch: 0,
        p_retention_days: 90,
        p_min_versions: 2000,
      }),
    });
    const detail = await safeResponseBody(response);
    const missing = response.status === 404 || detail.includes('PGRST202') || detail.includes('Could not find the function');
    const callable = !missing && (detail.includes('FLBP_EPOCH_FENCED') || detail.includes('retention rifiutata'));
    add('RPC retention cloud', callable, callable ? 'Funzione service-only presente; epoch invalido, nessuna cancellazione eseguita.' : detail);
  } catch (error) {
    add('RPC retention cloud', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_local_activate_data_plane_v3`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_node_id: '',
        p_base_url: null,
        p_public_read_mode: 'cloud',
        p_expected_cloud_version: 0,
        p_expected_cloud_operation_id: null,
        p_expected_cloud_state: {},
        p_expected_public_state: {},
        p_expected_plane_epoch: 0,
        p_expected_recovered_version: 0,
        p_local_baseline_operation_id: 'preflight-baseline',
        p_ttl_seconds: 60,
      }),
    });
    const detail = await safeResponseBody(response);
    const missing = response.status === 404 || detail.includes('PGRST202') || detail.includes('Could not find the function');
    const callable = !missing && detail.includes('node_id mancante');
    add('RPC attivazione locale v3', callable, callable ? 'Modalità senza tunnel e baseline legacy disponibili.' : detail);
  } catch (error) {
    add('RPC attivazione locale v3', false, error?.message || error);
  }

  try {
    const response = await timedFetch(
      `${config.supabaseUrl}/rest/v1/flbp_local_operation_log?workspace_id=eq.${workspace}&select=local_version&limit=1`,
      { headers: serviceHeaders() },
    );
    add('Journal remoto', response.ok, response.ok ? 'Tabella raggiungibile con chiave server.' : await safeResponseBody(response));
  } catch (error) {
    add('Journal remoto', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_local_append_operations_v2`, {
      method: 'POST',
      headers: serviceHeaders(),
      // Epoch 0 viene rifiutato prima di qualsiasi scrittura: qui interessa
      // distinguere una funzione presente da PGRST202/funzione assente.
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_node_id: 'preflight-non-writing-probe',
        p_epoch: 0,
        p_operations: [],
        p_state: {},
      }),
    });
    const detail = await safeResponseBody(response);
    const missing = response.status === 404 || detail.includes('PGRST202') || detail.includes('Could not find the function');
    const callable = !missing && detail.includes('primary_epoch mancante');
    add('RPC journal transazionale v2', callable, callable ? 'Funzione caricata e invocabile con chiave server.' : detail);
  } catch (error) {
    add('RPC journal transazionale v2', false, error?.message || error);
  }

  try {
    const response = await timedFetch(`${config.supabaseUrl}/rest/v1/rpc/flbp_admin_push_workspace_state_v2`, {
      method: 'POST',
      headers: serviceHeaders(),
      // operation_id vuoto forza un errore di validazione prima di lease/write.
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_state: {},
        p_public_state: {},
        p_base_updated_at: null,
        p_force: false,
        p_lease_holder: null,
        p_operation_id: '',
      }),
    });
    const detail = await safeResponseBody(response);
    const missing = response.status === 404 || detail.includes('PGRST202') || detail.includes('Could not find the function');
    const callable = !missing && detail.includes('FLBP_INVALID_OPERATION');
    add('RPC Admin idempotente', callable, callable ? 'Funzione v2 caricata e invocabile con chiave server.' : detail);
  } catch (error) {
    add('RPC Admin idempotente', false, error?.message || error);
  }
}

if (!config.publicUrl) {
  add('Instradamento pubblico', true, 'Mirror Supabase: tunnel non richiesto per Admin e TV sulla LAN.');
} else {
  try {
    const response = await timedFetch(`${config.publicUrl}/health`, { headers: { Accept: 'application/json' } });
    const body = response.ok ? await response.json() : null;
    add('Instradamento pubblico', response.ok && body?.ok === true, response.ok ? `Tunnel opzionale raggiungibile; nodo ${body?.nodeId || 'raggiungibile'}; active=${!!body?.active}` : await safeResponseBody(response));
  } catch (error) {
    add('Instradamento pubblico', false, error?.message || error);
  }
}

const width = Math.max(...checks.map((check) => check.name.length));
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(width)}  ${check.detail}`);
}
const failures = checks.filter((check) => !check.ok);
console.log(`\n${checks.length - failures.length}/${checks.length} controlli superati.`);
if (failures.length) process.exitCode = 1;
