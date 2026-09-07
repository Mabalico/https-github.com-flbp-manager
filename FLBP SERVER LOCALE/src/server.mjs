import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateOperationalConfig } from './config.mjs';
import { LocalStore, VersionConflictError } from './store.mjs';
import { preserveAuthoritativeRefereeReports, resolveRefereeSecret } from './statePatch.mjs';
import { SupabaseSync } from './supabaseSync.mjs';
import { controlPage, controlPageScript } from './controlPage.mjs';
import { installRuntimeLogging } from './runtimeLogger.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(Object.assign(new Error('Payload troppo grande'), { statusCode: 413 }));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
    } catch {
      reject(Object.assign(new Error('JSON non valido'), { statusCode: 400 }));
    }
  });
  request.on('error', reject);
});

const sendJson = (response, status, body, extraHeaders = {}) => {
  const raw = Buffer.from(JSON.stringify(body));
  const acceptsGzip = String(response.flbpAcceptEncoding || '').includes('gzip');
  const payload = acceptsGzip && raw.length >= 1024 ? zlib.gzipSync(raw, { level: 6 }) : raw;
  const { vary: extraVary, ...headers } = extraHeaders;
  const vary = [payload !== raw ? 'Accept-Encoding' : '', extraVary || ''].filter(Boolean).join(', ');
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(payload !== raw ? { 'content-encoding': 'gzip' } : {}),
    ...headers,
    ...(vary ? { vary } : {}),
  });
  response.end(payload);
};

const operationId = (body) => {
  const value = String(body?.operationId || body?.operation_id || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw Object.assign(new Error('operationId obbligatorio: massimo 200 caratteri alfanumerici, punto, trattino, due punti o underscore.'), {
      statusCode: 400,
      code: 'FLBP_INVALID_OPERATION',
    });
  }
  return value;
};

