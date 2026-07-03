import React from 'react';
import { AlertTriangle, RefreshCw, Trash2, Trophy } from 'lucide-react';

import type { DataTabProps } from '../DataTab';
import {
    deleteFantaTournamentData,
    fetchFantaTournamentDataSummaries,
    type FantaTournamentDataSummary,
} from '../../../../services/supabaseRest';
import { FANTA_APP_CHANGE_EVENT } from '../../../../services/playerAppService';

const PRE_TOURNAMENT_ID = '__pre_tournament__';

export const IntegrationsFantaCleanup: React.FC<DataTabProps> = ({ state }) => {
    const [rows, setRows] = React.useState<FantaTournamentDataSummary[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [feedback, setFeedback] = React.useState<null | { tone: 'success' | 'error'; message: string }>(null);

    const knownTournamentIds = React.useMemo(() => {
        const ids = new Set<string>();
        const liveId = String((state.tournament as any)?.id || '').trim();
        if (liveId) ids.add(liveId);
        (state.tournamentHistory || []).forEach((tournament: any) => {
            const id = String(tournament?.id || '').trim();
            if (id) ids.add(id);
        });
        return ids;
    }, [state.tournament, state.tournamentHistory]);

    const cleanupRows = React.useMemo(() => rows.filter((row) =>
        row.tournamentId !== PRE_TOURNAMENT_ID
        && !knownTournamentIds.has(row.tournamentId)
    ), [knownTournamentIds, rows]);
    const strictOrphanRows = React.useMemo(() => cleanupRows.filter((row) => !row.publicTournamentExists), [cleanupRows]);

    const load = React.useCallback(async () => {
        setLoading(true);
        setFeedback(null);
        try {
            const nextRows = await fetchFantaTournamentDataSummaries();
            setRows(nextRows);
        } catch (error: any) {
            setFeedback({ tone: 'error', message: error?.message || 'Non sono riuscito a leggere i dati Fanta.' });
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void load();
    }, [load]);

    const formatDate = (value?: string | null) => {
        if (!value) return 'Data non disponibile';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Data non disponibile';
        return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const deleteOrphan = async (row: FantaTournamentDataSummary) => {
        const ok = window.confirm(
            `Eliminare definitivamente i dati Fanta non collegati allo storico locale di "${row.tournamentName}"?\n\n` +
            `Verranno cancellate ${row.archivedEditions} edizioni archivio, ${row.archivedStandings} righe classifica, ` +
            `${row.archivedPlayers} righe giocatori e ${row.fantaTeams} squadre Fanta.\n\n` +
            `${row.publicTournamentExists ? 'Attenzione: il torneo risulta ancora nel mirror pubblico Supabase. Usa questa azione solo se il torneo reale è stato davvero eliminato.\n\n' : ''}` +
            'Il torneo reale, se esistesse ancora nello storico locale, non viene toccato.'
        );
        if (!ok) return;

        setDeletingId(row.tournamentId);
        setFeedback(null);
        try {
            const result = await deleteFantaTournamentData(row.tournamentId);
            window.dispatchEvent(new CustomEvent(FANTA_APP_CHANGE_EVENT));
            setFeedback({
                tone: 'success',
                message: `Fanta orfano eliminato: ${result.removed.archivedEditions} edizioni archivio e ${result.removed.fantaTeams} squadre rimosse.`,
            });
            await load();
        } catch (error: any) {
            setFeedback({ tone: 'error', message: error?.message || 'Eliminazione Fanta non riuscita.' });
        } finally {
            setDeletingId(null);
        }
    };

    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black transition disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSecondary = `${btnBase} bg-white border border-slate-200 text-slate-900 hover:bg-slate-50`;
    const btnDanger = `${btnBase} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-base font-black text-amber-950">
                            <Trophy className="h-5 w-5 text-amber-600" />
                            Manutenzione FantaBeerpong
                        </div>
                        <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-amber-950/80">
                            Qui compaiono i dati Fanta collegati a tornei che non risultano più nello storico locale.
                            Se un torneo reale è stato eliminato ma il relativo archivio Fanta è rimasto visibile,
                            puoi cancellare solo i dati Fanta senza toccare referti, Albo d'Oro o altri tornei.
                        </p>
                    </div>
                    <button type="button" onClick={() => void load()} disabled={loading} className={btnSecondary}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Aggiorna
                    </button>
                </div>
            </div>

            {feedback ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                    feedback.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}>
                    {feedback.message}
                </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-black uppercase tracking-wide text-slate-500">Fanta non collegati</div>
                        <div className="mt-1 text-xl font-black text-slate-950">{cleanupRows.length}</div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
                        {strictOrphanRows.length} orfani certi · {rows.length} Fanta totali letti
                    </span>
                </div>

                {loading ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                        Lettura dati Fanta in corso...
                    </div>
                ) : cleanupRows.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm font-bold text-emerald-900">
                        Nessun Fanta non collegato allo storico locale rilevato.
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {cleanupRows.map((row) => (
                            <div key={row.tournamentId} className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 text-sm font-black text-rose-900">
                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{row.tournamentName}</span>
                                        </div>
                                        <div className="mt-1 text-xs font-bold text-slate-600">
                                            {formatDate(row.startDate)} · ID: <span className="font-mono">{row.tournamentId}</span>
                                        </div>
                                        {row.publicTournamentExists ? (
                                            <div className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
                                                Mirror pubblico ancora presente
                                            </div>
                                        ) : (
                                            <div className="mt-2 inline-flex rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-rose-800">
                                                Orfano certo
                                            </div>
                                        )}
                                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide text-slate-700">
                                            <span className="rounded-full border border-white bg-white px-2.5 py-1">Edizioni: {row.archivedEditions}</span>
                                            <span className="rounded-full border border-white bg-white px-2.5 py-1">Classifiche: {row.archivedStandings}</span>
                                            <span className="rounded-full border border-white bg-white px-2.5 py-1">Giocatori: {row.archivedPlayers}</span>
                                            <span className="rounded-full border border-white bg-white px-2.5 py-1">Squadre: {row.fantaTeams}</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void deleteOrphan(row)}
                                        disabled={deletingId === row.tournamentId}
                                        className={btnDanger}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {deletingId === row.tournamentId ? 'Elimino...' : 'Elimina dati Fanta'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
