import React from 'react';
import type { Match, TournamentData } from '../../types';
import { computeGroupStandings } from '../../services/groupStandings';
import { isFinalGroup } from '../../services/groupUtils';
import { formatMatchTeamsLabel, getMatchParticipantIds, isPlaceholderTeamId } from '../../services/matchUtils';
import { resolveWinnerTeamId } from '../../services/tournamentStructureSelectors';

interface Props {
    tournament: TournamentData;
    matches: Match[];
    onOpenReport: (matchId: string) => void;
    onOpenMatches: (code: string) => void;
    t: (key: string) => string;
}

const standings = (tournament: TournamentData, matches: Match[]) => {
    const teams = tournament.teams.filter(team => !team.hidden && !team.isBye && !isPlaceholderTeamId(team.id));
    const finalGroup = tournament.config?.finalRoundRobin?.activated && tournament.groups?.find(isFinalGroup);
    if (finalGroup || tournament.type === 'round_robin') {
        const group = finalGroup || tournament.groups?.[0];
        const groupTeams = group ? teams.filter(team => group.teams.some(member => member.id === team.id)) : teams;
        const groupMatches = matches.filter(match => match.phase === 'groups' && (!group || match.groupName === group.name));
        return computeGroupStandings({ teams: groupTeams, matches: groupMatches }).rankedTeams.map((team, index) => ({ id: team.id, name: team.name, rank: index + 1 }));
    }

    const bracket = matches.filter(match => match.phase === 'bracket');
    const finalRound = Math.max(0, ...bracket.map(match => match.round || 0));
    const final = bracket.find(match => (match.round || 0) === finalRound);
    const champion = final && resolveWinnerTeamId(final);
    if (!champion) return [];

    const names = new Map(teams.map(team => [team.id, team.name]));
    const out = [{ id: champion, name: names.get(champion) || champion, rank: 1 }];
    const placed = new Set([champion]);
    for (let round = finalRound; round >= 0; round--) {
        const rank = out.length + 1;
        for (const match of bracket.filter(match => (match.round || 0) === round && match.status === 'finished')) {
            const winner = resolveWinnerTeamId(match);
            if (!winner) continue;
            for (const id of getMatchParticipantIds(match)) {
                if (id === winner || placed.has(id) || !names.has(id)) continue;
                placed.add(id);
                out.push({ id, name: names.get(id)!, rank });
            }
        }
    }
    return out;
};

export const LiveClosingSummary: React.FC<Props> = ({ tournament, matches, onOpenReport, onOpenMatches, t }) => {
    const visible = matches.filter(match => !match.hidden && !match.isBye && !getMatchParticipantIds(match).some(id => id.toUpperCase() === 'BYE'));
    const unplayed = visible.filter(match => match.status !== 'finished' && !match.played);
    const ranks = standings(tournament, visible);
    const teamNames = new Map(tournament.teams.map(team => [team.id, team.name]));

    return (
        <div className="grid gap-3 md:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 font-black text-slate-950">{t('admin_closing_standings')}</h3>
                {ranks.length ? (
                    <ol className="divide-y divide-slate-100 text-sm">
                        {ranks.map(row => <li key={row.id} className="flex gap-3 py-2"><span className="w-6 shrink-0 font-bold text-slate-600">{row.rank}</span><span className="min-w-0 break-words font-bold">{row.name}</span></li>)}
                    </ol>
                ) : <p className="text-sm text-slate-600">{t('admin_closing_standings_pending')}</p>}
            </section>
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 font-black text-slate-950">{t('admin_closing_unplayed')} <span className="text-sm text-slate-600">({unplayed.length})</span></h3>
                {unplayed.length ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                        {unplayed.map(match => {
                            const ids = getMatchParticipantIds(match);
                            const reportable = ids.length >= 2 && ids.every(id => !isPlaceholderTeamId(id));
                            return (
                                <li key={match.id}>
                                    <button type="button" className="flex min-h-[40px] w-full items-center gap-2 rounded-md text-start hover:bg-blue-50 focus-visible:outline focus-visible:outline-2" onClick={() => reportable ? onOpenReport(match.id) : onOpenMatches(match.code || '')}>
                                        <span className="shrink-0 font-mono font-bold text-blue-900">{match.code}</span>
                                        <span className="min-w-0 break-words">{formatMatchTeamsLabel(match, id => teamNames.get(id) || t('tbd_label'), { includeCode: false, vsSep: ` ${t('versus_short')} ` })}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : <p className="text-sm text-slate-600">{t('no_matches_queued')}</p>}
            </section>
        </div>
    );
};
