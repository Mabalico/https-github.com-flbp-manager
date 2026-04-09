import type { AppState } from './storageService';
import { APP_STATE_SCHEMA_VERSION, coerceAppState } from './storageService';
import type { HallOfFameEntry, IntegrationScorerEntry, Team, TournamentData, Match } from '../types';
import type { AdminPlayerAccountCatalogRow, AdminUserRoleRow } from './supabaseRest';
import { normalizeNameLower } from './textUtils';

export interface BackupMergeSummary {
    teams: number;
    tournamentHistory: number;
    hallOfFame: number;
    integrationsScorers: number;
    aliases: number;
    importedLiveTournament: boolean;
}

export interface BackupMergeResult {
    state: AppState;
    warnings: string[];
    summary: BackupMergeSummary;
}

export interface BackupPlayerAccountsExport {
    exportedAt: string;
    source: 'supabase_live_admin';
    passwordsIncluded: false;
    restoreSupported: false;
    accounts: AdminPlayerAccountCatalogRow[];
    adminUsers: AdminUserRoleRow[];
}

export interface UnifiedBackupJsonExport {
    exportType: 'flbp_unified_backup';
    schemaVersion: number;
    exportedAt: string;
    state: AppState;
    playerAccounts?: BackupPlayerAccountsExport;
}

const normalize = (v: string) => normalizeNameLower(v || '');


export interface BackupCompatibilitySummary {
    teams: number;
    matches: number;
    hasLiveTournament: boolean;
    tournamentHistory: number;
    hallOfFame: number;
    integrationsScorers: number;
    aliases: number;
    liveTeamsWithLegacyYoB: number;
    liveTournamentTeamsWithLegacyYoB: number;
    historyTeamsWithLegacyYoB: number;
    scorerEntriesWithLegacyYoB: number;
}

export interface BackupCompatibilityReport {
    isValid: boolean;
    wrapper: 'raw' | 'state' | 'invalid';
    schemaVersion: number | null;
    knownRootKeysFound: string[];
    missingRootKeys: string[];
    warnings: string[];
    blockers: string[];
    profile: 'modern' | 'legacy-compatible';
    summary: BackupCompatibilitySummary;
}

const APP_STATE_ROOT_KEYS = [
    '__schemaVersion',
    'teams',
    'matches',
    'tournament',
    'tournamentMatches',
    'tournamentHistory',
    'logo',
    'hallOfFame',
    'integrationsScorers',
    'playerAliases'
] as const;

const extractStatePayload = (raw: any): AppState => {
    const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.state && typeof raw.state === 'object'
        ? raw.state
        : raw;
    return coerceAppState(candidate);
};

const hasLegacyYoB = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value > 0;

const countTeamsWithLegacyYoB = (teams: Team[] | undefined | null): number =>
    Array.isArray(teams)
        ? teams.filter((team) => hasLegacyYoB((team as any)?.player1YoB) || hasLegacyYoB((team as any)?.player2YoB)).length
        : 0;

const countScorersWithLegacyYoB = (entries: IntegrationScorerEntry[] | undefined | null): number =>
    Array.isArray(entries)
        ? entries.filter((entry) => hasLegacyYoB((entry as any)?.yob)).length
        : 0;

export const parseBackupJsonState = (raw: any): AppState => extractStatePayload(raw);


const hasUsableBirthDate = (value: unknown): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const stripRedundantTeamYoB = (team: Team): Team => {
    const next: Team = { ...team };
    if (hasUsableBirthDate((next as any).player1BirthDate)) delete (next as any).player1YoB;
    if (hasUsableBirthDate((next as any).player2BirthDate)) delete (next as any).player2YoB;
    return next;
};

const stripRedundantScorerYoB = (entry: IntegrationScorerEntry): IntegrationScorerEntry => {
    const next: IntegrationScorerEntry = { ...entry };
    if (hasUsableBirthDate((next as any).birthDate)) delete (next as any).yob;
    return next;
};

