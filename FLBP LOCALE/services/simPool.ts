import { Team } from '../types';

interface SimPerson {
    name: string;
    yob: number;
    birthDate: string;
    firstName: string;
}
import { SIM_TEAM_NAMES_400 } from './simTeamNames400';

export const generateSimPoolTeams = (n: number, existingTeams: Team[], uuidFn: () => string): Team[] => {
    const nn = Math.min(400, Math.max(1, Math.floor(n || 0)));

    // Fixed team names (400) and people (800) with fixed YoB. Includes 5 homonyms with different ages.
    const TEAM_NAMES = SIM_TEAM_NAMES_400;

    // NOTE: Keep the sim pool visually mixed (roughly 50/50) instead of all-female.
    // This is a purely synthetic dataset used for testing/previewing UI flows.
    const BASE_FIRST_F = ['Giulia','Sofia','Aurora','Alice','Ginevra','Emma','Greta','Martina','Chiara','Francesca','Sara','Elena','Beatrice','Vittoria','Noemi','Marta','Gaia','Arianna','Rebecca','Matilde','Anna','Ilaria','Valentina','Federica','Silvia','Claudia','Lucia','Camilla','Alessia','Veronica','Irene','Caterina','Elisa','Margherita','Rachele','Serena','Giada','Benedetta','Adele','Melissa'];
    const BASE_FIRST_M = ['Mario','Luca','Andrea','Marco','Paolo','Giuseppe','Matteo','Francesco','Davide','Simone','Alessio','Federico','Riccardo','Gabriele','Stefano','Antonio','Nicola','Pietro','Edoardo','Tommaso','Lorenzo','Giulio','Enrico','Roberto','Fabio','Giorgio','Vincenzo','Salvatore','Raffaele','Michele','Filippo','Daniele','Samuele','Leonardo','Jacopo','Cristian','Claudio','Sergio','Angelo','Alberto'];
    const BASE_FIRST = (() => {
        const out: string[] = [];
        const max = Math.max(BASE_FIRST_F.length, BASE_FIRST_M.length);
        for (let i = 0; i < max; i++) {
            if (BASE_FIRST_F[i]) out.push(BASE_FIRST_F[i]);
            if (BASE_FIRST_M[i]) out.push(BASE_FIRST_M[i]);
        }
        return out;
    })();
    const BASE_LAST = ['Rossi','Bianchi','Ferrari','Esposito','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','Costa','Giordano','Mancini','Rizzo','Lombardi','Moretti','Barbieri','Fontana'];

    const buildBirthDate = (year: number, index: number) => {
        const month = String((index % 12) + 1).padStart(2, '0');
        const day = String((index % 28) + 1).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const assignYoB = (index: number, total: number) => {
        const u25Quota = Math.max(1, Math.round(total * 0.1));
        if (index < u25Quota) return 2002 + (index % 6);
        return 1984 + (index % 17);
    };

    const HOMONYM_GROUPS: Array<{ firstName: string; lastName: string }> = [
        { firstName: 'Giulia', lastName: 'Rossi' },
        { firstName: 'Luca', lastName: 'Bianchi' },
        { firstName: 'Marco', lastName: 'Ferrari' },
    ];

    const PEOPLE: SimPerson[] = [];
    let personIndex = 0;

    for (const group of HOMONYM_GROUPS) {
        for (let i = 0; i < 10; i++) {
            const yob = assignYoB(personIndex, 800);
            PEOPLE.push({
                name: `${group.lastName} ${group.firstName}`,
                yob,
                birthDate: buildBirthDate(yob, personIndex),
                firstName: group.firstName,
            });
            personIndex++;
        }
    }

    let idx = 0;
    while (PEOPLE.length < 800) {
        const fn = BASE_FIRST[idx % BASE_FIRST.length];
        const ln = BASE_LAST[Math.floor(idx / BASE_FIRST.length) % BASE_LAST.length];
        const name = `${ln} ${fn}`;
        idx++;
        if (HOMONYM_GROUPS.some((group) => group.firstName === fn && group.lastName === ln)) continue;
        const yob = assignYoB(personIndex, 800);
        PEOPLE.push({
            name,
            yob,
            birthDate: buildBirthDate(yob, personIndex),
            firstName: fn,
        });
        personIndex++;
    }

    // Avoid duplicate team names vs existing.
    const existingTeamNames = new Set((existingTeams || []).map(t => (t.name || '').trim().toLowerCase()));
    const availableNames = TEAM_NAMES.filter(nm => !existingTeamNames.has(nm.trim().toLowerCase()));

    const usedThisGen = new Set<string>();
    const normName = (s: string) => (s || '').trim().toLowerCase();
    const pickTeamName = (i: number) => {
        const base = availableNames[i] || TEAM_NAMES[i % TEAM_NAMES.length] || `Team ${i + 1}`;
        let candidate = base;
        let guard = 0;
        while ((existingTeamNames.has(normName(candidate)) || usedThisGen.has(normName(candidate))) && guard < 50) {
            guard++;
            const suffix = guard === 1 ? ' III' : guard === 2 ? ' IV' : guard === 3 ? ' V' : ` ${guard + 2}`;
            candidate = `${base}${suffix}`;
        }
        usedThisGen.add(normName(candidate));
        return candidate;
    };

    // Split people by first-name list to keep teams visually mixed (avoid "all-female" output).
    const femaleFirst = new Set(BASE_FIRST_F);
    const maleFirst = new Set(BASE_FIRST_M);
    const femalePeople = PEOPLE.filter(p => femaleFirst.has(p.firstName || ''));
    const malePeople = PEOPLE.filter(p => maleFirst.has(p.firstName || ''));
    const pairCount = Math.min(nn, Math.floor(PEOPLE.length / 2));

    const orderedWomen = femalePeople.slice(0, pairCount);
    const orderedMen = malePeople.slice(0, pairCount);
    const fallbackPeople = PEOPLE.slice();

    const pickPairPerson = (index: number, preferred: SimPerson[] | undefined) => {
        if (preferred && preferred[index]) return preferred[index];
        return fallbackPeople[index % fallbackPeople.length];
    };

    const teams: Team[] = [];
    for (let i = 0; i < nn; i++) {
        const teamName = pickTeamName(i);

        // Deterministic mixed pairing: one profile from each pool when available.
        const a = (i % 2 === 0) ? pickPairPerson(i, orderedWomen) : pickPairPerson(i, orderedMen);
        let b = (i % 2 === 0) ? pickPairPerson(i, orderedMen) : pickPairPerson(i, orderedWomen);
        if (a.name === b.name && a.birthDate === b.birthDate) {
            b = fallbackPeople[(i + pairCount) % fallbackPeople.length];
        }

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
            player2: b.name,
            player1YoB: a.yob,
            player2YoB: b.yob,
            player1BirthDate: a.birthDate,
            player2BirthDate: b.birthDate,
            player1IsReferee: aRef,
            player2IsReferee: bRef,
            isReferee: aRef || bRef,
            createdAt: Date.now()
        } as any);
    }

    return teams;
};
