import React from 'react';
import { useTranslation } from '../../App';
import type { AppState } from '../../services/storageService';
import type { Match, Team, TournamentData } from '../../types';
import { downloadBlob } from '../../services/adminDownloadUtils';
import { getMatchParticipantIds } from '../../services/matchUtils';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../services/formInputUX';

type SlotConfig = {
    id: string;
    callTime: string;
    matchesCount: number;
    assignedMatchIds?: string[];
    annotateRepeatedTeams?: boolean;
};
const SOCIAL_GRAPHICS_STORAGE_KEY = 'flbp_social_graphics_v1';

type StoredSocialGraphicsConfig = {
    prelimStartTime?: string;
    prelimCallTime?: string;
    slots?: Array<Partial<SlotConfig>>;
    selectedStoryKey?: string;
    autoFirstCallTime?: string;
    autoIntervalMinutes?: number;
    autoTeamsPerTurn?: number;
};

function getDefaultSocialGraphicsConfig() {
    return {
        prelimStartTime: '16:00',
        prelimCallTime: '15:30',
        slots: [
            { id: safeId(), callTime: '15:30', matchesCount: 8 },
            { id: safeId(), callTime: '16:00', matchesCount: 8 },
        ] as SlotConfig[],
        selectedStoryKey: 'prelims' as const,
        autoFirstCallTime: '15:30',
        autoIntervalMinutes: 30,
        autoTeamsPerTurn: 16,
    };
}

function loadSocialGraphicsConfig() {
    const d = getDefaultSocialGraphicsConfig();
    // Guard: SSR / non-browser environments
    if (typeof window === 'undefined') return d;

    try {
        const raw = window.localStorage.getItem(SOCIAL_GRAPHICS_STORAGE_KEY);
        if (!raw) return d;
        const parsed = JSON.parse(raw) as StoredSocialGraphicsConfig;

        const prelimStartTime = typeof parsed.prelimStartTime === 'string' ? parsed.prelimStartTime : d.prelimStartTime;
        const prelimCallTime = typeof parsed.prelimCallTime === 'string' ? parsed.prelimCallTime : d.prelimCallTime;

        const slots: SlotConfig[] = Array.isArray(parsed.slots)
            ? parsed.slots
                  .map(s => ({
                      id: typeof s.id === 'string' && s.id ? s.id : safeId(),
                      callTime: typeof s.callTime === 'string' ? s.callTime : '',
                      matchesCount:
                          typeof (s as any).matchesCount === 'number' && Number.isFinite((s as any).matchesCount)
                              ? (s as any).matchesCount
                              : typeof (s as any).teamsCount === 'number' && Number.isFinite((s as any).teamsCount)
                                ? Math.floor(((s as any).teamsCount as number) / 2)
                                : 0,
                      assignedMatchIds: Array.isArray((s as any).assignedMatchIds)
                          ? (s as any).assignedMatchIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
                          : undefined,
                      annotateRepeatedTeams: !!(s as any).annotateRepeatedTeams,
                  }))
                  .filter(s => s.callTime.trim() || s.matchesCount > 0)
            : d.slots;

        const selectedStoryKey = typeof parsed.selectedStoryKey === 'string' ? parsed.selectedStoryKey : d.selectedStoryKey;
        const autoFirstCallTime = typeof parsed.autoFirstCallTime === 'string' ? parsed.autoFirstCallTime : d.autoFirstCallTime;
        const autoIntervalMinutes = typeof parsed.autoIntervalMinutes === 'number' && Number.isFinite(parsed.autoIntervalMinutes)
            ? Math.max(5, Math.floor(parsed.autoIntervalMinutes))
            : d.autoIntervalMinutes;
        const autoTeamsPerTurn = typeof parsed.autoTeamsPerTurn === 'number' && Number.isFinite(parsed.autoTeamsPerTurn)
            ? Math.max(2, Math.floor(parsed.autoTeamsPerTurn))
            : d.autoTeamsPerTurn;

        return {
            prelimStartTime,
            prelimCallTime,
            slots: slots.length ? slots : d.slots,
            selectedStoryKey,
            autoFirstCallTime,
            autoIntervalMinutes,
            autoTeamsPerTurn,
        };
    } catch {
        return d;
    }
}


type Story =
    | {
          kind: 'prelims';
          title: string;
          subtitle: string;
          lines: string[]; // "Team A vs Team B"
          bg: 'prelims';
          startTime: string;
          callTime: string;
          date?: string; // DD/MM/YYYY
      }
    | {
          kind: 'slot';
          title: string;
          subtitle: string;
          lines: string[]; // "Team A vs Team B"
          bg: 'slot';
          startTime: string;
          callTime: string;
          date?: string; // DD/MM/YYYY
      };

