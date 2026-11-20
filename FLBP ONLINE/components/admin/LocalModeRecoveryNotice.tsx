import React from 'react';
import type { AdminLeaseRecovery } from '../../services/adminWriteLeaseState';

// Explains the read-only lock left by a tournament PC that stopped answering
// without closing local mode, and how the site gets its control back.
const formatWhen = (value?: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const LocalModeRecoveryNotice: React.FC<{
    recovery: AdminLeaseRecovery;
    busy: boolean;
    onReclaim: () => void;
}> = ({ recovery, busy, onReclaim }) => {
    const silentSince = formatWhen(recovery.leaseExpiredAt);
    const unlockAt = formatWhen(recovery.reclaimAt);
    const lastMissingAt = formatWhen(recovery.lastMissingOperationAt);
    const missing = recovery.missingOperations || 0;
    const closeFromPc = (
        <>accendi il PC del torneo, apri <span className="font-black">FLBP Manager Locale</span> e premi <span className="font-black">Chiudi modalità locale</span></>
    );

    if (recovery.reason === 'grace') {
        return (
            <div className="space-y-2 text-sm font-semibold text-slate-700">
                <p>
                    La modalità locale del PC del torneo non è stata chiusa
                    {silentSince ? <> e il PC non risponde dalle {silentSince}</> : null}.
                    {' '}Finché il PC può avere modifiche non ancora online, il sito resta in sola lettura.
                </p>
                <p>
                    Per sbloccarlo subito, {closeFromPc}.
                    {unlockAt ? <> Altrimenti il sito si sblocca da solo dalle <span className="font-black">{unlockAt}</span>.</> : null}
                </p>
                {missing > 0 ? (
                    <p className="text-amber-800">
                        Online mancano le ultime {missing} modifiche salvate sul PC: chiudendo la modalità locale dal PC non si perdono.
                    </p>
                ) : null}
            </div>
        );
    }

    if (recovery.reason === 'missing_operations') {
        return (
            <div className="space-y-3 text-sm font-semibold text-slate-700">
                <p>
                    Il PC del torneo non risponde da più di 12 ore{silentSince ? <> (dalle {silentSince})</> : null},
                    {' '}ma online mancano le ultime {missing} modifiche salvate sul PC{lastMissingAt ? <>, l'ultima alle {lastMissingAt}</> : null}.
                </p>
                <p>
                    Se puoi, {closeFromPc}: così non si perde niente. Altrimenti riprendi il controllo dal sito, sapendo che quelle modifiche andranno perse.
                </p>
                <button
                    type="button"
                    onClick={onReclaim}
                    disabled={busy}
                    className="rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-400"
                >
                    Riprendi il controllo dal sito
                </button>
            </div>
        );
    }

    if (recovery.reason === 'local_active') {
        return (
            <p className="text-sm font-semibold text-slate-700">
                Il PC del torneo ha la modalità locale attiva: le modifiche si fanno da quel PC. A fine torneo premi <span className="font-black">Chiudi modalità locale</span> nel suo pannello.
            </p>
        );
    }

    return (
        <p className="text-sm font-semibold text-slate-700">
            Il PC del torneo ha ancora il controllo dei dati e non risponde. Per sbloccare il sito, {closeFromPc}.
        </p>
    );
};
