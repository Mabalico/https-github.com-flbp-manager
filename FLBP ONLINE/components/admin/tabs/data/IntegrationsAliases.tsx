import React from 'react';
import type { DataTabProps } from '../DataTab';
import { getPlayerKey, getPlayerKeyLabel, isU25, resolvePlayerKey } from '../../../../services/storageService';
import { pickPlayerIdentityValue } from '../../../../services/playerIdentity';
import { normalizeNameLower } from '../../../../services/textUtils';
import { mergeAliasIntoBirthdatedProfile } from '../../../../services/playerProfileAdmin';

export const IntegrationsAliases: React.FC<DataTabProps> = ({
    state,
    setState,
    t,
    dataSubTab,
    setDataSubTab,
    integrationsSubTab,
    setIntegrationsSubTab,
    aliasesSearch,
    setAliasesSearch,
    aliasToolSelections,
    setAliasToolSelections,
    buildProfilesIndex,
    setAlias,
    removeAlias,
    dataSelectedTournamentId,
    setDataSelectedTournamentId,
    dataSelectedMatchId,
    setDataSelectedMatchId,
    dataScoreA,
    setDataScoreA,
    dataScoreB,
    setDataScoreB,
    dataStatus,
    setDataStatus,
    dataRecomputeAwards,
    setDataRecomputeAwards,
    dataWinnerTeamId,
    setDataWinnerTeamId,
    dataTopScorerPlayerId,
    setDataTopScorerPlayerId,
    dataDefenderPlayerId,
    setDataDefenderPlayerId,
    dataMvpPlayerId,
    setDataMvpPlayerId,
    dataTopScorerU25PlayerId,
    setDataTopScorerU25PlayerId,
    dataDefenderU25PlayerId,
    setDataDefenderU25PlayerId,
    hofEditId,
    setHofEditId,
    hofEditTournamentId,
    setHofEditTournamentId,
    hofYear,
    setHofYear,
    hofTournamentName,
    setHofTournamentName,
    hofType,
    setHofType,
    hofTeamName,
    setHofTeamName,
    hofWinnerP1,
    setHofWinnerP1,
    hofWinnerP2,
    setHofWinnerP2,
    hofPlayerName,
    setHofPlayerName,
    hofPlayerYoB,
    setHofPlayerYoB,
    hofValue,
    setHofValue,
    scorersImportWarnings,
    setScorersImportWarnings,
    setPendingScorersImport,
    setAliasModalOpen,
    setAliasModalTitle,
    setAliasModalConflicts,
    scorersFileRef,
    createArchiveOpen,
    createArchiveStep,
    setCreateArchiveStep,
    createArchiveName,
    setCreateArchiveName,
    createArchiveDate,
    setCreateArchiveDate,
    createArchiveMode,
    setCreateArchiveMode,
    createArchiveGroups,
    setCreateArchiveGroups,
    createArchiveAdvancing,
    setCreateArchiveAdvancing,
    createArchiveTeams,
    createArchiveFileRef,
    caTeamName,
    setCaTeamName,
    caP1,
    setCaP1,
    caY1,
    setCaY1,
    caP2,
    setCaP2,
    caY2,
    setCaY2,
    caP1IsRef,
    setCaP1IsRef,
    caP2IsRef,
    setCaP2IsRef,
    openCreateArchiveWizard,
    resetCreateArchiveWizard,
    copyLiveTeamsIntoWizard,
    importArchiveTeamsFile,
    addWizardTeam,
    createArchivedTournament,
}) => {
    // Lightweight Admin UI tokens (local): consistent controls without new deps
    const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const inputBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 ${ring}`;
    const selectBase =
        `w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-slate-900 ${ring}`;
    const btnSmBase =
        `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-black transition text-xs disabled:opacity-50 disabled:pointer-events-none ${ring}`;
    const btnSmPrimary = `${btnSmBase} border border-blue-700 bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-500`;
    const btnSmDanger = `${btnSmBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-400`;

    return (() => {
    const normalizeName = (name: string) => normalizeNameLower(name);

    const labelFromPlayerKey = (key: string) => {
        const { name, yob } = getPlayerKeyLabel(key);
        const base = (name || "").trim();
        const y = (yob || "").toString().trim();
        return y ? `${base} (${y})`.trim() : base;
    };

                                // Alias globale: vista unica per conflitti Nome+data di nascita e gestione manuale degli alias
                                const aliases = Object.entries((state.playerAliases || {}) as Record<string, string>) as Array<[string, string]>;

                                const removeAlias = (sourceKey: string) => {
                                    if (!confirm(t('remove_alias_confirm'))) return;
                                    const next = { ...(state.playerAliases || {}) };
                                    delete (next as any)[sourceKey];
                                    setState({ ...state, playerAliases: next });
                                };

                                const setAlias = (fromKey: string, toKey: string) => {
                                    const from = (fromKey || '').trim();
                                    const toRaw = (toKey || '').trim();
                                    if (!from || !toRaw) return;
                                    if (from === toRaw) {
                                        alert(t('select_different_target_profile'));
                                        return;
                                    }

                                    const to = resolvePlayerKey(state, toRaw);

                                    if (/_ND$/i.test(from) && /_\d{4}-\d{2}-\d{2}$/i.test(to)) {
                                        const confirmed = window.confirm(
                                            t('alias_birthdate_merge_confirm')
                                                .replace('{from}', labelFromPlayerKey(from))
                                                .replace('{to}', labelFromPlayerKey(to))
                                        );
                                        if (!confirmed) return;
                                        try {
                                            setState(mergeAliasIntoBirthdatedProfile(state, {
                                                sourcePlayerId: from,
                                                targetPlayerId: to,
                                                targetPlayerName: labelFromPlayerKey(to),
                                            }));
                                            setAliasToolSelections(prev => {
                                                const n = { ...prev };
                                                delete (n as any)[from];
                                                return n;
                                            });
                                        } catch (error: any) {
                                            alert(String(error?.message || error || t('players_snackbar_profile_update_error')));
                                        }
                                        return;
                                    }

                                    const nextAliases = { ...(state.playerAliases || {}), [from]: to };
                                    // prevenzione cicli (alias A->B e B->A)
                                    const resolvedTo = resolvePlayerKey({ playerAliases: nextAliases }, to);
                                    if (resolvedTo === from) {
                                        alert(t('invalid_alias_cycle'));
                                        return;
                                    }

                                    setState({ ...state, playerAliases: nextAliases });
                                    setAliasToolSelections(prev => {
                                        const n = { ...prev };
                                        delete (n as any)[from];
                                        return n;
                                    });
                                };

                                type ProfileRow = {
                                    key: string;
                                    label: string;
                                    resolvedKey: string;
                                    sources: string[];
                                    count: number;
                                };

                                const collectConflicts = () => {
                                    const map = new Map<string, Map<string, { key: string; resolvedKey: string; sources: Set<string>; count: number }>>();

                                    const add = (name: string, yob?: number, source?: string, birthDate?: string) => {
                                        const norm = normalizeName(name);
                                        if (!norm) return;
                                        const rawKey = getPlayerKey(name, pickPlayerIdentityValue(birthDate, yob));
                                        const resolvedKey = resolvePlayerKey(state, rawKey);
                                        const byName = map.get(norm) || new Map();
                                        const row = byName.get(rawKey) || { key: rawKey, resolvedKey, sources: new Set<string>(), count: 0 };
                                        row.resolvedKey = resolvedKey;
                                        row.count += 1;
                                        if (source) row.sources.add(source);
                                        byName.set(rawKey, row);
                                        map.set(norm, byName);
                                    };

                                    const addTeam = (team: any, src: string) => {
                                        if (!team) return;
                                        if (team.player1) add(team.player1, team.player1YoB, src, (team as any).player1BirthDate);
                                        if (team.player2) add(team.player2, team.player2YoB, src, (team as any).player2BirthDate);
                                    };

                                    // Live roster
                                    (state.teams || []).forEach(team => addTeam(team, t('source_live_teams')));
                                    (state.tournament?.teams || []).forEach(team => addTeam(team, t('source_live_tournament')));

                                    // Archivio tornei
                                    (state.tournamentHistory || []).forEach(tour => {
                                        (tour.teams || []).forEach(t => addTeam(t, `Archivio: ${tour.name || tour.id}`));
                                    });

                                    // Integrazioni marcatori
                                    (state.integrationsScorers || []).forEach(e => add(e.name, e.yob, t('source_integrations_scorers'), (e as any).birthDate));

                                    // Albo d'Oro manuale (se presente playerId)
                                    (state.hallOfFame || []).forEach((e: any) => {
                                        const pid = String(e.playerId || '').trim();
                                        if (!pid) return;
                                        const { name, yob } = getPlayerKeyLabel(pid);
                                        const yobNum = yob && yob !== 'ND' ? parseInt(yob, 10) : undefined;
                                        add(name, yobNum, 'Integrazioni: albo d\'oro');
                                    });

                                    const groups = Array.from(map.entries())
                                        .map(([norm, byKey]) => {
                                            const profiles: ProfileRow[] = Array.from(byKey.values()).map(r => ({
                                                key: r.key,
                                                label: labelFromPlayerKey(r.key),
                                                resolvedKey: r.resolvedKey,
                                                sources: Array.from(r.sources),
                                                count: r.count
                                            }));
                                            // conflitto = almeno 2 profili diversi (raw)
                                            if (profiles.length < 2) return null;
                                            const displayName = getPlayerKeyLabel(profiles[0].key).name;
                                            return { norm, displayName, profiles };
                                        })
                                        .filter(Boolean) as { norm: string; displayName: string; profiles: ProfileRow[] }[];

                                    // Ordina per nome
                                    groups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'it', { sensitivity: 'base' }));
                                    return groups;
                                };

                                const groups = collectConflicts();
                                const q = (aliasesSearch || '').trim().toLowerCase();
                                const filteredGroups = !q
                                    ? groups
                                    : groups.filter(g => g.displayName.toLowerCase().includes(q) || g.norm.includes(q));

                                return (
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="font-black text-slate-900">{t('alias_global_title')}</div>
                                                    <div className="text-xs text-slate-600 font-bold">
                                                        {t('alias_global_desc')}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label={t('alias_filters')}>
                                                    <input
                                                        value={aliasesSearch}
                                                        onChange={(e) => setAliasesSearch(e.target.value)}
                                                        placeholder={t('search_name_placeholder')}
                                                        className={`${inputBase} w-64 max-w-full`}
                                                    />
                                                    <div className="px-3 py-2 rounded-lg font-black border border-slate-200 bg-white text-xs">
                                                        {t('conflicts_label')}: <span className="font-mono">{filteredGroups.length}</span>
                                                    </div>
                                                    <div className="px-3 py-2 rounded-lg font-black border border-slate-200 bg-white text-xs">
                                                        {t('active_aliases')}: <span className="font-mono">{aliases.length}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {aliases.length > 0 && (
                                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="bg-slate-900 text-white px-4 py-2 font-black uppercase tracking-wide text-sm flex items-center justify-between">
                                                    <span>{t('active_aliases')}</span>
                                                    <span className="text-xs font-mono font-bold text-white/70">{aliases.length}</span>
                                                </div>
                                                <div className="divide-y divide-slate-100">
                                                    {aliases.slice(0, 100).map(([from, to]) => (
                                                        <div key={from} className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-bold text-slate-500">{t('from_label')}</div>
                                                                <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{labelFromPlayerKey(from)}</div>
                                                                <div className="text-xs font-bold text-slate-500 mt-2">{t('to_label')}</div>
                                                                <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{labelFromPlayerKey(to)}</div>
                                                            </div>
                                                            <button type="button"
                                                                onClick={() => removeAlias(from)}
                                                                className={btnSmDanger}
                                                            >
                                                                {t('remove')}
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {aliases.length > 100 && (
                                                        <div className="px-4 py-3 text-xs font-bold text-slate-500">
                                                            {t('show_first_100_aliases')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 font-black text-slate-700 flex items-center justify-between">
                                                <span>{t('name_birthdate_conflicts')}</span>
                                                <span className="font-mono text-xs text-slate-500">{filteredGroups.length}</span>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {filteredGroups.map(g => (
                                                    <div key={g.norm} className="px-4 py-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="font-black text-slate-900">{g.displayName}</div>
                                                            <div className="text-xs font-mono font-bold text-slate-500">{t('profiles_label')}: {g.profiles.length}</div>
                                                        </div>
                                                        <div className="mt-3 space-y-2">
                                                            {g.profiles.map(p => {
                                                                const isAliased = !!(state.playerAliases || {})[p.key];
                                                                const target = (state.playerAliases || {})[p.key];
                                                                const resolved = resolvePlayerKey(state, p.key);
                                                                const targetLabel = target ? labelFromPlayerKey(target) : '';
                                                                const selection = aliasToolSelections[p.key] || '';
                                                                const options = g.profiles
                                                                    .filter(x => x.key !== p.key)
                                                                    .map(x => ({ key: x.key, label: x.label }));
                                                                return (
                                                                    <div key={p.key} className="border border-slate-200 rounded-xl p-3">
                                                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                                                            <div className="min-w-0">
                                                                                <div className="font-black text-slate-900 whitespace-normal break-words leading-tight">{p.label}</div>
                                                                                <div className="text-[11px] font-mono text-slate-500 whitespace-normal break-all leading-tight">{p.key}</div>
                                                                                {p.sources.length > 0 && (
                                                                                    <div className="text-[11px] font-bold text-slate-500 mt-1">
                                                                                        {t('sources_label')}: {p.sources.slice(0, 3).join(' · ')}{p.sources.length > 3 ? ' · …' : ''}
                                                                                    </div>
                                                                                )}
                                                                                <div className="text-[11px] font-bold text-slate-500 mt-1">
                                                                                    {t('occurrences_label')}: <span className="font-mono">{p.count}</span>
                                                                                    {resolved !== p.key ? (
                                                                                        <> · {t('resolved_into')}: <span className="font-mono">{labelFromPlayerKey(resolved)}</span></>
                                                                                    ) : null}
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-2">
                                                                                {isAliased ? (
                                                                                    <>
                                                                                        <div className="text-xs font-black text-slate-600">{t('alias_arrow')}</div>
                                                                                        <div className="text-xs font-black text-slate-900 max-w-[220px] whitespace-normal break-words leading-tight">{targetLabel}</div>
                                                                                        <button type="button"
                                                                                            onClick={() => removeAlias(p.key)}
                                                                                            className={btnSmDanger}
                                                                                        >
                                                                                            {t('remove')}
                                                                                        </button>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <select
                                                                                            value={selection}
                                                                                            onChange={(e) => setAliasToolSelections(prev => ({ ...prev, [p.key]: e.target.value }))}
                                                                                            className={`${selectBase} w-60 max-w-full text-sm`}
                                                                                        >
                                                                                            <option value="">{t('merge_into_placeholder')}</option>
                                                                                            {options.map(o => (
                                                                                                <option key={o.key} value={o.key}>{o.label}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                        <button type="button"
                                                                                            disabled={!selection}
                                                                                            onClick={() => setAlias(p.key, selection)}
                                                                                            className={btnSmPrimary}
                                                                                        >
                                                                                            {t('integrate')}
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}

                                                {filteredGroups.length === 0 && (
                                                    <div className="p-8 text-center text-slate-400 font-bold">
                                                        {t('no_name_birthdate_conflicts_found')}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="px-4 py-3 text-[11px] font-bold text-slate-500 bg-slate-50">
                                                {t('aliases_logic_note')}
                                            </div>
                                        </div>
                                    </div>
                                );
    })();
};
