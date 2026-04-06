import React from 'react';
import { CheckCircle2, FileText, ListChecks, LoaderCircle, PhoneCall, Play, Printer, Search, ThumbsUp, X } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import type { Team } from '../../../types';
import { getMatchParticipantIds, formatMatchScoreLabel } from '../../../services/matchUtils';
import { useTranslation } from '../../../App';
import { useAdminTeamCalls } from '../useAdminTeamCalls';

export type CodesStatusFilter = 'all' | 'scheduled' | 'playing' | 'finished';

export interface CodesTabProps {
    state: AppState;
    codesStatusFilter: CodesStatusFilter;
    setCodesStatusFilter: (v: CodesStatusFilter) => void;
    printCodes: () => void;
    toggleMatchStatus: (matchId: string) => void;
    openReportFromCodes: (matchId: string) => void;
}

export const CodesTab: React.FC<CodesTabProps> = ({
    state,
    codesStatusFilter,
    setCodesStatusFilter,
    printCodes,
    toggleMatchStatus,
    openReportFromCodes,
}) => {
    const [query, setQuery] = React.useState('');
    const { t } = useTranslation();
    const { getTeamCallMeta, triggerTeamCall } = useAdminTeamCalls(state);

    const normalizeTeamId = (id: unknown) => (typeof id === 'string' ? id.trim().toUpperCase() : '');
    const isByeTeamId = (id: unknown) => normalizeTeamId(id) === 'BYE';
    const isPlaceholderTeamId = (id: unknown) => {
        const up = normalizeTeamId(id);
        return up === 'BYE' || up === 'TBD' || up.startsWith('TBD-');
    };

    // Lightweight Admin UI tokens (local): aligns toolbar controls with other admin tabs.
    const inputBase =
        'border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const selectBase =
        'border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnSecondary =
        'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-black text-sm bg-white border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    const statusMeta = React.useMemo(() => ({
        scheduled: { label: t('match_status_scheduled'), pill: 'border-slate-200 bg-slate-50 text-slate-700' },
        playing: { label: t('match_status_playing'), pill: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
        finished: { label: t('match_status_finished'), pill: 'border-rose-200 bg-rose-50 text-rose-800' },
    } as const), [t]);
    const teamCatalog = React.useMemo(() => new Map((state.teams || []).map((team) => [team.id, team] as const)), [state.teams]);

    const renderCallButtons = React.useCallback((match: any) => {
        if (match?.status === 'finished') return null;
        const teams = getMatchParticipantIds(match as any)
            .filter((id) => id && !isPlaceholderTeamId(id))
            .map((id) => teamCatalog.get(id))
            .filter(Boolean) as Team[];
        if (!teams.length) return null;

        return (
            <div className="flex items-center gap-1.5">
                {teams.map((team, index) => {
                    const meta = getTeamCallMeta(team);
                    const status = meta.status;
                    const icon = status === 'acknowledged'
                        ? <ThumbsUp className="h-3.5 w-3.5" />
                        : status === 'ringing'
                            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            : <PhoneCall className="h-3.5 w-3.5" />;
                    const title = meta.disabled
                        ? `${t('reports_call_team_disabled')} (${team.name || team.id})`
                        : status === 'acknowledged'
                            ? `${t('reports_call_team_acknowledged')}: ${team.name || team.id}`
                            : status === 'ringing'
                                ? `${t('reports_call_team_cancel')}: ${team.name || team.id}`
                                : `${t('reports_call_team')}: ${team.name || team.id}`;
                    const className = meta.disabled
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : status === 'acknowledged'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : status === 'ringing'
                                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

                    return (
                        <button
                            key={`${match.id}-${team.id}`}
                            type="button"
                            disabled={meta.disabled}
                            title={title}
                            aria-label={title}
                            onClick={(event) => {
                                event.stopPropagation();
                                void triggerTeamCall(team).catch((error: any) => {
                                    alert(String(error?.message || error || t('reports_call_team_disabled')));
                                });
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${className}`}
                        >
                            {icon}
                            <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-black/5 px-1 text-[10px] font-black">
                                {index + 1}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }, [getTeamCallMeta, t, teamCatalog, triggerTeamCall]);

    return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h3 className="text-xl font-black flex items-center gap-2">
                    <ListChecks className="w-5 h-5" /> {t('code_list')}
                </h3>
                <div className="text-xs font-bold text-slate-500 mt-1">
                    {t('codes_tab_desc')}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('codes_toolbar_aria')}>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('codes_search_placeholder')}
                            aria-label={t('codes_search_aria')}
                            className={`w-60 max-w-full pl-9 pr-9 ${inputBase}`}
                        />
                        {query.trim() && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-xl hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                aria-label={t('clear_search')}
                                title={t('clear_search')}
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        )}
                    </div>

                    <select
                        value={codesStatusFilter}
                        onChange={(e) => setCodesStatusFilter(e.target.value as CodesStatusFilter)}
                        className={selectBase}
                        aria-label={t('codes_filter_status_aria')}
                    >
                        <option value="all">{t('all')}</option>
                        <option value="scheduled">{t('match_status_scheduled')}</option>
                        <option value="playing">{t('match_status_playing')}</option>
                        <option value="finished">{t('match_status_finished_plural')}</option>
                    </select>

                    <button type="button"
                        onClick={printCodes}
                        className={btnSecondary}
                        title={t('print_code_list')}
                    >
                        <Printer className="w-4 h-4" /> {t('print')}
                    </button>
                </div>

                <div className="text-xs font-bold text-slate-500">
                    {(() => {
                        const total = (state.tournamentMatches || []).length;
                        const filtered = codesStatusFilter === 'all'
                            ? total
                            : (state.tournamentMatches || []).filter(m => m.status === codesStatusFilter).length;
                        return (
                            <>
                                {t('codes_live_tournament_label')}: {state.tournament ? t('yes_short') : t('no_short')} • {t('matches_label')}: {filtered}/{total}
                            </>
                        );
                    })()}
                </div>
            </div>
        </div>

        {!state.tournament && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                {t('admin_no_live_guidance')}. {t('structure')} → <b>{t('start_live')}</b>.
            </div>
        )}

        {state.tournament && (
            <>
                {(() => {
                    const teamMap = new Map((state.teams || []).map(t => [t.id, t.name] as const));
                    const ms = [...(state.tournamentMatches || [])]
                        .filter(m => !(m as any).hidden)
                        .filter(m => {
                            const ids = getMatchParticipantIds(m as any);
                            return !ids.some(isByeTeamId);
                        })
                        .sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER));

                    const statusFiltered = codesStatusFilter === 'all' ? ms : ms.filter(m => m.status === codesStatusFilter);
                    const current =
                        ms.find(m => m.status === 'playing') ||
                        ms.find(m => m.status === 'scheduled') ||
                        ms[ms.length - 1];
                    const currentIdx = current ? (ms.findIndex(m => m.id === current.id) + 1) : 0;
                    const finishedCount = ms.filter(m => m.status === 'finished').length;
                    const playingCount = ms.filter(m => m.status === 'playing').length;
                    const scheduledCount = ms.filter(m => m.status === 'scheduled').length;

                    const getLabelNames = (m: any) => {
                        const ids = getMatchParticipantIds(m as any);
                        const names = ids.map((id: string) => id ? (teamMap.get(id) || id) : 'TBD');
                        const isMulti = ids.length >= 3;
                        return isMulti ? names.join(' vs ') : `${names[0] || 'TBD'} vs ${names[1] || 'TBD'}`;
                    };

                    const q = query.trim().toLowerCase();
                    const visible = !q
                        ? statusFiltered
                        : statusFiltered.filter(m => {
                            const code = (m.code || '').toLowerCase();
                            const label = getLabelNames(m).toLowerCase();
                            const meta = `${m.phase || ''} ${(m.groupName || '')} ${(m.roundName || '')}`.toLowerCase();
                            return code.includes(q) || label.includes(q) || meta.includes(q);
                        });

                    return (
                        <>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="text-[11px] font-black text-slate-500 uppercase">{t('quick_overview')}</div>
                                        <div className="font-black text-slate-900">
                                            {current?.status === 'playing'
                                                ? 'Match in corso'
                                                : current?.status === 'scheduled'
                                                    ? 'Prossimo match'
                                                    : 'Ultimo match'}
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                                Avanzamento: <span className="font-mono">{currentIdx}/{ms.length}</span>
                                            </span>
                                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                                Da giocare: <span className="font-black">{scheduledCount}</span>
                                            </span>
                                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
                                                In corso: <span className="font-black">{playingCount}</span>
                                            </span>
                                            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">
                                                Giocate: <span className="font-black">{finishedCount}</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="w-full max-w-md space-y-3">
                                        {current && (
                                            <div className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1 inline-flex">
                                                Match guida: <span className="ml-1 font-mono">{current.code || '-'}</span>
                                            </div>
                                        )}
                                            <div className="flex flex-wrap gap-2">
                                            {current ? renderCallButtons(current) : null}
                                            <button
                                                type="button"
                                                onClick={() => current && openReportFromCodes(current.id)}
                                                disabled={!current || getMatchParticipantIds(current as any).some(isPlaceholderTeamId)}
                                                className={`px-4 py-2.5 rounded-xl font-black text-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${
                                                    current && !getMatchParticipantIds(current as any).some(isPlaceholderTeamId)
                                                        ? 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                                                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                                }`}
                                                title={t('open_priority_report')}
                                            >
                                                Apri match guida
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => current && current.status !== 'finished' && toggleMatchStatus(current.id)}
                                                disabled={!current || current.status === 'finished' || getMatchParticipantIds(current as any).some(isPlaceholderTeamId)}
                                                className={`px-4 py-2.5 rounded-xl font-black text-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 ${
                                                    current && current.status !== 'finished' && !getMatchParticipantIds(current as any).some(isPlaceholderTeamId)
                                                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                                                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                                }`}
                                                title={t('advance_priority_match')}
                                            >
                                                {current?.status === 'playing' ? 'Chiudi match guida' : 'Avvia match guida'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <details className="rounded-xl border border-slate-200 bg-white p-3">
                                    <summary className="cursor-pointer list-none text-[11px] font-black uppercase tracking-wide text-slate-500">
                                        Note operative
                                    </summary>
                                    <div className="mt-2 text-[11px] font-bold text-slate-500">
                                        {t('codes_usage_prefix')} <span className="font-black">{t('codes_usage_cta')}</span> {t('codes_usage_suffix')} <span className="font-black">{t('match_status_finished_plural').toLowerCase()}</span> {t('codes_usage_suffix_2')}
                                    </div>
                                </details>
                            </div>

                            <div className="space-y-2">
                                {visible.map(m => {
                                    const isCurrent = current && m.id === current.id;
                                    const ids = getMatchParticipantIds(m as any);
                                    const isMulti = ids.length >= 3;
                                    const hasPlaceholder = ids.length < 2 || ids.some(isPlaceholderTeamId);
                                    const labelNames = getLabelNames(m);
                                    const code = m.code || '-';
                                    const score = m.status === 'finished' ? formatMatchScoreLabel(m as any) : '—';
                                    const isClickable = m.status === 'finished' && !hasPlaceholder;
                                    const meta = (statusMeta as any)[m.status] || statusMeta.scheduled;

                                    return (
                                        <div
                                            key={m.id}
                                            onClick={isClickable ? () => openReportFromCodes(m.id) : undefined}
                                            className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
                                                isClickable
                                                    ? 'cursor-pointer hover:brightness-95'
                                                    : (m.status === 'finished' && hasPlaceholder)
                                                        ? 'cursor-not-allowed'
                                                        : ''
                                            } ${
                                                isCurrent
                                                    ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50'
                                                    : m.status === 'playing'
                                                        ? 'border-emerald-200 bg-emerald-50'
                                                        : m.status === 'finished'
                                                            ? 'border-rose-200 bg-rose-50'
                                                            : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="font-mono font-black text-slate-900">{code}</span>
                                                    {m.isTieBreak && (
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${isMulti ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                            SPAREGGIO{isMulti ? ' MULTI' : ''}{typeof m.targetScore === 'number' ? ` a ${m.targetScore}` : ''}
                                                        </span>
                                                    )}

                                                    {hasPlaceholder && (
                                                        <span
                                                            className="text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 bg-slate-100 text-slate-700 border-slate-200"
                                                            title={t('codes_placeholder_disabled')}
                                                        >
                                                            TBD
                                                        </span>
                                                    )}

                                                    <span className="font-black text-slate-900 whitespace-normal break-words leading-tight">{labelNames}</span>
                                                </div>
                                                <div className="text-xs font-bold text-slate-500 mt-1">
                                                    {m.phase === 'groups'
                                                        ? (m.groupName ? `Girone ${m.groupName}` : 'Gironi')
                                                        : (m.roundName || 'Bracket')}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-mono font-black text-slate-700">{score}</span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-black border uppercase ${meta.pill}`}>
                                                    {meta.label}
                                                </span>
                                                {renderCallButtons(m)}
                                                <button type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (hasPlaceholder) return;
                                                        openReportFromCodes(m.id);
                                                    }}
                                                    disabled={hasPlaceholder}
                                                    className={`px-3 py-2 rounded-xl font-black border border-slate-200 bg-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2 ${
                                                        hasPlaceholder ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
                                                    }`}
                                                    title={hasPlaceholder ? t('codes_report_unavailable_tbd') : t('open_report')}
                                                    aria-label={hasPlaceholder ? t('codes_report_unavailable_tbd') : t('open_report')}
                                                >
                                                    <FileText className="w-4 h-4" /> <span className="hidden sm:inline">{t('reports')}</span>
                                                </button>

                                                {m.status !== 'finished' && (
                                                    <button type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (hasPlaceholder) return;
                                                            toggleMatchStatus(m.id);
                                                        }}
                                                        disabled={hasPlaceholder}
                                                        className={`px-3 py-2 rounded-xl font-black border border-slate-200 bg-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 flex items-center gap-2 ${
                                                            hasPlaceholder ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
                                                        }`}
                                                        title={t('advance_match_status')}
                                                        aria-label={m.status === 'scheduled' ? t('start_match') : t('close_match')}
                                                    >
                                                        {m.status === 'scheduled' ? <Play className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                        <span className="hidden sm:inline">{m.status === 'scheduled' ? 'Avvia' : 'Chiudi'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {!visible.length && (
                                    <div className="p-6 text-center text-slate-500 font-bold bg-slate-50 border border-slate-200 rounded-xl">
                                        {query.trim()
                                            ? (
                                                <div className="space-y-2">
                                                    <div>Nessun match trovato per “{query.trim()}”.</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuery('')}
                                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                                    >
                                                        <X className="w-4 h-4" /> Pulisci ricerca
                                                    </button>
                                                </div>
                                            )
                                            : 'Nessun match disponibile.'}
                                    </div>
                                )}
                            </div>
                        </>
                    );
                })()}
            </>
        )}
    </div>
    );
};
