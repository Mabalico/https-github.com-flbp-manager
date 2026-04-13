import type { Match, RefereeReportAuditEntry, RefereeReportAuditSource } from '../types';
import { uuid } from './id';

const cloneStats = (match: Match) => match.stats?.map((s) => ({ ...s }));

const cloneScoresByTeam = (match: Match) => {
    if (!match.scoresByTeam) return undefined;
    return { ...match.scoresByTeam };
};

const cloneEntries = (entries?: RefereeReportAuditEntry[]) =>
    (entries || []).filter(Boolean).map((entry) => ({
        ...entry,
        scoresByTeam: entry.scoresByTeam ? { ...entry.scoresByTeam } : undefined,
        stats: entry.stats?.map((s) => ({ ...s })),
    }));

const hasSavedReport = (match: Match) =>
    match.status === 'finished' || !!match.played || !!(match.stats && match.stats.length);

export const getRefereeReportAuditEntries = (match?: Match | null): RefereeReportAuditEntry[] =>
    cloneEntries(match?.refereeReportAudit);

export const getRefereeReportFinalEntry = (match?: Match | null): RefereeReportAuditEntry | null => {
    if (!match) return null;
    const entries = getRefereeReportAuditEntries(match);
    if (!entries.length) return null;
    const finalId = String(match.refereeReportFinalId || '').trim();
    if (!finalId && !hasSavedReport(match)) return null;
    return entries.find((entry) => entry.id === finalId) || entries[entries.length - 1] || null;
};

export const getRefereeReportDisplayAuthor = (match: Match) => {
    const finalEntry = getRefereeReportFinalEntry(match);
    if (finalEntry?.refereeName) return finalEntry.refereeName;
    const stored = String(match.refereeReportAuthorName || '').trim();
    if (stored) return stored;
    return hasSavedReport(match) ? 'Admin' : '';
};

const buildEntry = (match: Match, source: RefereeReportAuditSource, refereeName: string, savedAt = new Date().toISOString()): RefereeReportAuditEntry => ({
    id: uuid(),
    matchId: match.id,
    source,
    refereeName: String(refereeName || '').trim() || (source === 'admin' ? 'Admin' : 'Arbitro'),
    savedAt,
    scoreA: Number(match.scoreA || 0),
    scoreB: Number(match.scoreB || 0),
    scoresByTeam: cloneScoresByTeam(match),
    stats: cloneStats(match),
});

export const withRefereeReportAudit = (
    base: Match,
    updated: Match,
    input: { source: RefereeReportAuditSource; refereeName: string; savedAt?: string }
): Match => {
    const currentEntries = getRefereeReportAuditEntries(base);
    const previousFinal = getRefereeReportFinalEntry(base);
    const entries = [...currentEntries];

    if (hasSavedReport(base) && !previousFinal) {
        entries.push(buildEntry(
            base,
            base.refereeReportSource || input.source,
            base.refereeReportAuthorName || (base.refereeReportSource === 'referee' ? 'Arbitro' : 'Admin'),
            base.refereeReportSavedAt || new Date().toISOString()
        ));
    }

    const savedAt = input.savedAt || new Date().toISOString();
    const nextEntry = buildEntry(updated, input.source, input.refereeName, savedAt);

    return {
        ...updated,
        refereeReportAudit: [...entries, nextEntry],
        refereeReportFinalId: nextEntry.id,
        refereeReportSource: input.source,
        refereeReportAuthorName: nextEntry.refereeName,
        refereeReportSavedAt: savedAt,
    };
};

export const stripRefereeReportAuditFromMatch = (match: Match): Match => {
    const {
        refereeReportAudit,
        refereeReportFinalId,
        refereeReportSource,
        refereeReportAuthorName,
        refereeReportSavedAt,
        ...rest
    } = match;
    return rest;
};

export const clearRefereeReportFromMatch = (match: Match): Match => {
    const nextScores = match.scoresByTeam
        ? Object.fromEntries(Object.keys(match.scoresByTeam).map((key) => [key, 0]))
        : undefined;

    return {
        ...match,
        scoreA: 0,
        scoreB: 0,
        scoresByTeam: nextScores,
        played: false,
        status: 'scheduled',
        stats: undefined,
        refereeReportFinalId: undefined,
        refereeReportSource: undefined,
        refereeReportAuthorName: undefined,
        refereeReportSavedAt: undefined,
    };
};

export const buildRefereeReportCounterRows = (matches: Match[]) => {
    const counts = new Map<string, number>();
    (matches || []).forEach((match) => {
        const author = getRefereeReportDisplayAuthor(match);
        if (!author) return;
        if (!hasSavedReport(match)) return;
        counts.set(author, (counts.get(author) || 0) + 1);
    });
    return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};
