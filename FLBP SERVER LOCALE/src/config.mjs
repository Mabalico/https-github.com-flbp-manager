import path from 'node:path';
import process from 'node:process';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env is optional for tests and the first-run status page.
}

const intFromEnv = (name, fallback, min, max) => {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const csvFromEnv = (name, fallback = []) => {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
};

export const loadConfig = (overrides = {}) => {
  const cwd = process.cwd();
  return {
    host: process.env.FLBP_HOST || '0.0.0.0',
    port: intFromEnv('FLBP_PORT', 8787, 1, 65535),
    workspaceId: String(process.env.FLBP_WORKSPACE_ID || 'default').trim() || 'default',
    dataDir: path.resolve(cwd, process.env.FLBP_DATA_DIR || './data'),
    secondaryBackupDir: String(process.env.FLBP_SECONDARY_BACKUP_DIR || '').trim()
      ? path.resolve(cwd, String(process.env.FLBP_SECONDARY_BACKUP_DIR).trim())
      : '',
    secondaryBackupRetention: intFromEnv('FLBP_SECONDARY_BACKUP_RETENTION', 24, 2, 500),
    secondaryBackupIntervalMs: intFromEnv('FLBP_SECONDARY_BACKUP_INTERVAL_MS', 300_000, 60_000, 86_400_000),
    webDist: path.resolve(cwd, process.env.FLBP_WEB_DIST || '../FLBP ONLINE/dist'),
    adminToken: String(process.env.FLBP_LOCAL_ADMIN_TOKEN || '').trim(),
    allowedOrigins: csvFromEnv('FLBP_ALLOWED_ORIGINS', [
      'http://localhost:8787',
      'http://127.0.0.1:8787',
    ]),
    publicUrl: String(process.env.FLBP_LOCAL_PUBLIC_URL || '').trim().replace(/\/$/, ''),
    supabaseUrl: String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    // SUPABASE_SECRET_KEY is the current server-side key format. Keep the
    // legacy variable as a rollout fallback for existing installations.
    supabaseServiceRoleKey: String(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ).trim(),
    fullBackupIntervalMs: intFromEnv('FLBP_FULL_BACKUP_INTERVAL_MS', 1_800_000, 60_000, 86_400_000),
    heartbeatIntervalMs: intFromEnv('FLBP_HEARTBEAT_INTERVAL_MS', 15_000, 5_000, 120_000),
    leaseTtlSeconds: intFromEnv('FLBP_LEASE_TTL_SECONDS', 60, 30, 300),
    nodeId: String(process.env.FLBP_NODE_ID || '').trim(),
    ...overrides,
  };
};

export const validateOperationalConfig = (config) => {
  const errors = [];
  if (!config.adminToken || config.adminToken.length < 32) {
    errors.push('FLBP_LOCAL_ADMIN_TOKEN deve contenere almeno 32 caratteri.');
  }
  if (!!config.supabaseUrl !== !!config.supabaseServiceRoleKey) {
    errors.push('SUPABASE_URL e SUPABASE_SECRET_KEY (o la legacy SUPABASE_SERVICE_ROLE_KEY) devono essere configurati insieme.');
  }
  if (config.secondaryBackupDir && path.resolve(config.secondaryBackupDir) === path.resolve(config.dataDir)) {
    errors.push('FLBP_SECONDARY_BACKUP_DIR deve essere diverso da FLBP_DATA_DIR e preferibilmente su un altro disco.');
  }
  try {
    if (config.publicUrl && new URL(config.publicUrl).protocol !== 'https:') {
      errors.push('FLBP_LOCAL_PUBLIC_URL deve essere HTTPS.');
    }
  } catch {
    errors.push('FLBP_LOCAL_PUBLIC_URL non è un URL valido.');
  }
  return errors;
};
