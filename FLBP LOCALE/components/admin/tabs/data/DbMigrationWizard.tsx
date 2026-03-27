import React from 'react';
import type { AppState } from '../../../../services/storageService';
import {
  pullWorkspaceState,
  pullNormalizedState,
  pushNormalizedFromState,
  runDbHealthChecks,
  testSupabaseConnection,
} from '../../../../services/supabaseRest';
import { markDbSyncError, markDbSyncOk } from '../../../../services/dbDiagnostics';
import { clearLocalAppStateCaches, setDataPersistenceMode } from '../../../../services/repository/featureFlags';
import { useTranslation } from '../../../../App';

type LogLine = { at: string; level: 'info' | 'ok' | 'warn' | 'error'; msg: string };

type WizardState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * Guided, best-effort import iniziale Locale -> DB.
 *
 * Safety:
 * - Only uses existing SupabaseRest operations.
 * - Does NOT touch OCR/sim/live/TV.
 */
export const DbMigrationWizard: React.FC<{ state: AppState; forceOverwrite: boolean }> = ({ state, forceOverwrite }) => {
  const { t } = useTranslation();
  const [wiz, setWiz] = React.useState<WizardState>({ kind: 'idle' });
  const [enableDbFirst, setEnableDbFirst] = React.useState<boolean>(true);
  const [log, setLog] = React.useState<LogLine[]>([]);

  const pushLog = (level: LogLine['level'], msg: string) => {
    setLog((cur) => [...cur, { at: new Date().toISOString(), level, msg }].slice(-120));
  };

  const run = async () => {
    if (wiz.kind === 'running') return;
    setLog([]);
    setWiz({ kind: 'running' });

    // Backup data in-memory for best-effort rollback
    let backupSnapshot: AppState | null = null;
    let backupStructured: AppState | null = null;

    try {
      pushLog('info', t('dbmig_preflight_test'));
      const test = await testSupabaseConnection();
      if (!test.ok) throw new Error(test.message || t('dbmig_test_failed'));
      pushLog('ok', test.message || t('dbmig_connection_ok'));

      pushLog('info', t('dbmig_preflight_health'));
      const health = await runDbHealthChecks();
      if (!health.ok) {
        // Do not hard-stop on warnings; but stop on any error severity check.
        const hasBlocking = (health.checks || []).some((c) => !c.ok && String(c.severity || '').toLowerCase() === 'error');
        if (hasBlocking) throw new Error(t('dbmig_health_blocking'));
        pushLog('warn', t('dbmig_health_warn'));
      } else {
        pushLog('ok', t('dbmig_health_ok'));
      }

      pushLog('info', t('dbmig_backup_snapshot'));
      const remoteRow = await pullWorkspaceState();
      if (remoteRow?.state) {
        backupSnapshot = remoteRow.state as AppState;
        pushLog('ok', `${t('dbmig_snapshot_acquired')} (${remoteRow.updated_at || t('dbmig_no_updated_at')}).`);
      } else {
        pushLog('info', t('dbmig_no_remote_snapshot'));
      }

      pushLog('info', t('dbmig_backup_structured'));
      try {
        const r = await pullNormalizedState();
        if (r?.state) {
          backupStructured = r.state as AppState;
          pushLog('ok', `${t('dbmig_structured_acquired')} (tournaments: ${r.summary?.tournaments ?? '?'}).`);
        }
      } catch {
        pushLog('warn', t('dbmig_backup_structured_missing'));
      }

      pushLog('info', t('dbmig_running_export'));
      await pushNormalizedFromState(state, { force: forceOverwrite });
      markDbSyncOk('structured');
      pushLog('ok', t('dbmig_done'));

      pushLog('info', t('dbmig_postcheck'));
      const health2 = await runDbHealthChecks();
      if (!health2.ok) {
        pushLog('warn', t('dbmig_postcheck_warn'));
      } else {
        pushLog('ok', t('dbmig_postcheck_ok'));
      }

      if (enableDbFirst) {
        try {
          setDataPersistenceMode('remote');
          clearLocalAppStateCaches();
          // When DB is primary, public read should be enabled for coherence.
          localStorage.setItem('flbp_public_db_read', '1');
          pushLog('ok', t('dbmig_db_online_enabled'));
        } catch {
          pushLog('warn', t('dbmig_db_first_save_fail'));
        }
      }

      setWiz({ kind: 'done' });
    } catch (e: any) {
      const msg = e?.message || String(e);
      markDbSyncError(msg);
      pushLog('error', msg);

      // Best-effort rollback (only if we had something)
      if (backupSnapshot || backupStructured) {
        pushLog('warn', t('dbmig_rollback_running'));
        try {
          const restore = backupStructured || backupSnapshot;
          if (restore) {
            await pushNormalizedFromState(restore, { force: true });
            pushLog('ok', t('dbmig_rollback_done'));
          }
        } catch (re: any) {
          pushLog('error', `${t('dbmig_rollback_failed')}: ${re?.message || String(re)}`);
        }
      }

      setWiz({ kind: 'error', message: msg });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-black">{t('dbmig_title')}</div>
          <div className="text-xs text-slate-600 mt-1">
            {t('dbmig_desc')}
          </div>
        </div>
        <div className="text-xs">
          {wiz.kind === 'running' ? (
            <span className="px-2 py-1 rounded-lg font-black bg-blue-100 text-blue-900 border border-blue-200">{t('dbmig_running')}</span>
          ) : wiz.kind === 'done' ? (
            <span className="px-2 py-1 rounded-lg font-black bg-emerald-100 text-emerald-900 border border-emerald-200">{t('dbmig_complete')}</span>
          ) : wiz.kind === 'error' ? (
            <span className="px-2 py-1 rounded-lg font-black bg-red-100 text-red-900 border border-red-200">{t('error')}</span>
          ) : (
            <span className="px-2 py-1 rounded-lg font-black bg-slate-100 text-slate-700 border border-slate-200">{t('dbmig_ready')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={enableDbFirst}
            onChange={(e) => setEnableDbFirst(e.target.checked)}
            className="accent-slate-900"
          />
          {t('dbmig_enable_db_first')}
        </label>
        <button
          disabled={wiz.kind === 'running'}
          onClick={run}
          className={`px-3 py-2 rounded-xl font-black border text-xs ${
            wiz.kind === 'running'
              ? 'bg-slate-100 text-slate-400 border-slate-200'
              : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
          }`}
        >
          {t('dbmig_start')}
        </button>
      </div>

      {log.length ? (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-64 overflow-auto">
          <div className="text-[11px] font-black text-slate-600 mb-2">{t('dbmig_log')}</div>
          <div className="space-y-1">
            {log.map((l, idx) => (
              <div key={idx} className="text-[11px] font-mono text-slate-700 flex gap-2">
                <span className="text-slate-400">{l.at.slice(11, 19)}</span>
                <span className={l.level === 'error' ? 'text-red-700 font-black' : l.level === 'warn' ? 'text-amber-700 font-black' : l.level === 'ok' ? 'text-emerald-700 font-black' : 'text-slate-700'}>
                  {l.level.toUpperCase()}
                </span>
                <span className="break-words">{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {wiz.kind === 'error' ? (
        <div className="mt-3 text-xs text-red-700 font-bold">
          {t('dbmig_failed_hint')}
        </div>
      ) : null}
    </div>
  );
};
