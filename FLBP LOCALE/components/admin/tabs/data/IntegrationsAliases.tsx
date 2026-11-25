import { useIntegrationFeedback } from './useIntegrationFeedback';
import React from 'react';
import type { PlayerProfileSnapshot } from '../../../../types';
import { formatPlayerBirthIdentityLabel, pickPlayerIdentityValue } from '../../../../services/playerIdentity';
import type { DataTabProps } from '../DataTab';
import { getPlayerKey, getPlayerKeyLabel, resolvePlayerKey } from '../../../../services/storageService';
import { normalizeNameLower } from '../../../../services/textUtils';
import { mergeAliasIntoBirthdatedProfile } from '../../../../services/playerProfileAdmin';

export const IntegrationsAliases: React.FC<DataTabProps & { targetPlayer?: PlayerProfileSnapshot; profiles: PlayerProfileSnapshot[] }> = ({
    state,
    setState,
    t,
    aliasesSearch,
    setAliasesSearch,
    aliasToolSelections,
    setAliasToolSelections,
    targetPlayer,
    profiles,
}) => {
    const [sourcePlayerId, setSourcePlayerId] = React.useState('');
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

    const { notify, ask, feedbackUI } = useIntegrationFeedback(t);
    const normalizeName = (name: string) => normalizeNameLower(name);

    const labelFromPlayerKey = (key: string) => {
        const { name, yob } = getPlayerKeyLabel(key);
        const base = (name || "").trim();
        const y = (yob || "").toString().trim();
        return y ? `${base} (${y})`.trim() : base;
    };

    // Alias globale: vista unica per conflitti Nome+data di nascita e gestione manuale degli alias
    const aliases = Object.entries((state.playerAliases || {}) as Record<string, string>) as Array<[string, string]>;

    const removeAlias = async (sourceKey: string) => {
        if (!await ask(t('remove_alias_confirm'))) return;
        const next = { ...(state.playerAliases || {}) };
        delete (next as any)[sourceKey];
        setState({ ...state, playerAliases: next });
    };

    const setAlias = async (fromKey: string, toKey: string) => {
        const from = (fromKey || '').trim();
        const toRaw = (toKey || '').trim();
        if (!from || !toRaw) return;
        if (from === toRaw) {
            notify(t('select_different_target_profile'));
            return;
        }

        const to = resolvePlayerKey(state, toRaw);

        if (/_ND$/i.test(from) && /_\d{4}-\d{2}-\d{2}$/i.test(to)) {
            const confirmed = await ask(
                t('alias_birthdate_merge_confirm')
                    .replace('{from}', labelFromPlayerKey(from))
                    .replace('{to}', labelFromPlayerKey(to))
            );
            if (!confirmed) return;
            try {
                setState(mergeAliasIntoBirthdatedProfile(state, {
                    sourcePlayerId: from,
                    targetPlayerId: to,
                    targetPlayerName: profiles.find(profile => profile.playerId === to)?.displayName || getPlayerKeyLabel(to).name,
                }));
                setAliasToolSelections(prev => {
                    const n = { ...prev };
                    delete (n as any)[from];
                    return n;
                });
            } catch (error: any) {
                notify(String(error?.message || error || t('players_snackbar_profile_update_error')));
            }
            return;
        }

        const nextAliases = { ...(state.playerAliases || {}), [from]: to };
        // prevenzione cicli (alias A->B e B->A)
        const resolvedTo = resolvePlayerKey({ playerAliases: nextAliases }, to);
        if (resolvedTo === from) {
            notify(t('invalid_alias_cycle'));
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
    const q = normalizeName(aliasesSearch);
    const visibleAliases = aliases.filter(([from, to]) => normalizeName(labelFromPlayerKey(from) + ' ' + labelFromPlayerKey(to)).includes(q));
    const candidates = targetPlayer ? profiles
        .filter(profile => profile.playerId !== targetPlayer.playerId && normalizeName(profile.displayName + ' ' + profile.yobLabel).includes(q))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)) : [];
    const filteredGroups = !q
        ? groups
        : groups.filter(g => g.displayName.toLowerCase().includes(q) || g.norm.includes(q));

    return (
        <div className="space-y-4">
                {feedbackUI}
            <label className="block">
                <span className="sr-only">{t('players_search_placeholder')}</span>
                <input type="search" value={aliasesSearch} onChange={event => {
                    setAliasesSearch(event.target.value);
                    setSourcePlayerId('');
                }} placeholder={t('players_search_placeholder')} className={inputBase + ' max-w-md'} />
            </label>
            {targetPlayer && <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={async event => {
                event.preventDefault();
                if (!sourcePlayerId || !await ask(t('edition_link_name_confirm')
                    .replace('{from}', labelFromPlayerKey(sourcePlayerId)).replace('{to}', targetPlayer.displayName))) return;
                await setAlias(sourcePlayerId, targetPlayer.playerId);
                setSourcePlayerId('');
            }}>
                <p className="font-bold">{t('edition_link_name')} · {targetPlayer.displayName}</p>
                <select aria-label={t('players_search_aria')} value={sourcePlayerId} onChange={event => setSourcePlayerId(event.target.value)} className={selectBase}>
                    <option value="">{t('players_search_placeholder')}</option>
                    {candidates.map(player => <option key={player.playerId} value={player.playerId}>{player.displayName} · {player.yobLabel}</option>)}
                </select>
                <button type="submit" className={btnSmPrimary} disabled={!sourcePlayerId}>{t('edition_link_name')}</button>
            </form>}
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {visibleAliases.map(([from, to]) => {
                    const source = getPlayerKeyLabel(from);
                    const target = getPlayerKeyLabel(to);
                    const birthDate = formatPlayerBirthIdentityLabel(source.yob) || formatPlayerBirthIdentityLabel(target.yob);
                    return <li key={from} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0 break-words text-sm font-bold capitalize">
                            {source.name} → {target.name} {birthDate && <span className="font-normal text-slate-500">· {birthDate}</span>}
                        </span>
                        <button type="button" className={btnSmDanger} onClick={() => void removeAlias(from)}>{t('players_remove_alias')}</button>
                    </li>;
                })}
                {!visibleAliases.length && <li className="p-3 text-sm text-slate-500">{t('players_no_alias_title')}</li>}
            </ul>

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
};