export const createLocalServer = (overrides = {}) => {
  const config = loadConfig(overrides);
  const store = new LocalStore({ dataDir: config.dataDir, workspaceId: config.workspaceId, filename: overrides.databaseFilename || 'flbp-local.sqlite' });
  const sync = new SupabaseSync(config, store);
  const configErrors = validateOperationalConfig(config);
  let heartbeatTimer = null;
  let backupTimer = null;
  let publicLiveTimer = null;
  let secondaryBackupTimer = null;
  let heartbeatLoopInFlight = null;
  let secondaryBackupChain = Promise.resolve();
  let durableWriteChain = Promise.resolve();
  let secondaryBackedVersion = 0;
  if (config.secondaryBackupDir) {
    try {
      const reusable = store.findReusableSecondaryBackup(config.secondaryBackupDir);
      secondaryBackedVersion = Number(reusable?.version || 0);
    } catch {
      // Missing/unreadable media is handled fail-closed before the next write.
    }
  }
  const localAdminSessions = new Map();
  const localAdminSessionTtlMs = 12 * 60 * 60 * 1000;
  const rateBuckets = new Map();
  let maintenanceTimer = null;

  const cleanupEphemeralState = () => {
    const now = Date.now();
    for (const [token, expiresAt] of localAdminSessions) {
      if (Number(expiresAt || 0) <= now) localAdminSessions.delete(token);
    }
    for (const [key, bucket] of rateBuckets) {
      if (Number(bucket?.resetAt || 0) <= now) rateBuckets.delete(key);
    }
  };

  const requestIdentity = (request) => String(request.socket?.remoteAddress || 'unknown').toLowerCase();

  const consumeRateLimit = (request, bucketName, limit, suffix = '') => {
    const now = Date.now();
    const key = `${bucketName}:${requestIdentity(request)}:${String(suffix || '').slice(0, 160)}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw Object.assign(new Error('Troppe richieste: riprova tra poco.'), {
        statusCode: 429,
        code: 'FLBP_RATE_LIMITED',
        retryAfter,
      });
    }
  };

  const requireJsonRequest = (request) => {
    const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      throw Object.assign(new Error('Content-Type application/json obbligatorio.'), {
        statusCode: 415,
        code: 'FLBP_JSON_REQUIRED',
      });
    }
  };

  const originHeaders = (request) => {
    const origin = String(request.headers.origin || '');
    if (!origin) return {};
    const host = String(request.headers.host || '').trim().toLowerCase();
    const normalizedOrigin = origin.trim().toLowerCase();
    const isSameServerOrigin = !!host
      && (normalizedOrigin === `http://${host}` || normalizedOrigin === `https://${host}`);
    // Direct LAN/tunnel navigation is same-origin and must keep working when
    // Internet is unavailable even if the PC received a different DHCP IP.
    if (!isSameServerOrigin && !config.allowedOrigins.includes(origin)) return null;
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  };

  const isTrustedLoopbackRequest = (request) => {
    const remoteAddress = String(request.socket?.remoteAddress || '').toLowerCase();
    const host = String(request.headers.host || '').trim().toLowerCase();
    const forwarded = request.headers['cf-connecting-ip'] || request.headers['x-forwarded-for'] || request.headers.forwarded;
    const loopbackAddress = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
    const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    return loopbackAddress && loopbackHost && !forwarded;
  };

  const issueLocalAdminSession = () => {
    const token = `local-${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = Date.now() + localAdminSessionTtlMs;
    localAdminSessions.set(token, expiresAt);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  };

  const requireAdmin = (request) => {
    const auth = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = String(request.headers['x-flbp-local-token'] || auth || '');
    if (safeEqual(token, config.adminToken)) return true;
    const expiresAt = Number(localAdminSessions.get(token) || 0);
    if (expiresAt > Date.now()) return true;
    if (token) localAdminSessions.delete(token);
    return false;
  };

  const requireActive = () => {
    if (!store.isActive()) throw Object.assign(new Error('Server locale in standby'), { statusCode: 503 });
  };

  const requireWritable = () => {
    requireActive();
    const transition = store.getTransitionState();
    if (transition !== 'idle') {
      throw Object.assign(new Error('Server locale in transizione: la modifica resta nella coda durevole e verrà ritentata.'), {
        statusCode: 503,
        code: 'FLBP_LOCAL_DRAINING',
      });
    }
  };

  const requireAdminWriter = (request) => store.requireAdminWriterLease(request.headers['x-flbp-writer-id']);

  const ensureSecondaryTargetAvailable = () => {
    if (!config.secondaryBackupDir) {
      if (config.requireSecondaryBackup) {
        throw Object.assign(new Error('Collega il disco secondario configurato prima di salvare.'), { statusCode: 503, code: 'FLBP_SECONDARY_REQUIRED' });
      }
      return { available: false, disabled: true };
    }
    const dataRoot = path.parse(path.resolve(config.dataDir)).root.toLowerCase();
    const backupRoot = path.parse(path.resolve(config.secondaryBackupDir)).root.toLowerCase();
    if (config.requireSecondaryBackup && dataRoot === backupRoot) {
      throw Object.assign(new Error('La replica deve trovarsi su un volume diverso dal database principale.'), { statusCode: 503, code: 'FLBP_SECONDARY_SAME_VOLUME' });
    }
    try {
      fs.mkdirSync(config.secondaryBackupDir, { recursive: true });
      fs.accessSync(config.secondaryBackupDir, fs.constants.R_OK | fs.constants.W_OK);
      return { available: true };
    } catch {
      throw Object.assign(new Error('Disco secondario non disponibile o non scrivibile.'), { statusCode: 503, code: 'FLBP_SECONDARY_UNAVAILABLE' });
    }
  };

  const ensureSecondaryBackup = async (requiredVersion = null) => {
    const target = ensureSecondaryTargetAvailable();
    if (!target.available) return { backedUp: false, disabled: true };
    const requested = Number(requiredVersion ?? store.getCurrentMetadata()?.version ?? 0);
    const work = secondaryBackupChain.then(async () => {
      if (secondaryBackedVersion >= requested) return { backedUp: true, version: secondaryBackedVersion, reused: true };
      const result = await store.createSecondaryBackup(config.secondaryBackupDir, config.secondaryBackupRetention);
      if (result.backedUp) secondaryBackedVersion = Math.max(secondaryBackedVersion, Number(result.version || 0));
      if (secondaryBackedVersion < requested) throw new Error(`Replica SQLite secondaria incompleta: richiesta versione ${requested}, copiata ${secondaryBackedVersion}.`);
      return result;
    });
    secondaryBackupChain = work.catch(() => {});
    return work;
  };

  const runDurableWrite = (work) => {
    const current = durableWriteChain.then(work);
    durableWriteChain = current.catch(() => {});
    return current;
  };

  const runBackgroundHeartbeat = (label) => {
    if (heartbeatLoopInFlight) return heartbeatLoopInFlight;
    const work = Promise.resolve()
      .then(() => sync.heartbeat())
      .catch((error) => console.error(label, error.message))
      .finally(() => {
        if (heartbeatLoopInFlight === work) heartbeatLoopInFlight = null;
      });
    heartbeatLoopInFlight = work;
    return work;
  };

  const startTimers = () => {
    const firstStart = !heartbeatTimer && !backupTimer;
    if (!heartbeatTimer) heartbeatTimer = setInterval(() => void runBackgroundHeartbeat('[heartbeat]'), config.heartbeatIntervalMs);
    if (!backupTimer) backupTimer = setInterval(() => {
      if (store.isActive()) void (async () => {
        const cloudBackup = await sync.backupSnapshot();
        const secondary = await ensureSecondaryBackup(store.getCurrent()?.version);
        if (cloudBackup?.backedUp && cloudBackup?.verified && store.pendingOutboxCount() === 0 && (!config.requireSecondaryBackup || secondary?.backedUp)) {
          store.pruneHistory({ retentionDays: config.historyRetentionDays, minVersions: config.historyMinVersions });
          await sync.pruneCloudHistory({ retentionDays: config.historyRetentionDays, minVersions: config.historyMinVersions });
        }
      })().catch((error) => console.error('[backup]', error.message));
    }, config.fullBackupIntervalMs);
    if (!publicLiveTimer) publicLiveTimer = setInterval(() => {
      if (store.isActive()) void sync.publishLiveSnapshot().catch((error) => console.error('[public-live]', error.message));
    }, config.publicLiveIntervalMs);
    if (!secondaryBackupTimer && config.secondaryBackupDir) secondaryBackupTimer = setInterval(() => {
      void ensureSecondaryBackup().catch((error) => console.error('[secondary-backup]', error.message));
    }, config.secondaryBackupIntervalMs);
    if (!maintenanceTimer) maintenanceTimer = setInterval(cleanupEphemeralState, 60_000);
    if (firstStart) {
      const transition = store.getTransitionState();
      const ambiguous = ['activating', 'deactivating', 'deactivation-error', 'activation-error', 'restore-pending'].includes(transition);
      if (ambiguous && sync.isConfigured()) {
        void sync.reconcileTransition().then((result) => {
          if (result?.action === 'resume-local') {
            void sync.scheduleOutboxSync({ immediate: true });
            void sync.publishLiveSnapshot().catch((error) => console.error('[public-live:startup]', error.message));
            void ensureSecondaryBackup().catch((error) => console.error('[secondary-backup:startup]', error.message));
          }
        }).catch((error) => console.error('[reconcile:startup]', error.message));
      } else if (store.isActive()) {
        void runBackgroundHeartbeat('[heartbeat:startup]');
        void sync.scheduleOutboxSync({ immediate: true });
        void sync.publishLiveSnapshot().catch((error) => console.error('[public-live:startup]', error.message));
        void ensureSecondaryBackup().catch((error) => console.error('[secondary-backup:startup]', error.message));
      }
    }
  };

  const serveAppFile = (pathname, response) => {
    const relative = pathname === '/app/' ? 'index.html' : pathname.slice('/app/'.length);
    const candidate = path.resolve(config.webDist, relative || 'index.html');
    const root = path.resolve(config.webDist) + path.sep;
    const safeCandidate = candidate.startsWith(root) ? candidate : path.join(config.webDist, 'index.html');
    const finalPath = fs.existsSync(safeCandidate) && fs.statSync(safeCandidate).isFile() ? safeCandidate : path.join(config.webDist, 'index.html');
    if (!fs.existsSync(finalPath)) {
      sendJson(response, 404, { error: 'Build web non trovata. Esegui npm run build in FLBP ONLINE.' });
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(finalPath).toLowerCase()] || 'application/octet-stream', 'cache-control': finalPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    fs.createReadStream(finalPath).pipe(response);
  };

  const serveDistAsset = (pathname, response) => {
    const candidate = path.resolve(config.webDist, pathname.replace(/^\/+/, ''));
    const root = path.resolve(config.webDist) + path.sep;
    if (!candidate.startsWith(root) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return false;
    response.writeHead(200, { 'content-type': MIME[path.extname(candidate).toLowerCase()] || 'application/octet-stream', 'cache-control': candidate.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    fs.createReadStream(candidate).pipe(response);
    return true;
  };

  const server = http.createServer(async (request, response) => {
    response.flbpAcceptEncoding = request.headers['accept-encoding'] || '';
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const cors = originHeaders(request);
    if (cors == null) return sendJson(response, 403, { error: 'Origine non autorizzata' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-flbp-local-token,x-flbp-operation-id,x-flbp-writer-id' });
      return response.end();
    }

    try {
      if (request.method === 'POST') requireJsonRequest(request);
      if (request.method === 'POST' && url.pathname === '/control/local-session') {
        consumeRateLimit(request, 'local-session', 10, request.headers.origin || request.headers.host || 'loopback');
        if (!isTrustedLoopbackRequest(request)) {
          return sendJson(response, 403, { error: 'Sessione locale disponibile solo dal PC server.' }, cors);
        }
        return sendJson(response, 200, { ok: true, ...issueLocalAdminSession() }, { ...cors, 'cache-control': 'no-store' });
      }
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
        });
        return response.end(controlPage);
      }
      if (request.method === 'GET' && url.pathname === '/control.js') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(controlPageScript);
      }
      if (request.method === 'GET' && url.pathname.startsWith('/app/')) return serveAppFile(url.pathname, response);
      if (request.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/control/') && serveDistAsset(url.pathname, response)) return;
      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/v1/discovery')) {
        const { databaseFile: _databaseFile, ...publicStatus } = store.status();
        return sendJson(response, 200, { ok: true, nodeId: sync.nodeId, publicUrl: config.publicUrl || null, ...publicStatus, configErrors }, cors);
      }
      if (request.method === 'GET' && url.pathname === `/api/v1/public/workspace/${encodeURIComponent(config.workspaceId)}`) {
        requireActive();
        const metadata = store.getCurrentMetadata();
        if (!metadata) return sendJson(response, 404, { error: 'Snapshot non inizializzato' }, cors);
        const etag = `"${metadata.checksum}-${metadata.version}"`;
        if (request.headers['if-none-match'] === etag) {
          response.writeHead(304, { ...cors, etag, 'cache-control': 'no-cache' });
          return response.end();
        }
        const current = store.getPublicCurrent();
        return sendJson(response, 200, { workspace_id: config.workspaceId, state: current.publicState, updated_at: current.updatedAt, version: current.version, primary_epoch: current.primaryEpoch }, { ...cors, etag, 'cache-control': 'no-cache' });
      }
      if (request.method === 'GET' && url.pathname === `/api/v1/admin/workspace/${encodeURIComponent(config.workspaceId)}`) {
        requireActive();
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        const current = store.getCurrent();
        if (!current) return sendJson(response, 404, { error: 'Snapshot non inizializzato' }, cors);
        const etag = `"${current.checksum}-${current.version}-admin"`;
        if (request.headers['if-none-match'] === etag) {
          response.writeHead(304, { ...cors, etag, 'cache-control': 'no-cache' });
          return response.end();
        }
        return sendJson(response, 200, { workspace_id: config.workspaceId, state: current.state, updated_at: current.updatedAt, version: current.version, primary_epoch: current.primaryEpoch }, { ...cors, etag, 'cache-control': 'no-cache' });
      }
      if (request.method === 'POST' && url.pathname.startsWith('/api/v1/admin/write-lease/')) {
        consumeRateLimit(request, 'admin-write-lease', 240);
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        const body = await readBody(request);
        if (url.pathname.endsWith('/acquire')) {
          const out = store.acquireAdminWriterLease({
            holderId: body.holderId,
            holderLabel: body.holderLabel,
            takeover: body.takeover === true,
            ttlMs: 90_000,
          });
          return sendJson(response, 200, out, cors);
        }
        if (url.pathname.endsWith('/heartbeat')) {
          const out = store.acquireAdminWriterLease({ holderId: body.holderId, holderLabel: '', takeover: false, ttlMs: 90_000 });
          return sendJson(response, 200, out, cors);
        }
        if (url.pathname.endsWith('/release')) {
          return sendJson(response, 200, store.releaseAdminWriterLease(body.holderId), cors);
        }
      }
      if (request.method === 'POST' && url.pathname === `/api/v1/admin/workspace/${encodeURIComponent(config.workspaceId)}/commit`) {
        consumeRateLimit(request, 'authenticated-write', 240);
        requireWritable();
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        requireAdminWriter(request);
        ensureSecondaryTargetAvailable();
        const body = await readBody(request);
        const committed = await runDurableWrite(async () => {
          const result = store.commitSnapshot({ state: body.state, publicState: body.publicState, operationId: operationId(body), baseVersion: body.baseVersion, force: false, source: 'admin' });
          void sync.scheduleOutboxSync();
          sync.scheduleLivePublish();
          await ensureSecondaryBackup(result.version);
          return result;
        });
        return sendJson(response, 200, { ok: true, updated_at: committed.updatedAt, version: committed.version, operation_id: committed.operationId, idempotent: committed.idempotent, primary_epoch: committed.primaryEpoch }, cors);
      }
      if (request.method === 'POST' && url.pathname === `/api/v1/admin/workspace/${encodeURIComponent(config.workspaceId)}/recover-local`) {
        consumeRateLimit(request, 'authenticated-write', 30, 'recover-local');
        requireWritable();
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        requireAdminWriter(request);
        ensureSecondaryTargetAvailable();
        const body = await readBody(request);
        if (body.confirmLocalRecovery !== true) {
          return sendJson(response, 400, { error: 'Conferma esplicita del recupero locale mancante', code: 'FLBP_LOCAL_RECOVERY_CONFIRM_REQUIRED' }, cors);
        }
        const before = store.getCurrent();
        if (!before) return sendJson(response, 404, { error: 'Snapshot non inizializzato' }, cors);
        const committed = await runDurableWrite(async () => {
          // The pre-recovery snapshot must be independently readable before
          // creating the replacement version. Snapshot history remains in
          // SQLite as an additional rollback point.
          await ensureSecondaryBackup(before.version);
          const protectedRecovery = preserveAuthoritativeRefereeReports({
            currentState: before.state,
            incomingState: body.state,
          });
          const result = store.commitSnapshot({
            state: protectedRecovery.state,
            publicState: body.publicState,
            operationId: operationId(body),
            baseVersion: body.baseVersion,
            force: false,
            source: 'admin-local-recovery',
          });
          void sync.scheduleOutboxSync();
          sync.scheduleLivePublish();
          await ensureSecondaryBackup(result.version);
          return { result, preservedMatchIds: protectedRecovery.preservedMatchIds };
        });
        return sendJson(response, 200, {
          ok: true,
          state: committed.result.state,
          updated_at: committed.result.updatedAt,
          version: committed.result.version,
          operation_id: committed.result.operationId,
          idempotent: committed.result.idempotent,
          primary_epoch: committed.result.primaryEpoch,
          previous_version: before.version,
          preserved_referee_match_ids: committed.preservedMatchIds,
        }, cors);
      }
      if (request.method === 'POST' && url.pathname === `/api/v1/referee/workspace/${encodeURIComponent(config.workspaceId)}/auth`) {
        requireActive();
        const body = await readBody(request);
        consumeRateLimit(request, 'referee-auth', 20, body.tournamentId);
        const current = store.getCurrent();
        const expected = resolveRefereeSecret(current?.state, process.env.FLBP_REFEREE_PASSWORD || '');
        const tournamentOk = String(current?.state?.tournament?.id || '') === String(body.tournamentId || '');
        return sendJson(response, 200, { ok: tournamentOk && safeEqual(body.refereePassword, expected), auth_version: current?.state?.tournament?.refereesAuthVersion || null, updated_at: current?.updatedAt || null }, cors);
      }
      if (request.method === 'POST' && url.pathname === `/api/v1/referee/workspace/${encodeURIComponent(config.workspaceId)}/match-result`) {
        requireWritable();
        const body = await readBody(request);
        const current = store.getCurrent();
        const expected = resolveRefereeSecret(current?.state, process.env.FLBP_REFEREE_PASSWORD || '');
        if (!safeEqual(body.refereePassword, expected)) {
          consumeRateLimit(request, 'referee-auth', 20, body.tournamentId);
          return sendJson(response, 401, { error: 'Password arbitri non valida' }, cors);
        }
        consumeRateLimit(request, 'authenticated-write', 240, body.tournamentId);
        ensureSecondaryTargetAvailable();
        const committed = await runDurableWrite(async () => {
          const result = store.commitMatchPatch({ tournamentId: body.tournamentId, matchId: body.matchId, matches: body.matches, operationId: operationId(body), source: 'referee' });
          void sync.scheduleOutboxSync();
          sync.scheduleLivePublish();
          await ensureSecondaryBackup(result.version);
          return result;
        });
        return sendJson(response, 200, { ok: true, updated_at: committed.updatedAt, version: committed.version, matches_count: Array.isArray(body.matches) ? body.matches.length : 0, auth_version: committed.state?.tournament?.refereesAuthVersion || null, idempotent: committed.idempotent, primary_epoch: committed.primaryEpoch }, cors);
      }
      if (request.method === 'POST' && url.pathname === `/api/v1/referee/workspace/${encodeURIComponent(config.workspaceId)}/admin-match-result`) {
        consumeRateLimit(request, 'authenticated-write', 240);
        requireWritable();
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        requireAdminWriter(request);
        ensureSecondaryTargetAvailable();
        const body = await readBody(request);
        const committed = await runDurableWrite(async () => {
          const result = store.commitMatchPatch({ tournamentId: body.tournamentId, matchId: body.matchId, matches: body.matches, operationId: operationId(body), source: 'admin' });
          void sync.scheduleOutboxSync();
          sync.scheduleLivePublish();
          await ensureSecondaryBackup(result.version);
          return result;
        });
        return sendJson(response, 200, { ok: true, updated_at: committed.updatedAt, version: committed.version, matches_count: Array.isArray(body.matches) ? body.matches.length : 0, idempotent: committed.idempotent, primary_epoch: committed.primaryEpoch }, cors);
      }
      if (request.method === 'POST' && url.pathname.startsWith('/control/')) {
        consumeRateLimit(request, 'control', 30);
        if (!requireAdmin(request)) return sendJson(response, 401, { error: 'Token Admin locale non valido' }, cors);
        if (configErrors.length) return sendJson(response, 400, { error: configErrors.join('\n') }, cors);
        if (url.pathname === '/control/resume-restored') {
          if (!store.isActive() || store.getTransitionState() !== 'restore-pending') {
            throw Object.assign(new Error('Nessun backup attivo in attesa di conferma.'), { statusCode: 409, code: 'FLBP_RESTORE_NOT_PENDING' });
          }
          if (!sync.isConfigured()) {
            throw Object.assign(new Error('Supabase deve essere raggiungibile per riconfermare il nodo ripristinato.'), { statusCode: 503, code: 'FLBP_RESTORE_NEEDS_CLOUD' });
          }
          const reconciliation = await sync.reconcileTransition();
          if (reconciliation?.action !== 'resume-local') throw new Error('Supabase non ha riconfermato la leadership del backup.');
          void sync.scheduleOutboxSync();
          return sendJson(response, 200, { ok: true, resumed: true, reconciliation, ...store.status() }, cors);
        }
        if (url.pathname === '/control/reconcile') {
          const transition = store.getTransitionState();
          if (transition === 'idle') return sendJson(response, 200, { ok: true, alreadyResolved: true, ...store.status() }, cors);
          const reconciliation = await sync.reconcileTransition();
          if (reconciliation?.action === 'resume-local') {
            void sync.scheduleOutboxSync({ immediate: true });
            void sync.publishLiveSnapshot().catch((error) => console.error('[public-live:reconcile]', error.message));
          }
          return sendJson(response, 200, { ok: true, reconciliation, ...store.status() }, cors);
        }
        if (url.pathname === '/control/activate') {
          const currentTransition = store.getTransitionState();
          if (store.isActive()) {
            if (currentTransition === 'idle') return sendJson(response, 200, { ok: true, alreadyActive: true, ...store.status() }, cors);
            throw Object.assign(new Error(`Impossibile attivare durante la transizione ${currentTransition}.`), { statusCode: 409, code: 'FLBP_LOCAL_TRANSITION' });
          }
          ensureSecondaryTargetAvailable();
          store.setTransitionState('activating');
          try {
            let activated;
            if (sync.isConfigured()) {
              const cloud = await sync.pullCloudSnapshot();
              if (!cloud) throw new Error('Supabase non contiene uno snapshot iniziale: attivazione locale rifiutata.');
              store.validateCloudSnapshotImport(cloud);
              activated = await sync.activate(cloud);
              store.importCloudSnapshot(cloud);
              await ensureSecondaryBackup(store.getCurrent()?.version);
              store.setActive(true, activated.epoch);
              store.setMeta('pending_primary_epoch', '');
            } else {
              if (!store.getCurrent()) throw new Error('DB locale vuoto: importa prima uno snapshot iniziale.');
              await ensureSecondaryBackup(store.getCurrent()?.version);
              store.setActive(true, 1);
              activated = { ok: true, epoch: 1, offlineOnly: true };
            }
            store.setTransitionState('idle');
            startTimers();
            void runBackgroundHeartbeat('[heartbeat:activation]');
            void sync.scheduleOutboxSync({ immediate: true });
            void sync.publishLiveSnapshot().catch((error) => console.error('[public-live:activation]', error.message));
            return sendJson(response, 200, { ok: true, activated, ...store.status() }, cors);
          } catch (error) {
            store.setTransitionState('activation-error');
            throw error;
          }
        }
        if (url.pathname === '/control/backup') {
          const result = await sync.backupSnapshot();
          const secondary = await ensureSecondaryBackup(store.getCurrent()?.version);
          const canPrune = !!result?.backedUp && !!result?.verified && store.pendingOutboxCount() === 0 && (!config.requireSecondaryBackup || !!secondary?.backedUp);
          const retention = canPrune
            ? store.pruneHistory({ retentionDays: config.historyRetentionDays, minVersions: config.historyMinVersions })
            : { skipped: true, reason: 'backup-completo-non-verificato' };
          const cloudRetention = canPrune
            ? await sync.pruneCloudHistory({ retentionDays: config.historyRetentionDays, minVersions: config.historyMinVersions })
            : { skipped: true, reason: 'backup-completo-non-verificato' };
          return sendJson(response, 200, { ok: true, result, secondary, retention, cloudRetention, ...store.status() }, cors);
        }
        if (url.pathname === '/control/sync-normalized') {
          const result = await sync.syncLiveNormalizedSnapshot();
          return sendJson(response, 200, { ok: true, normalized: result, ...store.status() }, cors);
        }
        if (url.pathname === '/control/deactivate') {
          const currentTransition = store.getTransitionState();
          if (!store.isActive() && currentTransition === 'idle') {
            return sendJson(response, 200, { ok: true, alreadyInactive: true, ...store.status() }, cors);
          }
          if (sync.isConfigured()) {
            const heartbeat = await sync.heartbeat({ force: true });
            if (!heartbeat?.accepted) throw new Error('Supabase non ha confermato la leadership locale: disattivazione non avviata.');
          }
          store.setTransitionState('deactivating');
          try {
            const result = await sync.deactivate();
            store.setTransitionState('idle');
            return sendJson(response, 200, { ok: true, result, ...store.status() }, cors);
          } catch (error) {
            // Persistita in SQLite: anche dopo un crash/riavvio nessuna nuova
            // scrittura viene accettata finché l'esito remoto non è risolto.
            store.setTransitionState('deactivation-error');
            throw error;
          }
        }
      }
      return sendJson(response, 404, { error: 'Endpoint non trovato' }, cors);
    } catch (error) {
      const status = error instanceof VersionConflictError ? 409 : Number(error?.statusCode || 500);
      return sendJson(response, status, { error: error?.message || String(error), code: error?.code || null, currentVersion: error?.currentVersion ?? null }, {
        ...(cors || {}),
        ...(error?.retryAfter ? { 'retry-after': String(error.retryAfter) } : {}),
      });
    }
  });

  startTimers();
  return {
    config,
    store,
    sync,
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => resolve(server.address()));
    }),
    close: () => new Promise((resolve) => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (backupTimer) clearInterval(backupTimer);
      if (publicLiveTimer) clearInterval(publicLiveTimer);
      if (secondaryBackupTimer) clearInterval(secondaryBackupTimer);
      if (maintenanceTimer) clearInterval(maintenanceTimer);
      sync.cancelScheduledOutboxSync();
      sync.cancelScheduledLivePublish();
      server.close(() => {
        void durableWriteChain.finally(() => {
          store.close();
          resolve();
        });
      });
    }),
  };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  installRuntimeLogging({
    logFile: process.env.FLBP_RUNTIME_LOG_FILE || path.join(serverRoot, 'logs', 'server.log'),
  });
  const app = createLocalServer();
  app.listen().then(() => {
    console.log(`FLBP Server Locale: http://localhost:${app.config.port}`);
    console.log(`DB: ${app.store.filename}`);
    if (validateOperationalConfig(app.config).length) console.log('Configurazione incompleta: apri il pannello per i dettagli.');
  }).catch((error) => {
    console.error(error);
    // startTimers() is initialized before listen so recovery can begin at
    // startup. If the HTTP port cannot be acquired those timers would keep a
    // dead, unreachable process alive and Task Scheduler could not restart it.
    process.exit(1);
  });
}
