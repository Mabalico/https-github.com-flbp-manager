import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const requirePattern = (relative, pattern, message) => {
  if (!pattern.test(read(relative))) failures.push(`${relative}: ${message}`);
};
const forbidPattern = (relative, pattern, message) => {
  if (pattern.test(read(relative))) failures.push(`${relative}: ${message}`);
};

const remoteRepository = read('services/repository/RemoteRepository.ts');
forbidPattern(
  'services/repository/RemoteRepository.ts',
  /addEventListener\(['"](?:beforeunload|pagehide)['"][\s\S]{0,180}flushNow/,
  'una scrittura di rete non deve partire durante il teardown della pagina',
);
requirePattern(
  'services/repository/RemoteRepository.ts',
  /isAdminWriteBlockedByLease\(\)[\s\S]{0,180}must never create a draft/,
  'la finestra passiva deve essere bloccata prima della creazione della bozza',
);
requirePattern(
  'services/repository/RemoteRepository.ts',
  /!this\.isAdminViewActive\(\)[\s\S]{0,260}must never create a recoverable full-workspace Admin draft/,
  'le viste arbitro/pubblico non devono produrre snapshot Admin completi da dati parziali',
);
requirePattern(
  'services/repository/RemoteRepository.ts',
  /activeFlushOperationId[\s\S]{0,14000}completedLatestDraft[\s\S]{0,900}markAdminSyncPending/,
  'una risposta di rete precedente non deve cancellare una modifica Admin più recente',
);
if (!remoteRepository.includes('acknowledgeRemoteDraftCache')) {
  failures.push('RemoteRepository deve archiviare come synced il checkpoint confermato.');
}

const app = read('App.tsx');
const checkpointStart = app.indexOf('const checkpointLocally');
const checkpointEnd = app.indexOf('const onLiveStateCommitted', checkpointStart);
const checkpointBlock = checkpointStart >= 0 && checkpointEnd > checkpointStart ? app.slice(checkpointStart, checkpointEnd) : '';
if (!checkpointBlock) failures.push('App.tsx: checkpoint lifecycle non trovato.');
if (/repo\.flush|flushAutoStructuredSync/.test(checkpointBlock)) {
  failures.push('App.tsx: il checkpoint lifecycle contiene ancora una scrittura di rete.');
}

requirePattern(
  'services/repository/remoteDraftCache.ts',
  /readRestorableRemoteDraftCache[\s\S]{0,400}return entry/,
  'una bozza stale deve restare recuperabile',
);
requirePattern(
  'services/repository/RemoteRepository.ts',
  /restoreIndexedDbDraft[\s\S]{0,500}listDurableStateCheckpoints[\s\S]{0,2200}this\.emit/,
  'una bozza presente solo in IndexedDB deve essere riletta e riproposta dopo il reload',
);
requirePattern(
  'services/repository/remoteDraftCache.ts',
  /ensureRemoteDraftCacheDurable[\s\S]{0,400}readDurableStateCheckpoint/,
  'la conferma di durabilità deve riconoscere anche un checkpoint presente solo in IndexedDB',
);
requirePattern(
  'components/RefereesArea.tsx',
  /await enqueueRefereeReport[\s\S]{0,900}pushRefereeMatchResults/,
  'il referto deve completare il commit durevole in outbox prima della chiamata remota',
);
requirePattern(
  'components/RefereesArea.tsx',
  /pushRefereeMatchResults\(\{[\s\S]{0,500}operationId: queuedReport\.operationId/,
  'la chiamata referto deve riutilizzare l’operationId dell’outbox',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /mode in \('cloud', 'local', 'recovery'\)/,
  'il coordinatore deve avere uno stato recovery esplicito',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /FLBP_EPOCH_FENCED/,
  'il backup locale deve essere fenced dall’epoch',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /p_expected_cloud_version bigint[\s\S]{0,1400}pg_advisory_xact_lock[\s\S]{0,1500}FLBP_ACTIVATION_CHANGED/,
  'l’attivazione deve confrontare lo snapshot scaricato sotto lo stesso lock delle scritture cloud',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /flbp_local_deactivate_data_plane\([\s\S]{0,1800}flbp_local_backup_data_plane[\s\S]{0,800}mode = 'cloud'/,
  'backup finale e ritorno al cloud devono avvenire nella stessa transazione',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /flbp\.local_backup_context[\s\S]{0,900}node_id[\s\S]{0,500}epoch/,
  'una service role generica non deve poter aggirare il fencing del nodo locale',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /flbp_admin_force_cloud_failover[\s\S]{0,2600}lease_expires_at > now\(\)[\s\S]{0,1200}FLBP_RECOVERY_JOURNAL_PENDING[\s\S]{0,500}v_plane\.epoch \+ 1/,
  'il failover deve attendere la lease, rifiutare journal non riprodotti e revocare l’epoch perso',
);
requirePattern(
  'supabase/migrations/20260801000100_local_data_plane_and_version_history.sql',
  /flbp_admin_push_workspace_state_v2[\s\S]{0,2600}FLBP_OPERATION_COLLISION[\s\S]{0,5000}v_operation_id[\s\S]{0,500}last_operation_id = excluded\.last_operation_id/,
  'le scritture Admin cloud devono essere idempotenti e rilevare collisioni di operationId',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/supabaseSync.mjs',
  /replayCloudOperationJournal[\s\S]{0,2200}Journal remoto incompleto/,
  'un nodo sostitutivo deve riprodurre il journal e rifiutare i buchi di versione',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/supabaseSync.mjs',
  /const storedEpoch = \(store\)[\s\S]{0,320}store\.getMeta\('pending_primary_epoch'[\s\S]{0,180}store\.getMeta\('primary_epoch'/,
  'identità del nodo ed epoch devono sopravvivere al riavvio',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/supabaseSync.mjs',
  /this\.nodeId[\s\S]{0,220}store\.getMeta\('node_id'\)[\s\S]{0,220}this\.epoch = storedEpoch\(store\)/,
  'il sincronizzatore deve ripristinare identità del nodo ed epoch persistiti',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/supabaseSync.mjs',
  /flbp_local_append_operations[\s\S]{0,700}confirmed[\s\S]{0,500}markOutboxSynced/,
  'l’outbox locale deve essere cancellata solo dopo conferma transazionale dell’intero batch',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/supabaseSync.mjs',
  /syncRequested = true[\s\S]{0,500}while \(this\.syncRequested\)[\s\S]{0,500}syncOutbox\(\)/,
  'una commit arrivata durante un upload deve riattivare immediatamente il drain dell’outbox',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/server.mjs',
  /requireWritable[\s\S]{0,500}FLBP_LOCAL_DRAINING/,
  'la disattivazione deve bloccare le scritture e persistere gli esiti remoti ambigui',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/server.mjs',
  /control\/deactivate[\s\S]{0,2200}deactivation-error/,
  'un esito remoto ambiguo deve restare persistito fino al retry',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/server.mjs',
  /commitSnapshot[\s\S]{0,260}scheduleOutboxSync[\s\S]{0,160}ensureSecondaryBackup\(committed\.version\)/,
  'il commit Admin deve avviare il journal remoto e attendere la replica SQLite configurata prima dell’ack',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/store.mjs',
  /validateCloudSnapshotImport[\s\S]{0,1800}requestedVersion: incomingVersion/,
  'l’import cloud deve conservare la versione canonica senza creare buchi nel journal',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/store.mjs',
  /sanitizeAppStateForPublic\(state\)[\s\S]{0,2600}commitSnapshot[\s\S]{0,300}sanitizeAppStateForPublic\(state\)/,
  'il server deve sanificare autonomamente ogni snapshot pubblico senza fidarsi del browser',
);
requirePattern(
  'services/autoDbSync.ts',
  /resolveDataPlane\(\)[\s\S]{0,220}route\.mode !== 'cloud'[\s\S]{0,260}pending = s/,
  'la sincronizzazione normalizzata Supabase deve restare sospesa mentre SQLite è primario',
);
requirePattern(
  'services/localAdminContinuity.ts',
  /hasRecentVerifiedAdminSession[\s\S]{0,900}ensureLocalAdminToken/,
  'il reload Admin offline deve richiedere sia una sessione Supabase già verificata sia il nodo locale',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/server.mjs',
  /isTrustedLoopbackRequest[\s\S]{0,16000}control\/local-session/,
  'la sessione Admin automatica deve essere limitata al loopback del PC server',
);
requirePattern(
  '../FLBP SERVER LOCALE/src/server.mjs',
  /control\/resume-restored[\s\S]{0,900}sync\.reconcileTransition\(\)/,
  'un backup ripristinato deve restare bloccato finché Supabase non riconferma l’epoch',
);

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}

console.log('PASS data durability invariants');