const stripRedundantTournamentYoB = (tournament: TournamentData | null | undefined): TournamentData | null => {
    if (!tournament) return null;
    return {
        ...tournament,
        teams: Array.isArray(tournament.teams) ? tournament.teams.map(stripRedundantTeamYoB) : []
    };
};

export const buildBackupJsonExportState = (raw: AppState): AppState => {
    const coerced = coerceAppState(raw);
    return {
        ...coerced,
        __schemaVersion: APP_STATE_SCHEMA_VERSION,
        teams: Array.isArray(coerced.teams) ? coerced.teams.map(stripRedundantTeamYoB) : [],
        tournament: stripRedundantTournamentYoB(coerced.tournament),
        tournamentHistory: Array.isArray(coerced.tournamentHistory)
            ? coerced.tournamentHistory.map((tournament) => stripRedundantTournamentYoB(tournament) as TournamentData)
            : [],
        integrationsScorers: Array.isArray(coerced.integrationsScorers)
            ? coerced.integrationsScorers.map(stripRedundantScorerYoB)
            : []
    };
};

export const buildUnifiedBackupJsonExport = (
    raw: AppState,
    options?: {
        playerAccounts?: {
            accounts: AdminPlayerAccountCatalogRow[];
            adminUsers: AdminUserRoleRow[];
        } | null;
    }
): UnifiedBackupJsonExport => {
    const exportedAt = new Date().toISOString();
    const payload: UnifiedBackupJsonExport = {
        exportType: 'flbp_unified_backup',
        schemaVersion: APP_STATE_SCHEMA_VERSION,
        exportedAt,
        state: buildBackupJsonExportState(raw),
    };

    if (options?.playerAccounts) {
        payload.playerAccounts = {
            exportedAt,
            source: 'supabase_live_admin',
            passwordsIncluded: false,
            restoreSupported: false,
            accounts: Array.isArray(options.playerAccounts.accounts)
                ? options.playerAccounts.accounts.map((row) => ({ ...row }))
                : [],
            adminUsers: Array.isArray(options.playerAccounts.adminUsers)
                ? options.playerAccounts.adminUsers.map((row) => ({ ...row }))
                : [],
        };
    }

    return payload;
};


