import React from 'react';
import { AppState } from '../services/storageService';
import { TvProjection } from '../types';
import { TvSimpleView } from './TvSimpleView';
import { TvBracketView } from './TvBracketView';
import { TvScorersView } from './TvScorersView';
import { PublicTvShell } from './PublicTvShell';

interface TvViewProps {
    state: AppState;
    mode: TvProjection;
    onExit: () => void;
}

export const TvView: React.FC<TvViewProps> = ({ state, mode, onExit }) => {

    const renderContent = () => {
        const tournament = state?.tournament ?? null;
        const teams = Array.isArray(state?.teams) ? state.teams : [];
        const tournamentMatches = Array.isArray(state?.tournamentMatches) ? state.tournamentMatches : [];
        const hallOfFame = Array.isArray(state?.hallOfFame) ? state.hallOfFame : [];
        const logo = state?.logo || '';
        const playerAliases = state?.playerAliases || {};

        const data = tournament;
        const matches = tournamentMatches;
        const liveTeams = Array.isArray(tournament?.teams) && tournament.teams.length > 0
            ? tournament.teams
            : teams;

        // Keep TV routing aligned with the old working app:
        // each TV view already applies its own safe fallbacks/empty states.
        // Avoid pre-emptive gating here, otherwise partial public snapshots can
        // incorrectly fall back to the shell and make TV appear broken.
        if (mode === 'groups') {
            return <TvSimpleView teams={liveTeams} data={data} matches={matches} logo={logo} onExit={onExit} />;
        }
        if (mode === 'bracket' || mode === 'groups_bracket') {
            return <TvBracketView teams={liveTeams} matches={matches} data={data} logo={logo} onExit={onExit} mode={mode} />;
        }
        if (mode === 'scorers') {
            return (
                <TvScorersView
                    teams={liveTeams}
                    matches={matches}
                    data={data}
                    logo={logo}
                    awards={hallOfFame.filter((h) => h.tournamentId === data?.id)}
                    playerAliases={playerAliases}
                    onExit={onExit}
                />
            );
        }

        return <PublicTvShell data={data} logo={logo} onExit={onExit} />;
    };

    return <>{renderContent()}</>;
};
