import React from 'react';
import { Download, Upload, GitMerge } from 'lucide-react';

export const BackupSyncPanel: React.FC<{
    exportBackupJson: () => void | Promise<void>;
    restoreBackupJson: (file: File) => void | Promise<void>;
    mergeBackupJson: (file: File) => void | Promise<void>;
}> = ({ exportBackupJson, restoreBackupJson, mergeBackupJson }) => {
    const restoreRef = React.useRef<HTMLInputElement | null>(null);
    const mergeRef = React.useRef<HTMLInputElement | null>(null);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-black text-slate-900">Backup file dati</div>
                    <div className="text-xs text-slate-600 mt-1">
                        Salva tutto lo stato dell&apos;app in un file JSON, ripristinalo integralmente oppure integra un backup esterno nei dati già presenti. I nuovi export provano a generare backup più moderni, omettendo i campi YoB solo quando la data nascita completa è già presente. Prima dell&apos;applicazione viene mostrato un preflight con compatibilità, conteggi, warning e presenza di eventuali campi legacy YoB.
                    </div>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[11px] font-black border border-emerald-200 bg-emerald-50 text-emerald-800">
                    Completo
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

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void exportBackupJson()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                >
                    <Download className="w-4 h-4" />
                    Scarica backup JSON
                </button>
                <button
                    type="button"
                    onClick={() => restoreRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                >
                    <Upload className="w-4 h-4" />
                    Ripristina backup
                </button>
                <button
                    type="button"
                    onClick={() => mergeRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black border border-blue-700 bg-blue-700 text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                    <GitMerge className="w-4 h-4" />
                    Integra backup
                </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2 text-xs text-slate-600 font-bold">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="font-black text-slate-800">Ripristina backup</div>
                    <div className="mt-1">Usalo quando vuoi tornare esattamente allo stato contenuto nel file selezionato.</div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="font-black text-blue-900">Integra backup</div>
                    <div className="mt-1">Usalo per aggiungere dati da un altro evento: i record coincidenti vengono aggiornati, non duplicati.</div>
                </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                L&apos;export JSON include anche il catalogo live degli account registrati quando la sessione admin Supabase è valida. Le password non vengono esportate e quel catalogo è solo consultabile, non ripristinabile automaticamente.
            </div>
        </div>
    );
};
