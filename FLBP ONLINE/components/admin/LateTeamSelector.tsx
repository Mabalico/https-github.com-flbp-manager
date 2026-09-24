import React from 'react';
import { CheckCheck, Clock3, Search, X } from 'lucide-react';
import { useTranslation } from '../../App';
import type { Team } from '../../types';

interface LateTeamSelectorProps {
    teams: Team[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
}

const getByeCount = (teamCount: number): number => {
    if (teamCount < 2) return 0;
    return (2 ** Math.ceil(Math.log2(teamCount))) - teamCount;
};

export const LateTeamSelector: React.FC<LateTeamSelectorProps> = ({
    teams,
    selectedIds,
    onChange,
}) => {
    const { t, lang } = useTranslation();
    const [query, setQuery] = React.useState('');
    const titleId = React.useId();
    const descriptionId = React.useId();
    const searchId = React.useId();
    const deferredQuery = React.useDeferredValue(query);

    const eligibleTeams = React.useMemo(
        () => teams
            .filter((team) => !team.hidden && !team.isBye)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', lang, { sensitivity: 'base' })),
        [lang, teams],
    );
    const eligibleIds = React.useMemo(() => new Set(eligibleTeams.map((team) => team.id)), [eligibleTeams]);
    const selectedSet = React.useMemo(
        () => new Set(selectedIds.filter((id) => eligibleIds.has(id))),
        [eligibleIds, selectedIds],
    );
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase(lang);
    const visibleTeams = React.useMemo(() => {
        if (!normalizedQuery) return eligibleTeams;
        return eligibleTeams.filter((team) => (
            [team.name, team.player1, team.player2]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase(lang)
                .includes(normalizedQuery)
        ));
    }, [eligibleTeams, lang, normalizedQuery]);

    const selectedCount = selectedSet.size;
    const byeCount = getByeCount(eligibleTeams.length);
    const selectedByeCount = Math.min(selectedCount, byeCount);
    const selectedFirstRoundCount = Math.max(0, selectedCount - selectedByeCount);

    const toggleTeam = (teamId: string) => {
        const next = new Set(selectedSet);
        if (next.has(teamId)) next.delete(teamId);
        else next.add(teamId);
        onChange(eligibleTeams.map((team) => team.id).filter((id) => next.has(id)));
    };

    return (
        <section
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 shadow-[0_16px_34px_-30px_rgba(76,29,149,0.65)]"
        >
            <div className="border-b border-violet-100 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                            <Clock3 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h5 id={titleId} className="font-black text-slate-950">{t('late_team_title')}</h5>
                            <p id={descriptionId} className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                                {t('late_team_description')}
                            </p>
                        </div>
                    </div>
                    <span
                        aria-live="polite"
                        className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-black ${selectedCount ? 'border-violet-200 bg-violet-100 text-violet-900' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                        {t('late_team_selected_count')
                            .replace('{selected}', String(selectedCount))
                            .replace('{total}', String(eligibleTeams.length))}
                    </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                        {t('late_team_byes_available').replace('{count}', String(byeCount))}
                    </span>
                    {selectedCount === 0 ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                            {t('late_team_random_draw')}
                        </span>
                    ) : (
                        <>
                            {selectedByeCount > 0 ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                                    {t('late_team_bye_priority_count').replace('{count}', String(selectedByeCount))}
                                </span>
                            ) : null}
                            {selectedFirstRoundCount > 0 ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">
                                    {t('late_team_first_round_slots').replace('{count}', String(selectedFirstRoundCount))}
                                </span>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <label htmlFor={searchId} className="mb-1.5 block text-xs font-black text-slate-700">
                            {t('late_team_search_label')}
                        </label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            <input
                                id={searchId}
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('late_team_search_placeholder')}
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    aria-label={t('late_team_clear_search')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-2" role="toolbar" aria-label={t('late_team_actions_aria')}>
                        <button
                            type="button"
                            onClick={() => onChange(eligibleTeams.map((team) => team.id))}
                            disabled={!eligibleTeams.length || selectedCount === eligibleTeams.length}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                        >
                            <CheckCheck className="h-4 w-4" aria-hidden="true" />
                            {t('late_team_select_all')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            disabled={selectedCount === 0}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                            {t('late_team_clear_all')}
                        </button>
                    </div>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2" role="group" aria-label={t('late_team_group_aria')}>
                    {visibleTeams.length ? (
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {visibleTeams.map((team) => {
                                const checked = selectedSet.has(team.id);
                                const players = [team.player1, team.player2].filter(Boolean).join(' · ');
                                return (
                                    <label
                                        key={team.id}
                                        className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-violet-300 bg-violet-50 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleTeam(team.id)}
                                            className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                                        />
                                        <span className="min-w-0">
                                            <span className="block break-words text-sm font-black leading-tight text-slate-900">{team.name}</span>
                                            {players ? (
                                                <span className="mt-1 block break-words text-[11px] font-semibold leading-tight text-slate-500">{players}</span>
                                            ) : null}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    ) : (
                        <div role="status" className="px-3 py-7 text-center text-sm font-bold text-slate-500">
                            {eligibleTeams.length ? t('late_team_no_results') : t('late_team_no_eligible')}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};