const isByeOrTbd = (id?: string) => {
    const v = String(id || '').trim().toUpperCase();
    return v === 'BYE' || v === 'TBD' || v.startsWith('TBD-');
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const STORY_MAX_MATCHUPS = 8;

function safeId() {
    return Math.random().toString(36).slice(2, 10);
}

function chunkArray<T>(arr: T[], size: number) {
    const s = Math.max(1, Math.floor(size || 1));
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
    return out;
}

function teamDisplayName(t: Team) {
    const p2 = t.player2 ? ` & ${t.player2}` : '';
    const p1 = t.player1 ? `${t.player1}` : '';
    const players = (p1 || t.player2) ? ` (${p1}${p2})` : '';
    return `${t.name}${players}`.trim();
}

function getBracketPreliminaryMatches(matches: Match[], teamsById: Record<string, Team | undefined>) {
    const bracketMatches = (matches || []).filter(m => m.phase === 'bracket');
    const rounds = new Map<string, Match[]>();

    bracketMatches.forEach(match => {
        const roundKey = `${match.round ?? 'na'}::${String(match.roundName || '').trim()}`;
        if (!rounds.has(roundKey)) rounds.set(roundKey, []);
        rounds.get(roundKey)!.push(match);
    });

    return Array.from(rounds.values())
        .sort((a, b) => {
            const roundA = a[0]?.round ?? Number.MAX_SAFE_INTEGER;
            const roundB = b[0]?.round ?? Number.MAX_SAFE_INTEGER;
            if (roundA !== roundB) return roundA - roundB;
            return (a[0]?.orderIndex ?? 0) - (b[0]?.orderIndex ?? 0);
        })
        .flatMap(roundMatches => {
            const hasAnyBye = roundMatches.some(
                match =>
                    match.isBye ||
                    isByeOrTbd(match.teamAId) ||
                    isByeOrTbd(match.teamBId)
            );
            if (!hasAnyBye) return [] as Array<{ match: Match; a: Team; b: Team }>;

            return roundMatches
                .filter(match => !match.hidden && !match.isBye)
                .filter(match => !isByeOrTbd(match.teamAId) && !isByeOrTbd(match.teamBId))
                .map(match => {
                    const ids = getMatchParticipantIds(match);
                    const a = ids[0] ? teamsById[ids[0]] : undefined;
                    const b = ids[1] ? teamsById[ids[1]] : undefined;
                    if (!isRealSocialTeam(a) || !isRealSocialTeam(b)) return null;
                    return { match, a, b };
                })
                .filter(Boolean) as Array<{ match: Match; a: Team; b: Team }>;
        })
        .sort((a, b) => (a.match.orderIndex ?? 0) - (b.match.orderIndex ?? 0));
}

function getBracketPrelims(matches: Match[], teamsById: Record<string, Team | undefined>) {
    return getBracketPreliminaryMatches(matches, teamsById).map(({ a, b }) => ({ a, b }));
}


function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function parseHHMM(v: string): { h: number; m: number } | null {
    const m = /^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(v || '');
    if (!m) return null;
    const hh = clamp(Number(m[1]), 0, 23);
    const mm = clamp(Number(m[2]), 0, 59);
    return { h: hh, m: mm };
}

function timeMinusMinutes(v: string, minutes: number) {
    const t = parseHHMM(v);
    if (!t) return '';
    let total = t.h * 60 + t.m - minutes;
    while (total < 0) total += 24 * 60;
    total = total % (24 * 60);
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function timePlusMinutes(v: string, minutes: number) {
    const t = parseHHMM(v);
    if (!t) return '';
    let total = t.h * 60 + t.m + minutes;
    while (total < 0) total += 24 * 60;
    total = total % (24 * 60);
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function formatDateDDMMYYYY(dateLike?: string) {
    if (!dateLike) return undefined;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return undefined;
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const SIDE_NOTE_PREFIX = '⟦';
const SIDE_NOTE_SUFFIX = '⟧';

function formatAnnotatedSide(text: string, note?: string) {
    const base = String(text || '').trim();
    const suffix = note ? ` ${SIDE_NOTE_PREFIX}${note}${SIDE_NOTE_SUFFIX}` : '';
    return `${base}${suffix}`.trim();
}

function parseAnnotatedSide(raw: string) {
    const value = String(raw || '').trim();
    const m = /^(.*?)(?:\s*⟦([^⟧]+)⟧)?$/.exec(value);
    if (!m) return { text: value, note: '' };
    return { text: String(m[1] || '').trim(), note: String(m[2] || '').trim() };
}

function buildOddSlotAssignments(callableMatches: Match[], teamsPerTurn: number, firstCallTime: string, intervalMinutes: number) {
    const normalizedTeamsPerTurn = Math.max(2, Math.floor(teamsPerTurn || 0));
    const teamFirstMatch = new Map<string, Match>();

    callableMatches.forEach(match => {
        for (const teamId of getMatchParticipantIds(match)) {
            if (!teamFirstMatch.has(teamId)) teamFirstMatch.set(teamId, match);
        }
    });

    const orderedTeamIds = Array.from(teamFirstMatch.entries())
        .sort((a, b) => {
            const ma = a[1];
            const mb = b[1];
            const orderDelta = (ma.orderIndex ?? 0) - (mb.orderIndex ?? 0);
            if (orderDelta !== 0) return orderDelta;
            return a[0].localeCompare(b[0]);
        })
        .map(([teamId]) => teamId);

    const teamChunks = chunkArray<string>(orderedTeamIds, normalizedTeamsPerTurn);
    const seenTeams = new Set<string>();

    return teamChunks.map((teamIds, slotIndex) => {
        const selectedMatches = teamIds
            .map(teamId => teamFirstMatch.get(teamId))
            .filter(Boolean) as Match[];

        const uniqueMatches = selectedMatches
            .filter((match, index, arr) => arr.findIndex(candidate => candidate.id === match.id) === index)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

        const repeatedTeamIds = new Set<string>();
        uniqueMatches.forEach(match => {
            for (const teamId of getMatchParticipantIds(match)) {
                if (seenTeams.has(teamId)) repeatedTeamIds.add(teamId);
            }
        });

        uniqueMatches.forEach(match => {
            for (const teamId of getMatchParticipantIds(match)) seenTeams.add(teamId);
        });

        return {
            id: safeId(),
            callTime: timePlusMinutes(firstCallTime, slotIndex * intervalMinutes),
            matchesCount: uniqueMatches.length,
            assignedMatchIds: uniqueMatches.map(match => match.id),
            annotateRepeatedTeams: repeatedTeamIds.size > 0,
        } as SlotConfig;
    });
}

function toPairs(teams: Team[]) {
    const pairs: { a: Team; b: Team }[] = [];
    for (let i = 0; i + 1 < teams.length; i += 2) {
        pairs.push({ a: teams[i], b: teams[i + 1] });
    }
    return pairs;
}

function isRealSocialTeam(team?: Team) {
    return !!team && !team.hidden && !team.isBye && !isByeOrTbd(team.id) && !isByeOrTbd(team.name);
}

function sanitizeSlotAssignmentsForCallableMatches(slots: SlotConfig[], callableMatches: Match[]) {
    const callableMatchIds = new Set((callableMatches || []).map(match => match.id));
    let changed = false;
    const nextSlots = (slots || []).map(slot => {
        const currentAssigned = Array.isArray(slot.assignedMatchIds)
            ? slot.assignedMatchIds.filter(matchId => typeof matchId === 'string' && matchId.trim().length > 0)
            : [];
        const cleanedAssigned = currentAssigned.filter(matchId => callableMatchIds.has(matchId));
        const changedAssigned = cleanedAssigned.length !== currentAssigned.length
            || cleanedAssigned.some((id, index) => id !== currentAssigned[index]);
        if (!changedAssigned) return slot;
        changed = true;
        return {
            ...slot,
            assignedMatchIds: cleanedAssigned.length ? cleanedAssigned : undefined,
            matchesCount: cleanedAssigned.length ? cleanedAssigned.length : slot.matchesCount,
            annotateRepeatedTeams: cleanedAssigned.length ? !!slot.annotateRepeatedTeams : false,
        };
    });
    return { nextSlots, changed };
}

function getCallableSocialMatches(matches: Match[], teamsById: Record<string, Team | undefined>) {
    const preliminaryMatchIds = new Set(getBracketPreliminaryMatches(matches, teamsById).map(({ match }) => match.id));
    return (matches || [])
        .filter(m => !m.hidden && !m.isBye)
        .filter(m => !preliminaryMatchIds.has(m.id))
        .filter(m => {
            const ids = getMatchParticipantIds(m);
            return ids.length === 2 && ids.every(id => !isByeOrTbd(id));
        })
        .filter(m => {
            const ids = getMatchParticipantIds(m);
            const a = teamsById[ids[0]];
            const b = teamsById[ids[1]];
            return isRealSocialTeam(a) && isRealSocialTeam(b);
        })
        .slice()
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

function formatCallableMatchLine(
    match: Match,
    teamsById: Record<string, Team | undefined>,
    repeatedTeamIds: string[] = [],
    repeatedTeamLabel?: string
) {
    const ids = getMatchParticipantIds(match);
    const a = ids[0] ? teamsById[ids[0]] : undefined;
    const b = ids[1] ? teamsById[ids[1]] : undefined;
    if (!a || !b) return '';
    const left = formatAnnotatedSide(a.name, repeatedTeamIds.includes(a.id) ? repeatedTeamLabel : undefined);
    const right = formatAnnotatedSide(b.name, repeatedTeamIds.includes(b.id) ? repeatedTeamLabel : undefined);
    return `${left} vs ${right}`;
}

function formatCallableMatchSummary(match: Match, teamsById: Record<string, Team | undefined>) {
    const ids = getMatchParticipantIds(match);
    const a = ids[0] ? teamsById[ids[0]] : undefined;
    const b = ids[1] ? teamsById[ids[1]] : undefined;
    if (!a || !b) return `#${match.orderIndex ?? 0}`;
    const orderLabel = typeof match.orderIndex === 'number' ? `#${match.orderIndex}` : '#–';
    const roundLabel = String(match.roundName || '').trim() || (typeof match.round === 'number' ? `Round ${match.round}` : 'Round');
    return `${orderLabel} · ${a.name} vs ${b.name} · ${roundLabel}`;
}


function splitMatchupLine(line: string) {
    const cleaned = String(line || '').replace(/\s+/g, ' ').trim();

    // Prefer explicit "vs" separator used by the generator, but be tolerant to variations.
    const m =
        /^(.+?)\s+(?:vs\.?|v\.?|VS)\s+(.+?)$/i.exec(cleaned) ||
        /^(.+?)\s+[–—-]\s+(.+?)$/i.exec(cleaned);

    if (!m) {
        const parsedSingle = parseAnnotatedSide(cleaned);
        return { a: parsedSingle.text, aNote: parsedSingle.note, b: '', bNote: '' };
    }
    const left = parseAnnotatedSide((m[1] || '').trim());
    const right = parseAnnotatedSide((m[2] || '').trim());
    return { a: left.text, aNote: left.note, b: right.text, bNote: right.note };
}

function dataUrlToBlob(dataUrl: string): Blob {
    const s = String(dataUrl || '');
    const comma = s.indexOf(',');
    if (comma === -1) return new Blob([], { type: 'application/octet-stream' });

    const meta = s.slice(0, comma);
    const b64 = s.slice(comma + 1);
    const mimeMatch = /data:([^;]+);base64/i.exec(meta);
    const mime = mimeMatch?.[1] || 'application/octet-stream';

    // atob is available in browsers; fallback to empty blob if not.
    const atobFn: any = typeof atob === 'function' ? atob : (typeof (globalThis as any).atob === 'function' ? (globalThis as any).atob : null);
    if (!atobFn) return new Blob([], { type: mime });

    const bin = atobFn(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function drawStoryToPng(
    story: Story,
    fileKey?: string,
    onRendered?: (blob: Blob, filename: string) => void
) {
    const r = renderStoryToPngDataUrl(story, fileKey);
    if (!r) return;

    const { dataUrl, filename } = r;
    const blob = dataUrlToBlob(dataUrl);
    try {
        onRendered?.(blob, filename);
    } catch {
        // never block downloads if the callback fails
    }
    downloadBlob(blob, filename);
}

function renderStoryToPngDataUrl(story: Story, fileKey?: string) {
    // Guard: SSR / non-browser environments
    if (typeof document === 'undefined') return null;

    // IG story 9:16 @ 1080x1920 (match reference samples)
    const w = 1080;
    const h = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const isPrelims = story.bg === 'prelims';

    // Background gradient (tuned to match provided reference images)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isPrelims) {
        grad.addColorStop(0, '#F8473D');
        grad.addColorStop(0.55, '#F63A63');
        grad.addColorStop(1, '#E52D6B');
    } else {
        grad.addColorStop(0, '#1C4B8F');
        grad.addColorStop(0.55, '#1F7BAA');
        grad.addColorStop(1, '#28B2BF');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Helpers
    const cx = w / 2;
    const fontFamily = `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial`;

    function roundedRect(x: number, y: number, ww: number, hh: number, rr: number) {
        const r2 = Math.min(rr, ww / 2, hh / 2);
        ctx.beginPath();
        ctx.moveTo(x + r2, y);
        ctx.arcTo(x + ww, y, x + ww, y + hh, r2);
        ctx.arcTo(x + ww, y + hh, x, y + hh, r2);
        ctx.arcTo(x, y + hh, x, y, r2);
        ctx.arcTo(x, y, x + ww, y, r2);
        ctx.closePath();
    }

    function drawClockIcon(x: number, y: number, size: number) {
        const r = size / 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(6, Math.round(size * 0.09));
        ctx.lineCap = 'round';
        // circle
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        // hands
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r * 0.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 0.35, r * 0.15);
        ctx.stroke();
        ctx.restore();
    }

    function drawFlameIcon(x: number, y: number, size: number) {
        // Simple outline flame inspired by lucide style
        const s = size;
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(6, Math.round(s * 0.09));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(0, -s * 0.42);
        ctx.bezierCurveTo(s * 0.22, -s * 0.18, s * 0.28, -s * 0.02, s * 0.22, s * 0.18);
        ctx.bezierCurveTo(s * 0.12, s * 0.52, -s * 0.12, s * 0.52, -s * 0.22, s * 0.18);
        ctx.bezierCurveTo(-s * 0.30, -s * 0.04, -s * 0.16, -s * 0.26, 0, -s * 0.42);
        ctx.closePath();
        ctx.stroke();

        // inner droplet
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.15);
        ctx.bezierCurveTo(s * 0.08, -s * 0.04, s * 0.06, s * 0.10, 0, s * 0.18);
        ctx.bezierCurveTo(-s * 0.06, s * 0.10, -s * 0.08, -s * 0.04, 0, -s * 0.15);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    // Header
    const iconY = 280;
    const iconSize = 104;
    if (isPrelims) drawFlameIcon(cx, iconY, iconSize);
    else drawClockIcon(cx, iconY, iconSize);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const headerMainY = 520;
    if (isPrelims) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `900 120px ${fontFamily}`;
        ctx.fillText('PRELIMINARI', cx, headerMainY);

        ctx.font = `900 56px ${fontFamily}`;
        ctx.fillText(`INIZIO ${story.startTime}`, cx, headerMainY + 86);

        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.font = `900 52px ${fontFamily}`;
        ctx.fillText(`CONVOCAZIONE ${story.callTime}`, cx, headerMainY + 152);
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `900 160px ${fontFamily}`;
        ctx.fillText(story.startTime, cx, headerMainY);

        ctx.font = `900 56px ${fontFamily}`;
        ctx.fillText('INIZIO PARTITE', cx, headerMainY + 86);

        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.font = `900 52px ${fontFamily}`;
        ctx.fillText(`CONVOCAZIONE ${story.callTime}`, cx, headerMainY + 152);
    }

    // Matches list
    const baseListTop = 750;
    const cardW = 900;
    const baseCardH = 82;
    const baseGap = 22;

    // Ensure the full list never collides with the bottom divider/date, even with many matches.
    // Keeps the reference look for normal counts, and only compresses when it would overflow.
    function computeListMetrics(count: number) {
        const listTop = baseListTop;
        const listBottomMax = 1630; // keep clear of the bottom divider at 1680
        const minGap = 10;
        const minCardH = 66;

        const n = Math.max(0, count | 0);
        const available = listBottomMax - listTop;

        // Default (reference)
        if (n <= 1) return { listTop, cardH: baseCardH, gap: baseGap };

        const required = n * baseCardH + (n - 1) * baseGap;
        if (required <= available) return { listTop, cardH: baseCardH, gap: baseGap };

        // 1) Reduce gap first (preserves the card look)
        let gap = (available - n * baseCardH) / (n - 1);
        gap = Math.max(minGap, Math.min(baseGap, gap));
        let cardH = baseCardH;

        // 2) If still overflowing, reduce card height too (bounded to keep text readable)
        if (n * cardH + (n - 1) * gap > available) {
            gap = minGap;
            cardH = Math.floor((available - (n - 1) * gap) / n);
            cardH = Math.max(minCardH, Math.min(baseCardH, cardH));
        }

        return { listTop, cardH, gap };
    }

    const { listTop, cardH, gap } = computeListMetrics(story.lines.length);
    const cardX = (w - cardW) / 2;
    let y = listTop;

    const vsColor = isPrelims ? '#EB3856' : '#3264CE';
    const cardFill = '#E9F2F7';
    const cardStroke = 'rgba(15, 23, 42, 0.10)';

    for (const line of story.lines) {
        // Card with subtle shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;

        roundedRect(cardX, y, cardW, cardH, 14);
        ctx.fillStyle = cardFill;
        ctx.fill();

        ctx.restore();

        // Stroke
        roundedRect(cardX, y, cardW, cardH, 14);
        ctx.strokeStyle = cardStroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Content
        const { a, aNote, b, bNote } = splitMatchupLine(line);

        const centerY = y + cardH / 2 + 10;

        // VS
        ctx.textAlign = 'center';
        ctx.fillStyle = vsColor;
        ctx.font = `900 36px ${fontFamily}`;
        ctx.fillText('VS', cx, centerY);

        // Teams
        ctx.fillStyle = 'rgba(15,23,42,0.90)';
        // NOTE: social reference requires full team names (no ellipsis). We prefer shrinking font,
        // and if still needed wrap on 2 lines inside the card.
        const fitOpts = { weight: 900, basePx: 32, minPx: 18, family: fontFamily, maxLines: 2 as const };

        // IMPORTANT: keep a clear center gap so names never collide with the central "VS"
        // Match reference: each team is centered in its own half (left/right) with a reserved center gap for "VS".
        // S4 tuning: try a few safe padding/gap candidates to keep 1-line whenever possible (without breaking the look).
        const layoutCandidates: Array<{ innerPad: number; centerGap: number }> = [
            { innerPad: 56, centerGap: 72 }, // baseline (reference-like)
            { innerPad: 52, centerGap: 72 },
            { innerPad: 56, centerGap: 64 },
            { innerPad: 52, centerGap: 64 },
            { innerPad: 48, centerGap: 64 },
            { innerPad: 48, centerGap: 56 }, // emergency (still keeps a center buffer)
        ];

        let best:
            | {
                  innerPad: number;
                  centerGap: number;
                  halfW: number;
                  leftAnchor: number;
                  rightAnchor: number;
                  pair: { left: { lines: string[]; font: string; px: number; scaleX?: number }; right: { lines: string[]; font: string; px: number; scaleX?: number } };
              }
            | null = null;

        for (const cand of layoutCandidates) {
            const availableW = cardW - cand.innerPad * 2 - cand.centerGap * 2;
            const halfW = Math.max(120, Math.floor(availableW / 2));
            const leftAnchor = cardX + cand.innerPad + halfW / 2;
            const rightAnchor = cardX + cardW - cand.innerPad - halfW / 2;

            const pair = fitMatchupPairText(ctx, a, b, halfW, fitOpts);

            // Score: prefer fewer lines, then larger font size (reference look), then less squeeze.
            const linesCount = pair.left.lines.length + (b ? pair.right.lines.length : 0);
            const px = pair.left.px + (b ? pair.right.px : 0);
            const squeezePenalty =
                (pair.left.scaleX && pair.left.scaleX < 1 ? 1 - pair.left.scaleX : 0) +
                (pair.right.scaleX && pair.right.scaleX < 1 ? 1 - pair.right.scaleX : 0);

            const score = linesCount * 1000 - px + squeezePenalty * 10;

            if (!best) {
                best = { innerPad: cand.innerPad, centerGap: cand.centerGap, halfW, leftAnchor, rightAnchor, pair };
            } else {
                const bestLinesCount = best.pair.left.lines.length + (b ? best.pair.right.lines.length : 0);
                const bestPx = best.pair.left.px + (b ? best.pair.right.px : 0);
                const bestSqueezePenalty =
                    (best.pair.left.scaleX && best.pair.left.scaleX < 1 ? 1 - best.pair.left.scaleX : 0) +
                    (best.pair.right.scaleX && best.pair.right.scaleX < 1 ? 1 - best.pair.right.scaleX : 0);
                const bestScore = bestLinesCount * 1000 - bestPx + bestSqueezePenalty * 10;

                if (score < bestScore) {
                    best = { innerPad: cand.innerPad, centerGap: cand.centerGap, halfW, leftAnchor, rightAnchor, pair };
                }
            }

            // Early exit if we hit the ideal look.
            if (pair.left.lines.length === 1 && (!b || pair.right.lines.length === 1) && pair.left.px >= 30 && (!b || pair.right.px >= 30)) {
                break;
            }
        }

        const leftAnchor = best ? best.leftAnchor : cx - 200;
        const rightAnchor = best ? best.rightAnchor : cx + 200;
        const sideMax = best ? best.halfW : Math.max(120, Math.floor((cardW - 56 * 2 - 72 * 2) / 2));
        const pair = best ? best.pair : fitMatchupPairText(ctx, a, b, sideMax, fitOpts);

        // Fit both sides together so the matchup keeps a consistent visual weight (matches reference).
        // This avoids left/right having noticeably different font sizes when one name is much longer.
        ctx.textAlign = 'center';
        const leftMainY = aNote ? centerY - 8 : centerY;
        const rightMainY = bNote ? centerY - 8 : centerY;
        drawFittedTeamText(ctx, leftAnchor, leftMainY, pair.left, 'center');
        if (b) {
            drawFittedTeamText(ctx, rightAnchor, rightMainY, pair.right, 'center');
        }

        const drawSideNote = (anchorX: number, mainY: number, fitted: { lines: string[]; px: number }, note: string) => {
            if (!note) return;
            const lineCount = Math.max(1, fitted.lines.length || 1);
            const lh = lineCount > 1 ? Math.max(16, Math.round(fitted.px * 1.05)) : 0;
            const noteY = lineCount > 1 ? mainY + Math.round(lh / 2) + 12 : mainY + 22;
            ctx.save();
            ctx.fillStyle = 'rgba(15,23,42,0.72)';
            ctx.font = `900 15px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`(${note})`, anchorX, noteY);
            ctx.restore();
        };

        drawSideNote(leftAnchor, leftMainY, pair.left, aNote);
        if (b) drawSideNote(rightAnchor, rightMainY, pair.right, bNote);

        y += cardH + gap;
    }

    // Bottom line + date
    const date = story.date;
    if (date) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(160, 1680);
        ctx.lineTo(w - 160, 1680);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `900 56px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(date, cx, 1820);
    }

    // Social: PNG keeps the rendering pixel-perfect and avoids compression artifacts.
    const dataUrl = canvas.toDataURL('image/png');
    const safeName = (fileKey || story.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const filename = `flbp_story_${safeName || 'story'}.png`;
    return { dataUrl, filename };
}

function computeTwoLineSplitCandidates(text: string) {
    const s = String(text || '').trim();
    const idxs = new Set<number>();
    // Primary breakpoints: spaces
    for (let i = 0; i < s.length; i++) {
        if (s[i] === ' ') idxs.add(i);
    }
    // Secondary breakpoints: common separators (allow line break after)
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '&' || ch === '/' || ch === '-' || ch === '–' || ch === '—') idxs.add(i + 1);
    }
    // Remove extremes
    idxs.delete(0);
    idxs.delete(s.length);
    return Array.from(idxs).sort((a, b) => a - b);
}

function bestTwoLineSplit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const s = String(text || '').trim();
    const candidates = computeTwoLineSplitCandidates(s);
    let best: { a: string; b: string; score: number } | null = null;

    for (const i of candidates) {
        const a = s.slice(0, i).trim();
        const b = s.slice(i).trim();
        if (!a || !b) continue;
        const wa = ctx.measureText(a).width;
        const wb = ctx.measureText(b).width;
        if (wa <= maxWidth && wb <= maxWidth) {
            const score = Math.max(wa, wb);
            if (!best || score < best.score) best = { a, b, score };
        }
    }

    return best ? [best.a, best.b] : null;
}

function forceTwoLineSplitByWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const s = String(text || '').trim();
    if (!s) return [''];
    // Take the longest prefix that fits; remaining goes on 2nd line.
    let cut = s.length;
    while (cut > 1 && ctx.measureText(s.slice(0, cut).trim()).width > maxWidth) cut -= 1;
    const a = s.slice(0, cut).trim();
    const b = s.slice(cut).trim();
    return b ? [a, b] : [a];
}

function fitTextToWidth(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    opts: { weight: number; basePx: number; minPx: number; family: string; maxLines?: 1 | 2 }
) {
    const maxLines = opts.maxLines ?? 1;
    const hardMinPx = 12; // emergency floor to guarantee full names are visible (no truncation)
    // Gentle horizontal squeeze (used only when it avoids wrap / tiny fonts).
    // Keeps the look closer to the reference images while still showing full names.
    const minScaleX = 0.86;

    // 1) Prefer single-line (matches reference images): shrink down to opts.minPx.
    let px = opts.basePx;
    while (px > opts.minPx) {
        ctx.font = `${opts.weight} ${px}px ${opts.family}`;
        if (ctx.measureText(text).width <= maxWidth) {
            return { lines: [text], font: ctx.font, px };
        }
        px -= 2;
    }

    // Try at minPx
    ctx.font = `${opts.weight} ${opts.minPx}px ${opts.family}`;
    const wAtMin = ctx.measureText(text).width;
    if (wAtMin <= maxWidth) {
        return { lines: [text], font: ctx.font, px: opts.minPx };
    }

    // If we are close, prefer a subtle horizontal squeeze rather than wrapping or shrinking too far.
    if (maxLines === 2) {
        const sx = maxWidth / Math.max(1, wAtMin);
        if (sx >= minScaleX) {
            return { lines: [text], font: ctx.font, px: opts.minPx, scaleX: sx };
        }
    }

    // If wrapping is allowed, keep trying to stay 1-line by shrinking below minPx (rare, but preserves the look).
    if (maxLines === 2) {
        for (let p = opts.minPx - 1; p >= hardMinPx; p -= 1) {
            ctx.font = `${opts.weight} ${p}px ${opts.family}`;
            const w1 = ctx.measureText(text).width;
            if (w1 <= maxWidth) {
                return { lines: [text], font: ctx.font, px: p };
            }
            const sx = maxWidth / Math.max(1, w1);
            if (sx >= minScaleX) {
                return { lines: [text], font: ctx.font, px: p, scaleX: sx };
            }
        }
    }

    // If we cannot wrap, return at minPx (callers should have provided a safe maxWidth).
    if (maxLines === 1) {
        return { lines: [text], font: `${opts.weight} ${opts.minPx}px ${opts.family}`, px: opts.minPx };
    }

    // 2) Wrap into 2 lines (never truncate). If needed, shrink further until BOTH lines fit.
    for (let p = opts.minPx; p >= hardMinPx; p -= 1) {
        ctx.font = `${opts.weight} ${p}px ${opts.family}`;
        const split = bestTwoLineSplit(ctx, text, maxWidth) || forceTwoLineSplitByWidth(ctx, text, maxWidth);
        const lines = (split && split.length ? split : [text]).slice(0, 2);
        const ok = lines.every(l => ctx.measureText(l).width <= maxWidth);
        if (ok) {
            return { lines, font: ctx.font, px: p };
        }
    }

    // Fallback (should be extremely rare): return forced 2-line at hard floor.
    ctx.font = `${opts.weight} ${hardMinPx}px ${opts.family}`;
    const split = bestTwoLineSplit(ctx, text, maxWidth) || forceTwoLineSplitByWidth(ctx, text, maxWidth);
    return { lines: (split && split.length ? split : [text]).slice(0, 2), font: ctx.font, px: hardMinPx };
}

function fitMatchupPairText(
    ctx: CanvasRenderingContext2D,
    leftText: string,
    rightText: string,
    maxWidth: number,
    opts: { weight: number; basePx: number; minPx: number; family: string; maxLines?: 1 | 2 }
) {
    const maxLines = opts.maxLines ?? 1;
    const hardMinPx = 12; // emergency floor to guarantee full names are visible (no truncation)
    const minScaleX = 0.86;

    const setFont = (p: number) => {
        ctx.font = `${opts.weight} ${p}px ${opts.family}`;
        return ctx.font;
    };

    // If one side is missing, fall back to single-string fitting.
    if (!rightText) {
        const left = fitTextToWidth(ctx, leftText, maxWidth, { ...opts, maxLines });
        return { left, right: left };
    }

    const oneLineScale = (p: number) => {
        setFont(p);
        const wl = ctx.measureText(leftText).width;
        const wr = ctx.measureText(rightText).width;
        const scaleX = Math.min(1, maxWidth / Math.max(1, wl), maxWidth / Math.max(1, wr));
        const fits = wl <= maxWidth && wr <= maxWidth;
        return { fits, scaleX };
    };

    // 1) Prefer a single-line matchup (reference look). Find the largest px that fits BOTH sides.
    for (let p = opts.basePx; p >= opts.minPx; p -= 2) {
        const r = oneLineScale(p);
        if (r.fits) {
            const font = ctx.font;
            return { left: { lines: [leftText], font, px: p }, right: { lines: [rightText], font, px: p } };
        }
    }

    // Try at minPx (allow gentle squeeze if close)
    {
        const r = oneLineScale(opts.minPx);
        const font = ctx.font;
        if (r.fits) {
            return { left: { lines: [leftText], font, px: opts.minPx }, right: { lines: [rightText], font, px: opts.minPx } };
        }
        if (maxLines === 2 && r.scaleX >= minScaleX) {
            return {
                left: { lines: [leftText], font, px: opts.minPx, scaleX: r.scaleX },
                right: { lines: [rightText], font, px: opts.minPx, scaleX: r.scaleX },
            };
        }
    }

    // If wrapping is allowed, keep trying to stay 1-line by shrinking below minPx (rare, preserves the look).
    if (maxLines === 2) {
        for (let p = opts.minPx - 1; p >= hardMinPx; p -= 1) {
            const r = oneLineScale(p);
            const font = ctx.font;
            if (r.fits) {
                return { left: { lines: [leftText], font, px: p }, right: { lines: [rightText], font, px: p } };
            }
            if (r.scaleX >= minScaleX) {
                return {
                    left: { lines: [leftText], font, px: p, scaleX: r.scaleX },
                    right: { lines: [rightText], font, px: p, scaleX: r.scaleX },
                };
            }
        }
    }

    // If we cannot wrap, return at minPx (callers should have provided a safe maxWidth).
    if (maxLines === 1) {
        const font = setFont(opts.minPx);
        return {
            left: { lines: [leftText], font, px: opts.minPx },
            right: { lines: [rightText], font, px: opts.minPx },
        };
    }

    // 2) Wrap into 2 lines (never truncate). Find the largest px that allows BOTH sides to fit in 2 lines.
    for (let p = opts.minPx; p >= hardMinPx; p -= 1) {
        setFont(p);
        const leftSplit = bestTwoLineSplit(ctx, leftText, maxWidth) || forceTwoLineSplitByWidth(ctx, leftText, maxWidth);
        const rightSplit = bestTwoLineSplit(ctx, rightText, maxWidth) || forceTwoLineSplitByWidth(ctx, rightText, maxWidth);
        const leftLines = (leftSplit && leftSplit.length ? leftSplit : [leftText]).slice(0, 2);
        const rightLines = (rightSplit && rightSplit.length ? rightSplit : [rightText]).slice(0, 2);
        const okLeft = leftLines.every(l => ctx.measureText(l).width <= maxWidth);
        const okRight = rightLines.every(l => ctx.measureText(l).width <= maxWidth);
        if (okLeft && okRight) {
            const font = ctx.font;
            const maxLineW = (ls: string[]) => {
                let m = 0;
                for (const s of ls) m = Math.max(m, ctx.measureText(s).width);
                return m;
            };
            const wl = maxLineW(leftLines);
            const wr = maxLineW(rightLines);
            const scaleX = Math.min(1, maxWidth / Math.max(1, wl), maxWidth / Math.max(1, wr));
            const allowScale = scaleX < 1 && scaleX >= minScaleX;

            return {
                left: { lines: leftLines, font, px: p, ...(allowScale ? { scaleX } : {}) },
                right: { lines: rightLines, font, px: p, ...(allowScale ? { scaleX } : {}) },
            };
        }
    }

    // Fallback: forced 2-line at hard floor.
    const font = setFont(hardMinPx);
    const leftSplit = bestTwoLineSplit(ctx, leftText, maxWidth) || forceTwoLineSplitByWidth(ctx, leftText, maxWidth);
    const rightSplit = bestTwoLineSplit(ctx, rightText, maxWidth) || forceTwoLineSplitByWidth(ctx, rightText, maxWidth);
    const leftLines = (leftSplit && leftSplit.length ? leftSplit : [leftText]).slice(0, 2);
    const rightLines = (rightSplit && rightSplit.length ? rightSplit : [rightText]).slice(0, 2);

    const maxLineW = (ls: string[]) => {
        let m = 0;
        for (const s of ls) m = Math.max(m, ctx.measureText(s).width);
        return m;
    };
    const wl = maxLineW(leftLines);
    const wr = maxLineW(rightLines);
    const emergencyMinScaleX = 0.8;
    const scaleX = Math.min(1, maxWidth / Math.max(1, wl), maxWidth / Math.max(1, wr));
    const allowScale = scaleX < 1 && scaleX >= emergencyMinScaleX;

    return {
        left: { lines: leftLines, font, px: hardMinPx, ...(allowScale ? { scaleX } : {}) },
        right: { lines: rightLines, font, px: hardMinPx, ...(allowScale ? { scaleX } : {}) },
    };
}


function drawFittedTeamText(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    fitted: { lines: string[]; font: string; px: number; scaleX?: number },
    align: CanvasTextAlign = 'center'
) {
    ctx.save();
    ctx.font = fitted.font;
    ctx.textAlign = align;

    // Optional gentle horizontal squeeze to preserve the single-line look while keeping names complete.
    const sx = typeof fitted.scaleX === 'number' && Number.isFinite(fitted.scaleX) ? fitted.scaleX : 1;
    if (sx !== 1) {
        ctx.translate(x, 0);
        ctx.scale(sx, 1);
        x = 0;
    }

    const lines = fitted.lines.length ? fitted.lines : [''];
    if (lines.length === 1) {
        // Keep original baseline tuning for reference images
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(lines[0], x, y);
        ctx.restore();
        return;
    }

    // Multi-line: center vertically within the card
    // NOTE: callers pass a slightly "lowered" y for 1-line baseline tuning; undo that shift here.
    ctx.textBaseline = 'middle';
    const lh = Math.max(16, Math.round(fitted.px * 1.05));
    const centerY = y - 10;
    const startY = centerY - lh / 2;
    ctx.fillText(lines[0], x, startY);
    ctx.fillText(lines[1], x, startY + lh);
    ctx.restore();
}

export function SocialGraphicsPanel({ state, draft }: { state: AppState; draft: { t: TournamentData; m: Match[] } | null }) {
    const { t } = useTranslation();
    // Preload fonts used for Canvas rendering so exported images match reference images.
    // IMPORTANT: keep export synchronous on click to avoid browser blocking downloads.
    const [fontsReady, setFontsReady] = React.useState(() => {
        if (typeof document === 'undefined') return true;
        const fonts: any = (document as any).fonts;
        if (!fonts || typeof fonts.load !== 'function') return true;
        return false;
    });

    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        const fonts: any = (document as any).fonts;
        if (!fonts || typeof fonts.load !== 'function') {
            setFontsReady(true);
            return;
        }

        const sleep = (ms: number) =>
            new Promise<void>(res => {
                if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') window.setTimeout(res, ms);
                else setTimeout(res, ms);
            });

        let alive = true;
        const primary = '"Inter"';
        const warmup = Promise.all([
            fonts.load(`900 32px ${primary}`),
            fonts.load(`900 36px ${primary}`),
            fonts.load(`900 52px ${primary}`),
            fonts.load(`900 56px ${primary}`),
            fonts.load(`900 120px ${primary}`),
            fonts.load(`900 160px ${primary}`),
        ]);

        // Never block the UI indefinitely: resolve ready after a short timeout even if fonts API hangs.
        Promise.race([warmup, sleep(800)])
            .then(() => {
                if (alive) setFontsReady(true);
            })
            .catch(() => {
                if (alive) setFontsReady(true);
            });

        return () => {
            alive = false;
        };
    }, []);

    const socialTeamSource = React.useMemo(() => {
        const preferred = (draft?.t?.teams && draft.t.teams.length > 0)
            ? draft.t.teams
            : (state.tournament?.teams && state.tournament.teams.length > 0)
                ? state.tournament.teams
                : (state.teams || []);
        const merged = new Map<string, Team>();
        preferred.forEach(team => {
            if (team?.id && !merged.has(team.id)) merged.set(team.id, team);
        });
        (state.teams || []).forEach(team => {
            if (team?.id && !merged.has(team.id)) merged.set(team.id, team);
        });
        return Array.from(merged.values());
    }, [draft?.t?.teams, state.tournament?.teams, state.teams]);

    // Hard constraints: BYE/TBD must be invisible in UI.
    // Counts use the visible teams of the current draft/live tournament when available, not the global catalog.
    const playableTeams = React.useMemo(
        () => socialTeamSource.filter(team => !team.hidden && !team.isBye && !isByeOrTbd(team.id) && !isByeOrTbd(team.name)),
        [socialTeamSource]
    );
    const teamsById = React.useMemo(() => {
        const map: Record<string, Team | undefined> = {};
        for (const t of socialTeamSource) map[t.id] = t;
        return map;
    }, [socialTeamSource]);

    const matches = (draft?.m || state.tournamentMatches || []).filter(m => !m.hidden);
    const prelims = React.useMemo(() => getBracketPrelims(matches, teamsById), [matches, teamsById]);
    const callableMatches = React.useMemo(() => getCallableSocialMatches(matches, teamsById), [matches, teamsById]);

    const initialCfg = React.useMemo(() => loadSocialGraphicsConfig(), []);
    const [prelimStartTime, setPrelimStartTime] = React.useState(initialCfg.prelimStartTime);
    const [prelimCallTime, setPrelimCallTime] = React.useState(initialCfg.prelimCallTime);
    const [slots, setSlots] = React.useState<SlotConfig[]>(initialCfg.slots);
    const [selectedStoryKey, setSelectedStoryKey] = React.useState<string>(initialCfg.selectedStoryKey);
    const [autoFirstCallTime, setAutoFirstCallTime] = React.useState(initialCfg.autoFirstCallTime);
    const [autoIntervalMinutes, setAutoIntervalMinutes] = React.useState<number>(initialCfg.autoIntervalMinutes);
    const [autoTeamsPerTurn, setAutoTeamsPerTurn] = React.useState<number>(initialCfg.autoTeamsPerTurn);
    const [expandedSlotId, setExpandedSlotId] = React.useState<string | null>(null);

    const [actionMsg, setActionMsg] = React.useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);
    const [lastExport, setLastExport] = React.useState<{ filename: string; url: string } | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    // Revoke the previous object URL whenever we replace it.
    React.useEffect(() => {
        return () => {
            if (lastExport?.url) {
                try {
                    URL.revokeObjectURL(lastExport.url);
                } catch {
                    // ignore
                }
            }
        };
    }, [lastExport?.url]);

    const flash = React.useCallback((kind: 'info' | 'success' | 'error', text: string, ms = 3200) => {
        setActionMsg({ kind, text });
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(() => setActionMsg(null), ms);
        } else {
            setTimeout(() => setActionMsg(null), ms);
        }
    }, []);

    const captureExport = React.useCallback((blob: Blob, filename: string) => {
        try {
            const url = URL.createObjectURL(blob);
            setLastExport({ filename, url });
        } catch {
            // ignore
        }
    }, []);

    const storyDate = formatDateDDMMYYYY(draft?.t.startDate || state.tournament?.startDate);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(
                SOCIAL_GRAPHICS_STORAGE_KEY,
                JSON.stringify({
                    prelimStartTime,
                    prelimCallTime,
                    slots,
                    selectedStoryKey,
                    autoFirstCallTime,
                    autoIntervalMinutes,
                    autoTeamsPerTurn,
                })
            );
        } catch {
            // ignore storage errors
        }
    }, [prelimStartTime, prelimCallTime, slots, selectedStoryKey, autoFirstCallTime, autoIntervalMinutes, autoTeamsPerTurn]);

    const explicitAssignedSlotByMatchId = React.useMemo(() => {
        const map: Record<string, string> = {};
        slots.forEach(slot => {
            (slot.assignedMatchIds || []).forEach(matchId => {
                if (typeof matchId === 'string' && matchId.trim()) map[matchId] = slot.id;
            });
        });
        return map;
    }, [slots]);

    const slotAssignments = React.useMemo(() => {
        const matchById = new Map(callableMatches.map(match => [match.id, match] as const));
        const explicitMatchIds = new Set<string>();
        slots.forEach(slot => {
            (slot.assignedMatchIds || []).forEach(id => {
                if (matchById.has(id)) explicitMatchIds.add(id);
            });
        });

        const fallbackMatches = callableMatches.filter(match => !explicitMatchIds.has(match.id));
        const res: { slot: SlotConfig; matches: Match[]; repeatedTeamIdsByMatchId: Record<string, string[]> }[] = [];
        let idx = 0;
        const seenTeams = new Set<string>();

        for (const s of slots) {
            let assigned: Match[] = [];
            if (Array.isArray(s.assignedMatchIds) && s.assignedMatchIds.length > 0) {
                assigned = s.assignedMatchIds
                    .map(id => matchById.get(id))
                    .filter(Boolean) as Match[];
            } else {
                const matchesCount = clamp(Number(s.matchesCount) || 0, 0, 128);
                assigned = fallbackMatches.slice(idx, idx + matchesCount);
                idx += matchesCount;
            }

            const repeatedTeamIdsByMatchId: Record<string, string[]> = {};
            if (s.annotateRepeatedTeams) {
                assigned.forEach(match => {
                    const repeated = getMatchParticipantIds(match).filter(teamId => seenTeams.has(teamId));
                    if (repeated.length) repeatedTeamIdsByMatchId[match.id] = repeated;
                });
            }

            assigned.forEach(match => {
                getMatchParticipantIds(match).forEach(teamId => seenTeams.add(teamId));
            });

            res.push({ slot: s, matches: assigned, repeatedTeamIdsByMatchId });
        }
        const leftover = fallbackMatches.slice(idx);
        return { res, leftover };
    }, [slots, callableMatches]);

    React.useEffect(() => {
        setSlots(prev => {
            const sanitized = sanitizeSlotAssignmentsForCallableMatches(prev, callableMatches);
            return sanitized.changed ? sanitized.nextSlots : prev;
        });
    }, [callableMatches]);

    React.useEffect(() => {
        if (expandedSlotId && !slots.some(slot => slot.id === expandedSlotId)) {
            setExpandedSlotId(null);
        }
    }, [expandedSlotId, slots]);

    const slotSummary = React.useMemo(() => {
        const manualSlots = slots.filter(slot => Array.isArray(slot.assignedMatchIds) && slot.assignedMatchIds.length > 0).length;
        const autoSlots = Math.max(0, slots.length - manualSlots);
        const emptySlots = slotAssignments.res.filter(({ matches }) => matches.length === 0).length;
        const invalidTimeSlots = slots.filter(slot => slot.callTime.trim().length > 0 && !parseHHMM(slot.callTime)).length;
        const missingTimeSlots = slots.filter(slot => slot.callTime.trim().length === 0).length;
        const assignedMatchCount = new Set(slotAssignments.res.flatMap(({ matches }) => matches.map(match => match.id))).size;

        return {
            manualSlots,
            autoSlots,
            emptySlots,
            invalidTimeSlots,
            missingTimeSlots,
            assignedMatchCount,
        };
    }, [slotAssignments.res, slots]);

    const toggleExplicitMatchForSlot = React.useCallback((slotId: string, matchId: string) => {
        setSlots(prev => prev.map(slot => {
            if (slot.id !== slotId) return slot;
            const current = Array.isArray(slot.assignedMatchIds) ? slot.assignedMatchIds.filter(id => typeof id === 'string' && id.trim()) : [];
            const nextAssigned = current.includes(matchId)
                ? current.filter(id => id !== matchId)
                : [...current, matchId];
            const orderedAssigned = callableMatches
                .filter(match => nextAssigned.includes(match.id))
                .map(match => match.id);
            return {
                ...slot,
                assignedMatchIds: orderedAssigned.length ? orderedAssigned : undefined,
                matchesCount: orderedAssigned.length,
                annotateRepeatedTeams: orderedAssigned.length ? slot.annotateRepeatedTeams : false,
            };
        }));
    }, [callableMatches]);

    const resetExplicitSlotAssignments = React.useCallback((slotId: string) => {
        setSlots(prev => prev.map(slot => (slot.id === slotId ? { ...slot, assignedMatchIds: undefined, annotateRepeatedTeams: false } : slot)));
    }, []);

    const stories: { key: string; label: string; story: Story }[] = React.useMemo(() => {
        const out: { key: string; label: string; story: Story }[] = [];

        if (prelims.length > 0) {
            const prelimLines = prelims.map(p => `${p.a.name} vs ${p.b.name}`);
            const chunks = chunkArray<string>(prelimLines, STORY_MAX_MATCHUPS);
            chunks.forEach((chunk, pi) => {
                out.push({
                    key: pi === 0 ? 'prelims' : `prelims_p${pi + 1}`,
                    label: chunks.length > 1 ? `${t('social_prelims_label')} (${pi + 1}/${chunks.length})` : t('social_prelims_label'),
                    story: {
                        kind: 'prelims',
                        bg: 'prelims',
                        title: t('social_prelims_title'),
                        subtitle: `${t('social_start_prefix')} ${prelimStartTime} • ${t('social_call_prefix')} ${prelimCallTime}`,
                        startTime: prelimStartTime,
                        callTime: prelimCallTime,
                        date: storyDate,
                        lines: chunk,
                    },
                });
            });
        }

        slotAssignments.res.forEach((a, i) => {
            const pairs = a.matches
                .map(match => formatCallableMatchLine(match, teamsById, a.repeatedTeamIdsByMatchId[match.id] || [], t('social_second_match_label')))
                .filter(Boolean) as string[];
            const chunks = chunkArray<string>(pairs, STORY_MAX_MATCHUPS);
            chunks.forEach((chunk, pi) => {
                out.push({
                    key: pi === 0 ? `slot_${i}` : `slot_${i}_p${pi + 1}`,
                    label:
                        chunks.length > 1
                            ? `${t('social_calls_label')} ${a.slot.callTime} (${pi + 1}/${chunks.length})`
                            : `${t('social_calls_label')} ${a.slot.callTime}`,
                    story: {
                        kind: 'slot',
                        bg: 'slot',
                        title: t('social_calls_title'),
                        subtitle: `${t('social_hour_prefix')} ${a.slot.callTime}`,
                        startTime: a.slot.callTime,
                        callTime: timeMinusMinutes(a.slot.callTime, 60),
                        date: storyDate,
                        lines: chunk,
                    },
                });
            });
        });

        return out;
    }, [prelims, prelimStartTime, prelimCallTime, slotAssignments.res, storyDate, teamsById]);

    React.useEffect(() => {
        if (!stories.length) return;
        if (!selectedStoryKey || !stories.some(story => story.key === selectedStoryKey)) {
            setSelectedStoryKey(stories[0].key);
        }
    }, [selectedStoryKey, stories]);

    const selected = stories.find(s => s.key === selectedStoryKey) || stories[0];

    const previewSig = React.useMemo(() => {
        if (!selected) return '';
        const s = selected.story;
        return [
            selected.key,
            s.bg,
            s.startTime,
            s.callTime,
            s.date || '',
            (s.lines || []).join('\n'),
        ].join('|');
    }, [selected]);

    // Preview must match the exported image pixel-perfect.
    // We render the same Canvas output and show it scaled down (360x640).
    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        if (!fontsReady || !selected) {
            setPreviewUrl(null);
            return;
        }

        let alive = true;
        let url: string | null = null;

        const run = () => {
            try {
                const r = renderStoryToPngDataUrl(selected.story, selected.key);
                if (!r) {
                    if (alive) setPreviewUrl(null);
                    return;
                }
                const blob = dataUrlToBlob(r.dataUrl);
                url = URL.createObjectURL(blob);
                if (alive) setPreviewUrl(url);
            } catch {
                if (alive) setPreviewUrl(null);
            }
        };

        // Defer to avoid blocking inputs while typing time/slot fields.
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(run);
        } else {
            setTimeout(run, 0);
        }

        return () => {
            alive = false;
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    // ignore
                }
            }
        };
    }, [fontsReady, previewSig]);

    const getSlotExportIssue = (slotIndex: number): string | null => {
        const slot = slots[slotIndex];
        const slotResult = slotAssignments.res[slotIndex];
        if (!slot) return null;
        if (!slot.callTime.trim()) return t('social_slot_missing_time_hint');
        if (!parseHHMM(slot.callTime)) return t('social_slot_invalid_time_hint');
        if (!slotResult || slotResult.matches.length === 0) return t('social_empty_slots_hint');
        return null;
    };

    const getStoryExportIssue = (storyKey?: string | null): string | null => {
        const key = String(storyKey || '').trim();
        const match = key.match(/^slot_(\d+)/);
        if (!match) return null;
        return getSlotExportIssue(Number(match[1]));
    };

    const blockingSlotIssues = slots
        .map((slot, index) => ({ index, reason: getSlotExportIssue(index), callTime: slot.callTime, isManual: !!(slot.assignedMatchIds && slot.assignedMatchIds.length) }))
        .filter((entry): entry is { index: number; reason: string; callTime: string; isManual: boolean } => !!entry.reason);
    const singleExportIssue = getStoryExportIssue(selected?.key);
    const allExportIssue = blockingSlotIssues.length > 0 ? t('social_export_fix_all_slots_first') : null;
    const allDownloadBlocked = !fontsReady || stories.length === 0 || !!allExportIssue;
    const singleDownloadBlocked = !fontsReady || !selected || !!singleExportIssue;
    const unassignedMatchPreview = slotAssignments.leftover.slice(0, 4).map(match => formatCallableMatchSummary(match, teamsById));


    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-xl font-black">{t('social_graphics_title')}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                <button type="button"
                    onClick={() => {
                        const d = getDefaultSocialGraphicsConfig();
                        try {
                            window.localStorage.removeItem(SOCIAL_GRAPHICS_STORAGE_KEY);
                        } catch {
                            // ignore
                        }
                        setPrelimStartTime(d.prelimStartTime);
                        setPrelimCallTime(d.prelimCallTime);
                        setSlots(d.slots);
                        setExpandedSlotId(null);
                        setSelectedStoryKey(d.selectedStoryKey);
                        setActionMsg(null);
                        flash('success', t('social_reset_applied'));
                    }}
                    className="bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100"
                >
                    {t('reset')}
                </button>
                <button type="button"
                    onClick={() => {
                        if (!fontsReady) {
                            flash('info', t('social_fonts_loading'));
                            return;
                        }
                        if (!stories.length) {
                            flash('info', t('social_no_graphics_to_download'));
                            return;
                        }
                        if (allExportIssue) {
                            flash('error', allExportIssue, 6000);
                            return;
                        }
                        let i = 0;
                        const total = stories.length;
                        const tick = () => {
                            const item = stories[i];
                            if (!item) {
                                flash('success', `${t('social_downloads_started_prefix')}: ${total}`);
                                return;
                            }
                            setActionMsg({ kind: 'info', text: `${t('social_download_progress_prefix')} ${i + 1}/${total}…` });
                            try {
                                drawStoryToPng(item.story, item.key, captureExport);
                            } catch (e) {
                                console.error(e);
                                flash('error', `${t('social_download_error_prefix')} ${i + 1}/${total}` , 6000);
                                return;
                            }
                            i += 1;
                            if (i < stories.length) {
                                // Small delay to allow the browser to process sequential downloads
                                window.setTimeout(tick, 300);
                            } else {
                                flash('success', `${t('social_downloads_started_prefix')}: ${total}`);
                            }
                        };
                        tick();
                    }}
                    aria-disabled={allDownloadBlocked}
                    className={"bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 " + (allDownloadBlocked ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100")}
                >
                    {t('social_download_all_png')}
                </button>
                <button type="button"
                    onClick={() => {
                        if (!fontsReady) {
                            flash('info', t('social_fonts_loading'));
                            return;
                        }
                        if (!selected) {
                            flash('info', t('social_no_graphic_selected'));
                            return;
                        }
                        if (singleExportIssue) {
                            flash('error', `${t('social_export_fix_slot_prefix')} ${singleExportIssue}`, 6000);
                            return;
                        }
                        setActionMsg({ kind: 'info', text: t('social_preparing_image') });
                        try {
                            drawStoryToPng(selected.story, selected.key, captureExport);
                            flash('success', t('social_download_started'));
                        } catch (e) {
                            console.error(e);
                            flash('error', t('social_download_failed'), 6000);
                        }
                    }}
                    aria-disabled={singleDownloadBlocked}
                    className={"bg-slate-900 text-white px-4 py-2 rounded-lg font-black flex items-center gap-2 " + (singleDownloadBlocked ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-800")}
                >
                    {t('social_download_png')}
                </button>
                {actionMsg ? (
                    <span
                        role="status"
                        aria-live="polite"
                        className={
                            'text-xs font-black rounded-full px-3 py-1 border ' +
                            (actionMsg.kind === 'error'
                                ? 'bg-red-50 border-red-200 text-red-700'
                                : actionMsg.kind === 'success'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-700')
                        }
                    >
                        {actionMsg.text}
                    </span>
                ) : !fontsReady ? (
                    <span className="text-xs font-black rounded-full px-3 py-1 border bg-slate-50 border-slate-200 text-slate-700">
                        {t('social_fonts_loading')}
                    </span>
                ) : stories.length === 0 ? (
                    <span className="text-xs font-black rounded-full px-3 py-1 border bg-amber-50 border-amber-200 text-amber-800">
                        {t('social_no_graphics_missing_matches')}
                    </span>
                ) : null}

	                </div>
	            </div>
            <div className="text-xs font-bold text-slate-500">
                {t('social_settings_saved_local_note')}
            </div>

            {lastExport?.url && (
                <div className="text-xs font-bold text-slate-600">
                    {t('social_browser_blocked_download_hint')} {' '}
                    <a
                        href={lastExport.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-slate-900 hover:text-slate-700"
                    >
                        {t('social_open_image')}
                    </a>
                </div>
            )}

            {!fontsReady && (
                <div className="text-xs font-black text-amber-700">
                    {t('social_fonts_loading_reference_note')}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="font-black text-slate-900">{t('social_prelims_panel_title')}</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_start_prefix')}</label>
                                <input
                                    value={prelimStartTime}
                                    onChange={e => setPrelimStartTime(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                    placeholder="16:00"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_call_prefix')}</label>
                                <input
                                    value={prelimCallTime}
                                    onChange={e => setPrelimCallTime(e.target.value)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                    placeholder="15:30"
                                />
                            </div>
                        </div>
                        {prelims.length === 0 ? (
                            <div className="text-xs font-bold text-slate-500">
                                {t('social_no_prelims_detected')}
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-slate-700">{t('social_prelims_found')}:  {prelims.length}</div>
                                <div className="text-[11px] font-bold text-slate-500">{t('social_prelims_regen_hint')}</div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="font-black text-slate-900">{t('social_calls_panel_title')}</div>

                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
                            <div className="font-black text-slate-900 text-sm">{t('social_auto_generate_title')}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_auto_first_call_label')}</label>
                                    <input
                                        value={autoFirstCallTime}
                                        onChange={e => setAutoFirstCallTime(e.target.value)}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                        placeholder="15:30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_auto_interval_label')}</label>
                                    <input
                                        type="number"
                                        min={5}
                                        step={5}
                                        value={autoIntervalMinutes}
                                        onChange={e => setAutoIntervalMinutes(Math.max(5, Math.floor(Number(e.target.value) || 0)))}
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_auto_teams_per_turn_label')}</label>
                                    <input
                                        type="number"
                                        min={2}
                                        step={1}
                                        value={autoTeamsPerTurn}
                                        onChange={e => setAutoTeamsPerTurn(Math.max(2, Math.floor(Number(e.target.value) || 0)))}
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!parseHHMM(autoFirstCallTime)) {
                                            flash('error', t('social_auto_invalid_time'));
                                            return;
                                        }
                                        if (slotSummary.manualSlots > 0 && !window.confirm(t('social_manual_slots_regen_confirm'))) {
                                            return;
                                        }
                                        const normalizedTeamsPerTurn = Math.max(2, Math.floor(Number(autoTeamsPerTurn) || 0));
                                        const matchesPerTurn = Math.max(1, Math.floor(normalizedTeamsPerTurn / 2));
                                        const interval = Math.max(5, Math.floor(Number(autoIntervalMinutes) || 0));
                                        if (!callableMatches.length) {
                                            flash('info', t('social_no_graphics_missing_matches'));
                                            return;
                                        }
                                        const nextSlots: SlotConfig[] = normalizedTeamsPerTurn % 2 !== 0
                                            ? buildOddSlotAssignments(callableMatches, normalizedTeamsPerTurn, autoFirstCallTime, interval)
                                            : (() => {
                                                const generated: SlotConfig[] = [];
                                                for (let i = 0; i < callableMatches.length; i += matchesPerTurn) {
                                                    const matchChunk = callableMatches.slice(i, i + matchesPerTurn);
                                                    generated.push({
                                                        id: safeId(),
                                                        callTime: timePlusMinutes(autoFirstCallTime, Math.floor(i / matchesPerTurn) * interval),
                                                        matchesCount: matchChunk.length,
                                                    });
                                                }
                                                return generated;
                                            })();
                                        setSlots(nextSlots.length ? nextSlots : [{ id: safeId(), callTime: autoFirstCallTime, matchesCount: 0 }]);
                                        setExpandedSlotId(null);
                                        setActionMsg(null);
                                        setSelectedStoryKey(prelims.length > 0 ? 'prelims' : 'slot_0');
                                        flash('success', normalizedTeamsPerTurn % 2 !== 0 ? t('social_auto_generated_odd_success') : t('social_auto_generated_success'));
                                    }}
                                    className="bg-slate-900 text-white px-4 py-2 rounded-lg font-black hover:bg-slate-800"
                                >
                                    {t('social_auto_generate_button')}
                                </button>
                                <div className="text-xs font-bold text-slate-500">
                                    {t('social_auto_generate_hint_prefix')} {callableMatches.length} {t('social_auto_generate_hint_suffix')}
                                    <br />
                                    {t('social_auto_generate_odd_hint')}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
                            <div className="font-black text-slate-900 text-sm">{t('social_slot_summary_title')}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_total_playable_teams')}</div>
                                    <div className="text-lg font-black text-slate-900">{playableTeams.length}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_callable_matches_label')}</div>
                                    <div className="text-lg font-black text-slate-900">{callableMatches.length}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_assigned_matches_label')}</div>
                                    <div className="text-lg font-black text-slate-900">{slotSummary.assignedMatchCount}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_preliminary_matches_label')}</div>
                                    <div className="text-lg font-black text-slate-900">{prelims.length}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_manual_slots_label')}</div>
                                    <div className="text-lg font-black text-slate-900">{slotSummary.manualSlots}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="text-[11px] font-bold text-slate-500">{t('social_auto_slots_label')}</div>
                                    <div className="text-lg font-black text-slate-900">{slotSummary.autoSlots}</div>
                                </div>
                            </div>
                            <div className="text-[11px] font-bold text-slate-500">{t('social_counts_source_hint')}</div>
                            <div className="space-y-1">
                                {slotSummary.manualSlots > 0 && (
                                    <div className="text-[11px] font-bold text-indigo-700">{t('social_manual_slots_regen_hint')}</div>
                                )}
                                {slotSummary.missingTimeSlots > 0 && (
                                    <div className="text-[11px] font-bold text-amber-700">{t('warning')}: {slotSummary.missingTimeSlots} {t('social_slot_missing_time_hint')}</div>
                                )}
                                {slotSummary.invalidTimeSlots > 0 && (
                                    <div className="text-[11px] font-bold text-red-700">{t('warning')}: {slotSummary.invalidTimeSlots} {t('social_slot_invalid_time_hint')}</div>
                                )}
                                {slotSummary.emptySlots > 0 && (
                                    <div className="text-[11px] font-bold text-slate-600">{slotSummary.emptySlots} {t('social_empty_slots_hint')}</div>
                                )}
                                {blockingSlotIssues.length > 0 && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                                        {blockingSlotIssues.map(issue => (
                                            <div key={`slot_issue_${issue.index}`} className="text-[11px] font-bold text-amber-800">
                                                {t('social_calls_label')} {issue.callTime || `#${issue.index + 1}`} · {issue.isManual ? t('social_slot_mode_manual') : t('social_slot_mode_auto')} · {issue.reason}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {slots.map((s, idx) => {
                                const slotResult = slotAssignments.res[idx];
                                const isExpanded = expandedSlotId === s.id;
                                const explicitIds = new Set((s.assignedMatchIds || []).filter(id => typeof id === 'string' && id.trim()));
                                return (
                                    <div key={s.id} className="grid grid-cols-12 gap-2 items-end rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="col-span-12 sm:col-span-5">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_time_label')}</label>
                                            <input
                                                value={s.callTime}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    setSlots(prev => prev.map(x => (x.id === s.id ? { ...x, callTime: v } : x)));
                                                }}
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                                placeholder="15:30"
                                            />
                                        </div>
                                        <div className="col-span-6 sm:col-span-3">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">{t('social_matches_count_label')}</label>
                                            <input
                                                type="number"
                                                value={s.matchesCount}
                                                onChange={e => {
                                                    const v = Number(e.target.value);
                                                    setSlots(prev => prev.map(x => (x.id === s.id ? { ...x, matchesCount: v, assignedMatchIds: undefined, annotateRepeatedTeams: false } : x)));
                                                }}
                                                onFocus={handleZeroValueFocus}
                                                onMouseUp={handleZeroValueMouseUp}
                                                onBlur={handleZeroValueBlur}
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold"
                                                min={0}
                                            />
                                        </div>
                                        <div className="col-span-4 sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">&nbsp;</label>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedSlotId(prev => (prev === s.id ? null : s.id))}
                                                className={
                                                    'w-full px-3 py-2 rounded-lg font-black border ' +
                                                    (isExpanded
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100')
                                                }
                                            >
                                                {isExpanded ? t('social_slot_match_picker_close') : t('social_slot_match_picker_open')}
                                            </button>
                                        </div>
                                        <div className="col-span-2 sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">&nbsp;</label>
                                            <button
                                                onClick={() => {
                                                    setSlots(prev => prev.filter(x => x.id !== s.id));
                                                    setExpandedSlotId(prev => (prev === s.id ? null : prev));
                                                }}
                                                disabled={slots.length <= 1}
                                                className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                            >
                                                -
                                            </button>
                                        </div>
                                        <div className="col-span-12 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
                                            <span className="text-slate-500">
                                                {t('social_assigned_count')}:  {slotResult?.matches.length || 0} {t('matches').toLowerCase()}
                                            </span>
                                            <span className={explicitIds.size > 0 ? 'text-indigo-700' : 'text-slate-500'}>
                                                {explicitIds.size > 0 ? t('social_slot_mode_manual') : t('social_slot_mode_auto')}
                                            </span>
                                        </div>
                                        {slotResult && slotResult.matches.length > 0 && (
                                            <div className="col-span-12 text-[11px] font-bold text-slate-500">
                                                {slotResult.matches.map(match => formatCallableMatchSummary(match, teamsById)).join(' • ')}
                                            </div>
                                        )}
                                        {isExpanded && (
                                            <div className="col-span-12 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div>
                                                        <div className="font-black text-slate-900 text-sm">{t('social_slot_match_picker_title')}</div>
                                                        <div className="text-[11px] font-bold text-slate-500">{t('social_slot_match_picker_hint')}</div>
                                                    </div>
                                                    {explicitIds.size > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => resetExplicitSlotAssignments(s.id)}
                                                            className="bg-white border border-slate-200 px-3 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100"
                                                        >
                                                            {t('social_slot_reset_auto')}
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                                                    {callableMatches.map(match => {
                                                        const assignedToSlotId = explicitAssignedSlotByMatchId[match.id];
                                                        const checked = explicitIds.has(match.id);
                                                        const lockedByOtherSlot = !!assignedToSlotId && assignedToSlotId !== s.id;
                                                        return (
                                                            <label
                                                                key={match.id}
                                                                className={
                                                                    'flex items-start gap-3 rounded-lg border px-3 py-2 ' +
                                                                    (lockedByOtherSlot
                                                                        ? 'border-slate-200 bg-slate-100 text-slate-400'
                                                                        : checked
                                                                          ? 'border-indigo-300 bg-indigo-50 text-slate-900'
                                                                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                                                                }
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    disabled={lockedByOtherSlot}
                                                                    onChange={() => toggleExplicitMatchForSlot(s.id, match.id)}
                                                                    className="mt-1 h-4 w-4 rounded border-slate-300"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-black">{formatCallableMatchSummary(match, teamsById)}</div>
                                                                    {lockedByOtherSlot && (
                                                                        <div className="text-[11px] font-bold text-slate-500">{t('social_slot_taken_by_other')}</div>
                                                                    )}
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => {
                                const nextId = safeId();
                                setSlots(prev => [...prev, { id: nextId, callTime: '', matchesCount: 0, assignedMatchIds: undefined, annotateRepeatedTeams: false }]);
                                setExpandedSlotId(nextId);
                            }}
                            className="bg-white border border-slate-200 px-4 py-2 rounded-lg font-black text-slate-700 hover:bg-slate-100"
                        >
                            {t('social_add_slot')}
                        </button>

                        <div className="text-xs font-bold text-slate-700">
                            {t('social_total_playable_teams')}: {playableTeams.length} • {t('social_callable_matches_label')}: {callableMatches.length} • {t('social_assigned_matches_label')}: {slotSummary.assignedMatchCount}
                        </div>
                        {slotAssignments.leftover.length > 0 && (
                            <div className="space-y-1 text-xs font-bold text-amber-700">
                                <div>
                                    {t('warning')}: {slotAssignments.leftover.length} {t('social_unassigned_matches_suffix')}
                                </div>
                                {unassignedMatchPreview.length > 0 ? (
                                    <div className="text-[11px] font-bold text-amber-800">
                                        {t('social_unassigned_matches_preview_label')}: {unassignedMatchPreview.join(' • ')}{slotAssignments.leftover.length > unassignedMatchPreview.length ? ` • +${slotAssignments.leftover.length - unassignedMatchPreview.length}` : ''}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="font-black text-slate-900">{t('social_select_graphic_to_export')}</div>
                        <select
                            value={selectedStoryKey}
                            onChange={e => setSelectedStoryKey(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                        >
                            {stories.map(s => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                        <div className="text-xs font-bold text-slate-500 space-y-1">
                            <div>{t('social_export_hint')}</div>
                            {singleExportIssue ? (
                                <div className="text-rose-700">
                                    {t('social_selected_export_issue_label')} {singleExportIssue}
                                </div>
                            ) : null}
                            {blockingSlotIssues.length > 0 ? (
                                <div className="space-y-1">
                                    <div className="text-amber-700">{t('warning')}: {blockingSlotIssues.length} {t('social_export_fix_all_slots_first')}</div>
                                    {blockingSlotIssues.slice(0, 4).map(issue => (
                                        <div key={`export_issue_${issue.index}`} className="text-amber-700">
                                            {t('social_calls_label')} {issue.callTime || `#${issue.index + 1}`}: {issue.reason}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-3">
                    {selected ? (
                        <div
                            className={
                                'w-[360px] h-[640px] rounded-2xl overflow-hidden shadow-lg relative ' +
                                (selected.story.bg === 'prelims'
                                    ? 'bg-gradient-to-b from-[#F8473D] via-[#F63A63] to-[#E52D6B]'
                                    : 'bg-gradient-to-b from-[#1C4B8F] via-[#1F7BAA] to-[#28B2BF]')
                            }
                        >
                            {previewUrl ? (
                                <img
                                    src={previewUrl}
                                    alt={`Anteprima grafica: ${selected.label}`}
                                    className="w-full h-full object-contain"
                                    draggable={false}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                                    <div className="text-xs font-black text-white/95">
                                        {!fontsReady ? t('social_fonts_loading') : t('social_preview_preparing')}
                                    </div>
                                    <div className="mt-2 text-xs font-bold text-white/65">
                                        {t('social_preview_same_canvas_note')}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-sm font-bold text-slate-500">{t('social_no_graphics_available')}</div>
                    )}
                </div>
            </div>
        </div>
    );
}