export const inspectBackupJsonState = (raw: any): BackupCompatibilityReport => {
    const emptySummary: BackupCompatibilitySummary = {
        teams: 0,
        matches: 0,
        hasLiveTournament: false,
        tournamentHistory: 0,
        hallOfFame: 0,
        integrationsScorers: 0,
        aliases: 0,
        liveTeamsWithLegacyYoB: 0,
        liveTournamentTeamsWithLegacyYoB: 0,
        historyTeamsWithLegacyYoB: 0,
        scorerEntriesWithLegacyYoB: 0
    };

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            isValid: false,
            wrapper: 'invalid',
            schemaVersion: null,
            knownRootKeysFound: [],
            missingRootKeys: [...APP_STATE_ROOT_KEYS],
            warnings: [],
            blockers: ['Il file non contiene un oggetto JSON valido compatibile con il backup FLBP.'],
            profile: 'legacy-compatible',
            summary: emptySummary
        };
    }

    const wrapper = raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state) ? 'state' : 'raw';
    const candidate = wrapper === 'state' ? raw.state : raw;
    const presentRootKeys = APP_STATE_ROOT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(candidate, key));

    if (!presentRootKeys.length) {
        return {
            isValid: false,
            wrapper: 'invalid',
            schemaVersion: null,
            knownRootKeysFound: [],
            missingRootKeys: [...APP_STATE_ROOT_KEYS],
            warnings: [],
            blockers: ['Il file JSON non espone nessuna chiave radice riconosciuta dello stato app.'],
            profile: 'legacy-compatible',
            summary: emptySummary
        };
    }

    const coerced = coerceAppState(candidate);
    const missingRootKeys = APP_STATE_ROOT_KEYS.filter((key) => !presentRootKeys.includes(key));
    const warnings: string[] = [];

    if (wrapper === 'state') {
        warnings.push("Backup con wrapper \"state\": verrà letto correttamente anche sull'app attuale.");
    }
    if (missingRootKeys.length) {
        warnings.push(`Chiavi radice assenti ma recuperabili con fallback safe: ${missingRootKeys.join(', ')}.`);
    }

    const schemaVersion = typeof (candidate as any).__schemaVersion === 'number' ? Number((candidate as any).__schemaVersion) : null;
    if (schemaVersion === null) {
        warnings.push('Schema version assente: il restore resta compatibile, ma viene trattato come snapshot legacy.');
    } else if (schemaVersion > APP_STATE_SCHEMA_VERSION) {
        warnings.push(`Schema version ${schemaVersion} più nuova dell'app (${APP_STATE_SCHEMA_VERSION}): restore best-effort, verifica i nuovi campi dopo l'import.`);
    }

    const liveTeamsWithLegacyYoB = countTeamsWithLegacyYoB(coerced.teams);
    const liveTournamentTeamsWithLegacyYoB = countTeamsWithLegacyYoB(coerced.tournament?.teams);
    const historyTeamsWithLegacyYoB = Array.isArray(coerced.tournamentHistory)
        ? coerced.tournamentHistory.reduce((acc, tournament) => acc + countTeamsWithLegacyYoB(tournament?.teams), 0)
        : 0;
    const scorerEntriesWithLegacyYoB = countScorersWithLegacyYoB(coerced.integrationsScorers);
    const totalLegacyYoB = liveTeamsWithLegacyYoB + liveTournamentTeamsWithLegacyYoB + historyTeamsWithLegacyYoB + scorerEntriesWithLegacyYoB;

    const profile: BackupCompatibilityReport['profile'] = totalLegacyYoB > 0 ? 'legacy-compatible' : 'modern';

    if (profile === 'legacy-compatible') {
        warnings.push(
            `Sono presenti campi legacy YoB nel backup (squadre live: ${liveTeamsWithLegacyYoB}, torneo live: ${liveTournamentTeamsWithLegacyYoB}, storico: ${historyTeamsWithLegacyYoB}, integrazioni marcatori: ${scorerEntriesWithLegacyYoB}). Il restore è compatibile, ma la rimozione hard della legacy YoB non è ancora sicura per questo file.`
        );
    } else {
        warnings.push('Backup moderno: nessun campo legacy YoB rilevato nel file analizzato.');
    }

    return {
        isValid: true,
        wrapper,
        schemaVersion,
        knownRootKeysFound: presentRootKeys as string[],
        missingRootKeys,
        warnings,
        blockers: [],
        profile,
        summary: {
            teams: Array.isArray(coerced.teams) ? coerced.teams.length : 0,
            matches: Array.isArray(coerced.matches) ? coerced.matches.length : 0,
            hasLiveTournament: !!coerced.tournament,
            tournamentHistory: Array.isArray(coerced.tournamentHistory) ? coerced.tournamentHistory.length : 0,
            hallOfFame: Array.isArray(coerced.hallOfFame) ? coerced.hallOfFame.length : 0,
            integrationsScorers: Array.isArray(coerced.integrationsScorers) ? coerced.integrationsScorers.length : 0,
            aliases: coerced.playerAliases ? Object.keys(coerced.playerAliases).length : 0,
            liveTeamsWithLegacyYoB,
            liveTournamentTeamsWithLegacyYoB,
            historyTeamsWithLegacyYoB,
            scorerEntriesWithLegacyYoB
        }
    };
};

const upsertBy = <T,>(base: T[], incoming: T[], keyOf: (value: T) => string): T[] => {
    const map = new Map<string, T>();
    [...base, ...incoming].forEach((item) => {
        map.set(keyOf(item), item);
    });
    return Array.from(map.values());
};

const teamKey = (team: Team): string => {
    const id = String(team?.id || '').trim();
    if (id && id !== 'BYE') return `id:${id}`;
    return `sem:${normalize(team?.name || '')}|${normalize(team?.player1 || '')}|${normalize(team?.player2 || '')}`;
};

