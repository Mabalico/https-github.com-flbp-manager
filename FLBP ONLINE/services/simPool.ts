import { HallOfFameEntry, IntegrationScorerEntry, Team, TournamentData } from '../types';

interface SimPerson {
    name: string;
    yob?: number;
    birthDate?: string;
}

interface SimSourceState {
    teams?: Team[];
    tournament?: TournamentData | null;
    tournamentHistory?: TournamentData[];
    integrationsScorers?: IntegrationScorerEntry[];
    hallOfFame?: HallOfFameEntry[];
}

interface RealPoolTeam {
    name: string;
    player1?: SimPerson;
    player2?: SimPerson;
}

const normalizeKey = (s: string) => (s || '').trim().toLowerCase();

const cleanName = (name?: string | null) => String(name || '').trim();

const pushUniqueTeam = (target: RealPoolTeam[], seen: Set<string>, team?: Team | null) => {
    if (!team || team.hidden || team.isBye) return;
    const teamName = cleanName(team.name);
    if (!teamName) return;

    const player1Name = cleanName(team.player1);
    const player2Name = cleanName(team.player2);
    if (!player1Name && !player2Name) return;

    const key = normalizeKey(`${teamName}|${player1Name}|${player2Name}|${team.player1BirthDate || team.player1YoB || ''}|${team.player2BirthDate || team.player2YoB || ''}`);
    if (seen.has(key)) return;
    seen.add(key);

    target.push({
        name: teamName,
        player1: player1Name ? { name: player1Name, yob: team.player1YoB, birthDate: team.player1BirthDate } : undefined,
        player2: player2Name ? { name: player2Name, yob: team.player2YoB, birthDate: team.player2BirthDate } : undefined,
    });
};

const collectTournamentTeams = (target: RealPoolTeam[], seen: Set<string>, tournament?: TournamentData | null) => {
    if (!tournament) return;
    (tournament.teams || []).forEach((team) => pushUniqueTeam(target, seen, team));
    (tournament.groups || []).forEach((group) => (group.teams || []).forEach((team) => pushUniqueTeam(target, seen, team)));
};

export const buildRealSimPoolFromState = (source: SimSourceState = {}): { teams: RealPoolTeam[]; people: SimPerson[] } => {
    const teams: RealPoolTeam[] = [];
    const seenTeams = new Set<string>();

    (source.teams || []).forEach((team) => pushUniqueTeam(teams, seenTeams, team));
    collectTournamentTeams(teams, seenTeams, source.tournament);
    (source.tournamentHistory || []).forEach((tournament) => collectTournamentTeams(teams, seenTeams, tournament));

    const people: SimPerson[] = [];
    const seenPeople = new Set<string>();
    const pushPerson = (person?: SimPerson | null) => {
        const name = cleanName(person?.name);
        if (!name) return;
        const key = normalizeKey(`${name}|${person?.birthDate || person?.yob || ''}`);
        if (seenPeople.has(key)) return;
        seenPeople.add(key);
        people.push({ name, yob: person?.yob, birthDate: person?.birthDate });
    };

    teams.forEach((team) => {
        pushPerson(team.player1);
        pushPerson(team.player2);
    });

    (source.integrationsScorers || []).forEach((row) => pushPerson({ name: row.name, yob: row.yob, birthDate: row.birthDate }));
    (source.hallOfFame || []).forEach((entry) => (entry.playerNames || []).forEach((name) => pushPerson({ name, birthDate: entry.playerBirthDate })));

    return { teams, people };
};

export const generateSimPoolTeams = (n: number, source: SimSourceState, uuidFn: () => string): Team[] => {
    const nn = Math.min(400, Math.max(1, Math.floor(n || 0)));

    const realPool = buildRealSimPoolFromState(source);
    const realTeams = realPool.teams.filter((team) => team.player1?.name || team.player2?.name);
    const realPeople = realPool.people;
    if (!realTeams.length && realPeople.length < 2) return [];

    // Avoid duplicate team names vs existing.
    const existingTeamNames = new Set((source.teams || []).map(t => normalizeKey(t.name || '')));

    const usedThisGen = new Set<string>();
    const pickTeamName = (baseName: string, i: number) => {
        const base = cleanName(baseName) || `Team JSON ${i + 1}`;
        let candidate = base;
        let guard = 0;
        while ((existingTeamNames.has(normalizeKey(candidate)) || usedThisGen.has(normalizeKey(candidate))) && guard < 50) {
            guard++;
            const suffix = guard === 1 ? ' III' : guard === 2 ? ' IV' : guard === 3 ? ' V' : ` ${guard + 2}`;
            candidate = `${base}${suffix}`;
        }
        usedThisGen.add(normalizeKey(candidate));
        return candidate;
    };

    const pickFallbackPair = (i: number) => {
        const a = realPeople[(i * 2) % realPeople.length];
        let b = realPeople[(i * 2 + 1) % realPeople.length];
        if (a && b && a.name === b.name && (a.birthDate || a.yob) === (b.birthDate || b.yob)) {
            b = realPeople[(i * 2 + 2) % realPeople.length];
        }
        return { a, b };
    };

    const teams: Team[] = [];
    for (let i = 0; i < nn; i++) {
        const sourceTeam = realTeams[i % realTeams.length];
        const teamName = pickTeamName(sourceTeam?.name || `Team JSON ${i + 1}`, i);

        const fallbackPair = pickFallbackPair(i);
        const a = sourceTeam?.player1 || sourceTeam?.player2 || fallbackPair.a;
        const b = sourceTeam?.player2 || fallbackPair.b || fallbackPair.a;
        if (!a?.name) continue;

        // Initial referee flags:
// - On average ~1 referee team every 5 teams
// - Some teams have 2 referees
const isRefTeam = (i % 5) === 0;
const hasTwoRefs = isRefTeam && (i % 25 === 0); // ~20% of referee teams
const aRef = isRefTeam; // at least one referee in the team
const bRef = hasTwoRefs;


        teams.push({
            id: uuidFn(),
            name: teamName,
            player1: a.name,
            player2: b?.name || '',
            player1YoB: a.yob,
            player2YoB: b?.yob,
            player1BirthDate: a.birthDate,
            player2BirthDate: b?.birthDate,
            player1IsReferee: aRef,
            player2IsReferee: bRef,
            isReferee: aRef || bRef,
            createdAt: Date.now()
        } as any);
    }

    return teams;
};
