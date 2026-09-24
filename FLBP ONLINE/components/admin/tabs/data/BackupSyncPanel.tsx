import React from 'react';
import { Database, Download, Upload, GitMerge } from 'lucide-react';
import { useTranslation } from '../../../../App';

export const BackupSyncPanel: React.FC<{
    exportBackupJson: () => void | Promise<void>;
    restoreBackupJson: (file: File) => void | Promise<void>;
    mergeBackupJson: (file: File) => void | Promise<void>;
    exportFullDatabaseBackup: () => void | Promise<void>;
    restoreFullDatabaseBackup: (file: File) => void | Promise<void>;
}> = ({ exportBackupJson, restoreBackupJson, mergeBackupJson, exportFullDatabaseBackup, restoreFullDatabaseBackup }) => {
    const { t } = useTranslation();
    const restoreRef = React.useRef<HTMLInputElement | null>(null);
    const mergeRef = React.useRef<HTMLInputElement | null>(null);
    const restoreFullDbRef = React.useRef<HTMLInputElement | null>(null);

    return (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-black text-slate-900">{t('backup_file_title')}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">{t('backup_file_desc')}</div>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[11px] font-black border border-emerald-200 bg-emerald-50 text-emerald-800">
                    {t('backup_status_complete')}
                </div>
            </div>

            <input
                ref={restoreRef}
                type="file"
                className="hidden"
                accept="application/json,.json"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void restoreBackupJson(file);
                    e.currentTarget.value = '';
                }}
            />
            <input
                ref={mergeRef}
                type="file"
                className="hidden"
                accept="application/json,.json"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void mergeBackupJson(file);
                    e.currentTarget.value = '';
                }}
            />
            <input
                ref={restoreFullDbRef}
                type="file"
                className="hidden"
                accept="application/json,.json"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void restoreFullDatabaseBackup(file);
                    e.currentTarget.value = '';
                }}
            />

            <button
                type="button"
                onClick={() => void exportBackupJson()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 sm:w-auto"
            >
                <Download className="h-4 w-4" />
                {t('backup_download_json')}
            </button>

            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer list-none rounded-lg text-sm font-black text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                    {t('backup_restore')} / {t('backup_merge')}
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="font-black text-slate-900">{t('backup_restore')}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">{t('backup_restore_desc')}</div>
                        <button
                            type="button"
                            onClick={() => restoreRef.current?.click()}
                            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-black text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                        >
                            <Upload className="h-4 w-4" />
                            {t('backup_restore')}
                        </button>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <div className="font-black text-blue-950">{t('backup_merge')}</div>
                        <div className="mt-1 text-xs font-semibold text-blue-900/80">{t('backup_merge_desc')}</div>
                        <button
                            type="button"
                            onClick={() => mergeRef.current?.click()}
                            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-700 bg-blue-700 px-4 py-2.5 font-black text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            <GitMerge className="h-4 w-4" />
                            {t('backup_merge')}
                        </button>
                    </div>
                </div>
            </details>

            <details className="rounded-2xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer list-none rounded-lg text-sm font-black text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2">
                    {t('db_advanced_tools_title')}
                </summary>
                <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                        {t('backup_export_accounts_note')}
                    </div>
                    <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="inline-flex items-center gap-2 text-sm font-black text-red-950">
                                    <Database className="h-4 w-4" />
                                    {t('backup_full_db_title')}
                                </div>
                                <div className="mt-1 max-w-3xl text-xs font-bold text-red-900/80">{t('backup_full_db_desc')}</div>
                            </div>
                            <div className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-black text-red-800">{t('backup_full_db_admin_only')}</div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => void exportFullDatabaseBackup()}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-700 bg-red-700 px-4 py-2.5 font-black text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                            >
                                <Download className="h-4 w-4" />
                                {t('backup_full_db_download')}
                            </button>
                            <button
                                type="button"
                                onClick={() => restoreFullDbRef.current?.click()}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 font-black text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                            >
                                <Upload className="h-4 w-4" />
                                {t('backup_full_db_restore')}
                            </button>
                        </div>
                    </div>
                </div>
            </details>
        </div>
    );
};