const tournamentKey = (tournament?: TournamentData | null): string => {
    if (!tournament) return '';
    const id = String(tournament.id || '').trim();
    if (id) return `id:${id}`;
    return `sem:${normalize(tournament.name || '')}|${String(tournament.startDate || '').trim()}|${String(tournament.type || '').trim()}`;
};

const hallOfFameKey = (entry: HallOfFameEntry): string => {
    const id = String(entry?.id || '').trim();
    if (id) return `id:${id}`;
    return `sem:${entry.tournamentId}|${entry.type}|${entry.playerId || ''}|${normalize(entry.teamName || '')}|${(entry.playerNames || []).map(normalize).join('|')}`;
};

const scorerKey = (entry: IntegrationScorerEntry): string => {
    const id = String(entry?.id || '').trim();
    if (id) return `id:${id}`;
    return `sem:${normalize(entry.name || '')}|${entry.yob ?? 'ND'}|${normalize(entry.source || '')}`;
};

const legacyMatchKey = (match: Match): string => {
    const id = String(match?.id || '').trim();
    if (id) return `id:${id}`;
    return `sem:${String(match?.code || '').trim()}|${String(match?.phase || '').trim()}|${match?.round ?? ''}|${match?.orderIndex ?? ''}`;
};

export const mergeBackupJsonState = (currentRaw: any, incomingRaw: any): BackupMergeResult => {
    const current = coerceAppState(currentRaw);
    const incoming = extractStatePayload(incomingRaw);
    const warnings: string[] = [];

    const teams = upsertBy(current.teams || [], incoming.teams || [], teamKey);
    const matches = upsertBy(current.matches || [], incoming.matches || [], legacyMatchKey);
    let tournamentHistory = upsertBy(current.tournamentHistory || [], incoming.tournamentHistory || [], tournamentKey);
    const hallOfFame = upsertBy(current.hallOfFame || [], incoming.hallOfFame || [], hallOfFameKey);
    const integrationsScorers = upsertBy(current.integrationsScorers || [], incoming.integrationsScorers || [], scorerKey);
    const playerAliases = { ...(current.playerAliases || {}), ...(incoming.playerAliases || {}) };

    let tournament = current.tournament;
    let tournamentMatches = current.tournamentMatches || [];
    let importedLiveTournament = false;

    const currentLiveKey = tournamentKey(current.tournament);
    const incomingLiveKey = tournamentKey(incoming.tournament);

    if (!current.tournament && incoming.tournament) {
        tournament = incoming.tournament;
        tournamentMatches = incoming.tournamentMatches || incoming.tournament.matches || [];
        importedLiveTournament = true;
    } else if (current.tournament && incoming.tournament && currentLiveKey && incomingLiveKey && currentLiveKey === incomingLiveKey) {
        tournament = incoming.tournament;
        tournamentMatches = incoming.tournamentMatches || incoming.tournament.matches || [];
        importedLiveTournament = true;
    } else if (current.tournament && incoming.tournament && currentLiveKey !== incomingLiveKey) {
        tournamentHistory = upsertBy(
            tournamentHistory,
            [{
                ...incoming.tournament,
                matches: incoming.tournamentMatches || incoming.tournament.matches || []
            }],
            tournamentKey
        );
        importedLiveTournament = true;
    }

    const next = coerceAppState({
        ...current,
        teams,
        matches,
        tournament,
        tournamentMatches,
        tournamentHistory,
        hallOfFame,
        integrationsScorers,
        playerAliases,
        logo: incoming.logo || current.logo || ''
    });

    return {
        state: next,
        warnings,
        summary: {
            teams: teams.length,
            tournamentHistory: tournamentHistory.length,
            hallOfFame: hallOfFame.length,
            integrationsScorers: integrationsScorers.length,
            aliases: Object.keys(playerAliases).length,
            importedLiveTournament
        }
    };
};
