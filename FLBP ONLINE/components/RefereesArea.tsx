import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from '../services/storageService';
import { useTranslation } from '../App';
import { formatMatchScoreLabel, formatMatchTeamsLabel, getMatchParticipantIds } from '../services/matchUtils';
import { loadImageProcessingService, type RefertoStructuredOcrResult } from '../services/lazyImageProcessing';
import { syncBracketFromGroups, ensureFinalTieBreakIfNeeded } from '../services/tournamentEngine';
import type { Match, MatchStats, Team } from '../types';
import { Gavel, ArrowLeft, LogOut, Repeat2, Eye, EyeOff } from 'lucide-react';
import { isByeTeamId, isTbdTeamId } from '../services/matchUtils';
import { normalizeNamePreserveCase } from '../services/textUtils';
import { ensureFreshPlayerSupabaseSession, getPlayerSupabaseSession, getRemoteBaseUpdatedAt, getSupabaseAccessToken, getSupabaseConfig, pullPlayerAppProfile, pullRefereeLiveState, pushRefereeLiveState, verifyRefereePassword } from '../services/supabaseRest';
import { clearDbSyncCurrentIssue, markDbSyncConflict, markDbSyncError, markDbSyncOk } from '../services/dbDiagnostics';
import { isLocalOnlyMode } from '../services/repository/featureFlags';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../services/formInputUX';
import { buildPlayerAreaSnapshot, findRefereeBypassNameForProfile, toPlayerRuntimeProfile } from '../services/playerAppService';
import { tryMergeRemoteStateConflict } from '../services/stateConflictMerge';

interface RefereesAreaProps {
    state: AppState;
    setState: (s: AppState) => void;
    onBack: () => void;
}

type StatsForm = Record<string, { canestri: string; soffi: string }>;

type RefAreaPage = 'select' | 'match' | 'report';

type EntryMode = 'manual' | 'ocr' | null;

const normalizeName = (v: string) => normalizeNamePreserveCase(v);

const isValidCandidateName = (v: string) => {
    const n = normalizeName(v);
    if (!n) return false;
    const up = n.toUpperCase();
    if (up === 'BYE') return false;
    if (up === 'TBD') return false;
    if (up.startsWith('TBD-')) return false;
    return true;
};


const sameSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    for (const x of b) if (!sa.has(x)) return false;
    return true;
};

export const RefereesArea: React.FC<RefereesAreaProps> = ({ state, setState, onBack }) => {
    const { t } = useTranslation();
    const playerAreaSnapshot = useMemo(() => buildPlayerAreaSnapshot(state), [state]);
    const previewRefereeBypass = !!playerAreaSnapshot.liveStatus.refereeBypassEligible;
    const previewRefereeName = String(playerAreaSnapshot.profile?.canonicalPlayerName || '').trim();
    const initialLiveTournament = state.tournament;
    const initialLiveId = initialLiveTournament?.id || '';
    const initialAuthVersion = String((initialLiveTournament as any)?.refereesAuthVersion || '').trim();
    const initialUsesRemoteRefereeSecret = !String((initialLiveTournament as any)?.refereesPassword || '').trim()
        && !isLocalOnlyMode()
        && !!getSupabaseConfig()
        && !getSupabaseAccessToken();
    const initialPlayerSession = getPlayerSupabaseSession();
    const [liveRefereeBypassName, setLiveRefereeBypassName] = useState('');
    const [liveRefereeBypassChecking, setLiveRefereeBypassChecking] = useState<boolean>(() =>
        !!initialLiveId
        && !previewRefereeBypass
        && !!initialPlayerSession?.accessToken
        && initialPlayerSession.flowType !== 'recovery'
        && !isLocalOnlyMode()
        && !!getSupabaseConfig()
    );
    const liveRefereeBypass = previewRefereeBypass || !!liveRefereeBypassName;
    const liveRefereeBypassSelectedName = liveRefereeBypassName || previewRefereeName;

    const [authed, setAuthed] = useState<boolean>(() => {
        try {
            if (previewRefereeBypass && initialLiveId) return true;
            if (!initialLiveId) return false;
            if (initialUsesRemoteRefereeSecret) return false;
            const sameLive = sessionStorage.getItem('flbp_ref_authed') === '1'
                && (sessionStorage.getItem('flbp_ref_authed_for') || '') === initialLiveId;
            if (!sameLive) return false;
            if (!initialAuthVersion) return true;
            return (sessionStorage.getItem('flbp_ref_authed_ver') || '') === initialAuthVersion;
        } catch { return false; }
    });
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [loginBusy, setLoginBusy] = useState(false);
    const syncedPasswordRef = useRef<string>('');

    const [selectedReferee, setSelectedReferee] = useState<string>(() => {
        try { return sessionStorage.getItem('flbp_ref_name') || ''; } catch { return ''; }
    });

    const [page, setPage] = useState<RefAreaPage>('select');
    const [addingManual, setAddingManual] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualError, setManualError] = useState<string | null>(null);

    // Referto
    const [reportCode, setReportCode] = useState<string>(() => {
        try { return sessionStorage.getItem('flbp_ref_code') || ''; } catch { return ''; }
    });
    const [reportCodeError, setReportCodeError] = useState<string | null>(null);
    const [codeChoices, setCodeChoices] = useState<Match[]>([]);
    const [foundMatchId, setFoundMatchId] = useState<string>('');
    const [entryMode, setEntryMode] = useState<EntryMode>(null);

    const [reportStatsForm, setReportStatsForm] = useState<StatsForm>({});
    const [saveBusy, setSaveBusy] = useState(false);

    // OCR support (stored after confirmation, shown alongside manual input)
    const [supportImageUrl, setSupportImageUrl] = useState<string>('');
    const [supportOcrText, setSupportOcrText] = useState<string>('');
    const [supportOcrData, setSupportOcrData] = useState<RefertoStructuredOcrResult | null>(null);

    // OCR file input + modal confirmation
    const ocrInputRef = useRef<HTMLInputElement | null>(null);
    const [ocrBusy, setOcrBusy] = useState(false);
    const [ocrModalOpen, setOcrModalOpen] = useState(false);
    const [ocrModalError, setOcrModalError] = useState<string | null>(null);
    const [ocrModalCode, setOcrModalCode] = useState('');
    const [ocrModalScoreLabel, setOcrModalScoreLabel] = useState('');
    const [ocrModalText, setOcrModalText] = useState('');
    const [ocrModalImageUrl, setOcrModalImageUrl] = useState('');
    const [ocrModalData, setOcrModalData] = useState<RefertoStructuredOcrResult | null>(null);

    const liveTournament = state.tournament;
    const requiresTransientRefereeSecret = !String((liveTournament as any)?.refereesPassword || '').trim()
        && !isLocalOnlyMode()
        && !!getSupabaseConfig()
        && !getSupabaseAccessToken();

    useEffect(() => {
        let cancelled = false;
        const liveId = liveTournament?.id || '';
        const cfg = getSupabaseConfig();
        const storedPlayerSession = getPlayerSupabaseSession();
        if (!liveId || isLocalOnlyMode() || !cfg || !storedPlayerSession?.accessToken || storedPlayerSession.flowType === 'recovery') {
            setLiveRefereeBypassName('');
            setLiveRefereeBypassChecking(false);
            return () => {
                cancelled = true;
            };
        }

        setLiveRefereeBypassChecking(true);
        void (async () => {
            try {
                const session = await ensureFreshPlayerSupabaseSession();
                if (!session?.accessToken || session.flowType === 'recovery') {
                    if (!cancelled) setLiveRefereeBypassName('');
                    return;
                }
                const profileRow = await pullPlayerAppProfile();
                const runtimeProfile = profileRow
                    ? toPlayerRuntimeProfile({
                        accountId: profileRow.user_id,
                        firstName: profileRow.first_name,
                        lastName: profileRow.last_name,
                        birthDate: profileRow.birth_date,
                        canonicalPlayerId: profileRow.canonical_player_id || '',
                        canonicalPlayerName: String(profileRow.canonical_player_name || '').trim()
                            || `${profileRow.last_name || ''} ${profileRow.first_name || ''}`.trim(),
                    })
                    : null;
                const bypassName = findRefereeBypassNameForProfile(state, runtimeProfile);
                if (!cancelled) setLiveRefereeBypassName(bypassName);
            } catch {
                if (!cancelled) setLiveRefereeBypassName('');
            } finally {
                if (!cancelled) setLiveRefereeBypassChecking(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [state, liveTournament?.id]);

    // Keep auth scoped to the current live tournament.
    useEffect(() => {
        const liveId = liveTournament?.id || '';
        if (!liveTournament) {
            try {
                sessionStorage.removeItem('flbp_ref_authed');
                sessionStorage.removeItem('flbp_ref_authed_for');
                sessionStorage.removeItem('flbp_ref_authed_ver');
            } catch { /* ignore */ }
            if (authed) setAuthed(false);
            return;
        }
        try {
            const liveAuthVersion = String((liveTournament as any)?.refereesAuthVersion || '').trim();
            if (liveRefereeBypass) {
                if (!authed) setAuthed(true);
                return;
            }
            const ok = sessionStorage.getItem('flbp_ref_authed') === '1'
                && (sessionStorage.getItem('flbp_ref_authed_for') || '') === liveId
                && (!liveAuthVersion || (sessionStorage.getItem('flbp_ref_authed_ver') || '') === liveAuthVersion);
            if (!ok || requiresTransientRefereeSecret) {
                sessionStorage.removeItem('flbp_ref_authed');
                sessionStorage.removeItem('flbp_ref_authed_for');
                sessionStorage.removeItem('flbp_ref_authed_ver');
                if (authed) setAuthed(false);
            }
        } catch {
            if (authed) setAuthed(false);
        }
    }, [liveTournament?.id, (liveTournament as any)?.refereesAuthVersion, authed, requiresTransientRefereeSecret, liveRefereeBypass]);

    useEffect(() => {
        syncedPasswordRef.current = '';
    }, []);

    const liveTournamentName = useMemo(() => {
        const tLive = state.tournament;
        if (!tLive) return null;
        return (tLive.name || '').trim() || 'Torneo Live';
    }, [state.tournament]);

    const teamById = useMemo(() => {
        const map = new Map<string, Team>();
        const teams = Array.isArray(liveTournament?.teams) ? liveTournament!.teams : [];
        for (const tt of teams) {
            if (!tt?.id) continue;
            map.set(tt.id, tt);
        }
        return map;
    }, [liveTournament]);

    const teamNameById = useMemo(() => {
        const map = new Map<string, string>();
        const teams = Array.isArray(liveTournament?.teams) ? liveTournament!.teams : [];
        for (const tt of teams) {
            if (!tt?.id) continue;
            const label = (tt.name || '').trim() || tt.id;
            map.set(tt.id, label);
        }
        return map;
    }, [liveTournament]);

    const availableReferees = useMemo(() => {
        if (!liveTournament) return [] as string[];
        const names: string[] = [];
        const roster = Array.isArray((liveTournament as any).refereesRoster) ? (liveTournament as any).refereesRoster : [];
        for (const n of roster) {
            if (typeof n === 'string') names.push(n);
        }

        const liveTeams = Array.isArray(liveTournament.teams) ? liveTournament.teams : [];
        for (const team of liveTeams) {
            const p1Legacy = !!team.isReferee && !(team as any).player2IsReferee;
            const p1Ref = !!(team as any).player1IsReferee || p1Legacy;
            const p2Ref = !!(team as any).player2IsReferee;

            if (p1Ref && typeof team.player1 === 'string') names.push(team.player1);
            if (p2Ref && typeof team.player2 === 'string') names.push(team.player2);
        }

        // normalize + dedupe case-insensitive
        const map = new Map<string, string>();
        for (const raw of names) {
            const n = normalizeName(raw || '');
            if (!isValidCandidateName(n)) continue;
            const key = n.toLowerCase();
            if (!map.has(key)) map.set(key, n);
        }

        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    }, [liveTournament]);

    useEffect(() => {
        if (!selectedReferee) return;
        if (availableReferees.includes(selectedReferee)) return;
        setSelectedReferee('');
        try { sessionStorage.removeItem('flbp_ref_name'); } catch {}
    }, [availableReferees, selectedReferee]);

    const tournamentMatchesSorted = useMemo(() => {
        const ms = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
        return [...ms]
            .filter(m => !(m as any)?.hidden)
            .filter(m => !(m as any)?.isBye)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }, [state.tournamentMatches]);

    const isRefertable = (m: Match) => {
        if (!m) return false;
        if ((m as any)?.hidden) return false;
        if ((m as any)?.isBye) return false;
        if (!m.code) return false;
        if (m.status === 'finished') return false;
        // Must have at least 2 real participants (no BYE/TBD, no incomplete skeleton matches)
        const ids = getMatchParticipantIds(m).filter(Boolean);
        if (!ids.length) return false;
        if (!m.teamIds || m.teamIds.length < 2) {
            if (!m.teamAId || !m.teamBId) return false;
        }
        if (ids.some(x => isByeTeamId(x))) return false;
        if (ids.some(x => isTbdTeamId(x))) return false;
        const realIds = ids.filter(x => !isByeTeamId(x) && !isTbdTeamId(x));
        if (realIds.length < 2) return false;
        return true;
    };

    const pendingMatches = useMemo(() => {
        const ms = tournamentMatchesSorted.filter(isRefertable);
        // Playing first, then scheduled, then orderIndex
        return ms.sort((a, b) => {
            const sa = a.status === 'playing' ? 0 : 1;
            const sb = b.status === 'playing' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        });
    }, [tournamentMatchesSorted]);

    const foundMatch: Match | undefined = useMemo(() => {
        if (!foundMatchId) return undefined;
        return tournamentMatchesSorted.find(m => m.id === foundMatchId);
    }, [foundMatchId, tournamentMatchesSorted]);

    const formatPhaseBadge = (m: Match) => (
        m.phase === 'groups'
            ? (m.groupName ? `${t('group') || 'Girone'} ${m.groupName}` : (t('groups_label') || 'Gironi'))
            : (m.roundName || (t('bracket') || 'Bracket'))
    );

    const formatStatusBadge = (m: Match) => (
        m.status === 'playing'
            ? (t('playing_upper') || 'IN CORSO')
            : (t('scheduled_upper') || 'SCHEDULATO')
    );

    const formatMatchLabel = (m: Match) => {
        const ids = getMatchParticipantIds(m);
        const getName = (id: string) => (teamNameById.get(id) || id);
        const base = formatMatchTeamsLabel(m, getName);
        const tb = m.isTieBreak
            ? ` • ${t('tie_break_upper') || 'SPAREGGIO'}${ids.length >= 3 ? ` ${t('multi_upper') || 'MULTI'}` : ''}${(typeof m.targetScore === 'number') ? ` ${t('race_to_prefix') || 'a'} ${m.targetScore}` : ''}`
            : '';
        const phase = m.phase === 'bracket' ? (t('bracket_upper') || 'TABELLONE') : (t('groups_upper') || 'GIRONI');
        const status = formatStatusBadge(m);
        return `${base} • ${phase} • ${status}${tb}`;
    };

    const filteredPendingMatches = useMemo(() => {
        const q = (reportCode || '').trim().toLowerCase();
        if (!q) return pendingMatches;
        return pendingMatches.filter((m) => {
            const code = String(m.code || '').toLowerCase();
            const label = formatMatchLabel(m).toLowerCase();
            return code.includes(q) || label.includes(q);
        });
    }, [pendingMatches, reportCode]);

    const filteredPlayingMatches = useMemo(
        () => filteredPendingMatches.filter((m) => m.status === 'playing'),
        [filteredPendingMatches],
    );

    const filteredScheduledMatches = useMemo(
        () => filteredPendingMatches.filter((m) => m.status !== 'playing'),
        [filteredPendingMatches],
    );

    // ===== Auth =====
    const doLogin = async () => {
        const live = liveTournament;
        if (!live) {
            setLoginError(t('alert_no_live_active') || 'Nessun torneo live attivo.');
            return;
        }
        const entered = (password || '').trim();
        if (!entered) {
            setLoginError(t('referees_password_required_input') || 'Inserisci la password arbitri.');
            return;
        }

        setLoginBusy(true);
        try {
            const expected = (live as any).refereesPassword;
            if (expected) {
                if (entered !== String(expected)) {
                    setLoginError(t('referees_password_wrong') || 'Password errata.');
                    return;
                }
            } else if (!isLocalOnlyMode() && getSupabaseConfig()) {
                const check = await verifyRefereePassword(live.id, entered);
                if (!check?.ok) {
                    setLoginError(check?.reason === 'no_config'
                        ? (t('referees_access_not_configured') || 'Accesso arbitri non configurato per questo torneo.')
                        : (t('referees_password_wrong') || 'Password errata.'));
                    return;
                }
                try {
                    const pulled = await pullRefereeLiveState(live.id, entered);
                    if (pulled?.ok && pulled.state) {
                        setState(pulled.state);
                    }
                } catch (syncError: any) {
                    const syncMessage = String(syncError?.message || syncError || '');
                    if (!/flbp_referee_pull_live_state|non disponibile su questo progetto Supabase/i.test(syncMessage)) {
                        throw syncError;
                    }
                }
            } else {
                setLoginError(t('referees_access_not_configured') || 'Accesso arbitri non configurato per questo torneo.');
                return;
            }

            try {
                sessionStorage.setItem('flbp_ref_authed', '1');
                sessionStorage.setItem('flbp_ref_authed_for', live.id);
                const authVersion = String((live as any).refereesAuthVersion || '').trim();
                if (authVersion) sessionStorage.setItem('flbp_ref_authed_ver', authVersion);
                else sessionStorage.removeItem('flbp_ref_authed_ver');
            } catch { /* ignore */ }
            syncedPasswordRef.current = entered;
            setAuthed(true);
            setPassword('');
            setLoginError(null);
        } catch (e: any) {
            const msg = String(e?.message || e || '');
            setLoginError(
                msg.includes('flbp_referee_auth_check')
                    ? (t('referees_remote_sync_not_enabled') || 'Sync arbitri remoto non ancora attivato sul database. Esegui la migration dedicata.')
                    : (msg || (t('referees_password_check_failed') || 'Verifica password non riuscita.'))
            );
        } finally {
            setLoginBusy(false);
        }
    };

    const doLogout = () => {
        try {
            sessionStorage.removeItem('flbp_ref_authed');
            sessionStorage.removeItem('flbp_ref_authed_for');
            sessionStorage.removeItem('flbp_ref_authed_ver');
        } catch { /* ignore */ }
        syncedPasswordRef.current = '';
        setAuthed(false);
    };

    const persistSelectedReferee = (name: string) => {
        const n = normalizeName(name);
        setSelectedReferee(n);
        try { sessionStorage.setItem('flbp_ref_name', n); } catch {}
    };

    useEffect(() => {
        if (!liveRefereeBypass) return;
        if (!liveRefereeBypassSelectedName) return;
        const current = normalizeName(selectedReferee).toLowerCase();
        const next = normalizeName(liveRefereeBypassSelectedName).toLowerCase();
        if (current !== next) {
            persistSelectedReferee(liveRefereeBypassSelectedName);
        }
        if (page === 'select') {
            setPage('match');
        }
    }, [liveRefereeBypass, liveRefereeBypassSelectedName, page, selectedReferee]);

    const persistReportCode = (code: string) => {
        const c = (code || '').trim().toUpperCase();
        setReportCode(c);
        try { sessionStorage.setItem('flbp_ref_code', c); } catch {}
    };

    const clearOcrSupport = () => {
        if (supportImageUrl) {
            // dataURL - nothing to revoke
        }
        setSupportImageUrl('');
        setSupportOcrText('');
        setSupportOcrData(null);
    };

    const normalizeForOcr = (s: string) => {
        try {
            return (s || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        } catch {
            return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        }
    };

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const extractPlayerNumbersFromOcr = (textNorm: string, playerName: string) => {
        const pn = normalizeForOcr(playerName);
        if (!pn) return null as null | { canestri?: number; soffi?: number };

        const idx = textNorm.indexOf(pn);
        if (idx < 0) return null;

        const win = textNorm.slice(idx, idx + 220);
        let canestri: number | undefined;
        let soffi: number | undefined;

        const mPt = win.match(/\bpt\b\s*[:\-]?\s*(\d{1,2})/i);
        if (mPt) canestri = Math.max(0, parseInt(mPt[1], 10) || 0);

        const mSf = win.match(/\bsf\b\s*[:\-]?\s*(\d{1,2})/i);
        if (mSf) soffi = Math.max(0, parseInt(mSf[1], 10) || 0);

        if (canestri === undefined && soffi === undefined) return null;

        return { canestri, soffi };
    };

    const detectWinnerTeamIdFromOcr = (textNorm: string, teams: Team[]) => {
        const hits: string[] = [];
        for (const tt of teams) {
            const label = normalizeForOcr(teamNameById.get(tt.id) || tt.name || tt.id);
            if (!label) continue;
            const reA = new RegExp(`\\bx\\s*${escapeRegExp(label)}\\b`, 'i');
            const reB = new RegExp(`\\b${escapeRegExp(label)}\\s*x\\b`, 'i');
            if (reA.test(textNorm) || reB.test(textNorm)) hits.push(tt.id);
        }
        return hits.length === 1 ? hits[0] : undefined;
    };

    // ===== R2: add manual referee =====
    const addManualReferee = () => {
        if (!liveTournament) return;
        const n = normalizeName(manualName);
        if (!isValidCandidateName(n)) {
            setManualError(t('referees_manual_name_invalid') || 'Inserisci un nome valido.');
            return;
        }

        const current = Array.isArray((liveTournament as any).refereesRoster) ? (liveTournament as any).refereesRoster : [];
        const exists = current.some((x: any) => typeof x === 'string' && normalizeName(x).toLowerCase() === n.toLowerCase());
        if (exists) {
            setManualError(t('referees_manual_name_duplicate') || 'Nome già presente.');
            return;
        }

        const nextRoster = [...current, n];
        const nextTournament = { ...(liveTournament as any), refereesRoster: nextRoster };

        setState({ ...state, tournament: nextTournament });
        setManualName('');
        setManualError(null);
        setAddingManual(false);
        persistSelectedReferee(n);
    };

    // ===== Pages =====
    const scrollToPageTop = () => {
        try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
            // ignore
        }
    };

    const canProceedToMatch = !!liveTournament && !!selectedReferee;

    const enterMatchPage = () => {
        if (!canProceedToMatch) return;
        setPage('match');
        setReportCodeError(null);
        persistReportCode('');
        scrollToPageTop();
    };

    const backToSelectPage = () => {
        setPage('select');
        setReportCodeError(null);
        setCodeChoices([]);
        setFoundMatchId('');
        setEntryMode(null);
        clearOcrSupport();
    };

    const backToMatchStep = () => {
        setPage('match');
        setReportCodeError(null);
        setCodeChoices([]);
        setFoundMatchId('');
        setEntryMode(null);
        clearOcrSupport();
        persistReportCode('');
        scrollToPageTop();
    };

    const backToModeStep = () => {
        setReportCodeError(null);
        setEntryMode(null);
        scrollToPageTop();
    };

    // ===== Helpers from Admin (copied minimally) =====
    const getTeamFromCatalog = (id?: string) => {
        if (!id) return undefined;
        const live = (state.tournament?.teams || []) as Team[];
        const fromLive = (live || []).find((tt: any) => tt.id === id) as Team | undefined;
        if (fromLive) return fromLive;
        return (state.teams || []).find((tt: any) => tt.id === id) as Team | undefined;
    };

    const buildStructuredOcrSupportText = (data: RefertoStructuredOcrResult | null, match?: Match) => {
        if (!data) return '';
        const teamA = match?.teamAId ? getTeamFromCatalog(match.teamAId) : undefined;
        const teamB = match?.teamBId ? getTeamFromCatalog(match.teamBId) : undefined;
        const row = (label: string, name: string, stats: { canestri?: number; soffi?: number }) => {
            const parts = [label, name || ''];
            if (typeof stats.canestri === 'number') parts.push(`CAN ${stats.canestri}`);
            if (typeof stats.soffi === 'number') parts.push(`SF ${stats.soffi}`);
            return parts.filter(Boolean).join(' | ');
        };

        const code = data.code || (match?.code || reportCode || '').trim().toUpperCase();
        const lines = [
            `ID PARTITA: ${code || '(non letto)'}`,
            `SQUADRA A: ${(teamA?.name || data.teamAName || '(non letta)').trim()}`,
            row('G1-A', (teamA?.player1 || data.playerA1.name || '').trim(), data.playerA1),
            row('G2-A', (teamA?.player2 || data.playerA2.name || '').trim(), data.playerA2),
            `SQUADRA B: ${(teamB?.name || data.teamBName || '(non letta)').trim()}`,
            row('G1-B', (teamB?.player1 || data.playerB1.name || '').trim(), data.playerB1),
            row('G2-B', (teamB?.player2 || data.playerB2.name || '').trim(), data.playerB2),
        ];

        if (typeof data.teamAScore === 'number' || typeof data.teamBScore === 'number') {
            lines.push(`TOTALE CANESTRI: ${typeof data.teamAScore === 'number' ? data.teamAScore : '?'} - ${typeof data.teamBScore === 'number' ? data.teamBScore : '?'}`);
        }
        lines.push(data.winnerSide ? `ESITO: Vince Squadra ${data.winnerSide}` : 'ESITO: non rilevato');
        if (data.issues.length) {
            lines.push('');
            data.issues.forEach(issue => lines.push(`ATTENZIONE: ${issue}`));
        }
        return lines.join('\n').trim();
    };

    const buildBracketRounds = (allMatches: Match[]): Match[][] => {
        const rounds: Match[][] = [];
        if (state.tournament?.rounds && state.tournament.rounds.length) {
            state.tournament.rounds.forEach(r => rounds.push(r));
            return rounds;
        }
        const bracketMatches = (allMatches || []).filter(m => m.phase === 'bracket');
        const map = new Map<number, Match[]>();
        bracketMatches.forEach(m => {
            const r = m.round || 1;
            if (!map.has(r)) map.set(r, []);
            map.get(r)!.push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach(k => rounds.push(map.get(k)!.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))));
        return rounds;
    };

    const findMatchPositionInRounds = (rounds: Match[][], matchId: string): { rIdx: number; mIdx: number } | null => {
        for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
            const round = rounds[rIdx] || [];
            for (let mIdx = 0; mIdx < round.length; mIdx++) {
                if (round[mIdx]?.id === matchId) return { rIdx, mIdx };
            }
        }
        return null;
    };

    const resolveWinnerTeamId = (m: Match) => {
        if (!m) return undefined;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE') {
            if (String(m.teamBId).startsWith('TBD')) return undefined;
            return m.teamBId;
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') {
            if (String(m.teamAId).startsWith('TBD')) return undefined;
            return m.teamAId;
        }
        if (m.status !== 'finished') return undefined;
        if (m.scoreA > m.scoreB) {
            if (String(m.teamAId).startsWith('TBD')) return undefined;
            return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
            if (String(m.teamBId).startsWith('TBD')) return undefined;
            return m.teamBId;
        }
        return undefined;
    };

    const applyByeAutoWin = (m: Match): Match => {
        if (!m) return m;
        if (m.status === 'finished') return m;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE' && !String(m.teamBId).startsWith('TBD')) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE' && !String(m.teamAId).startsWith('TBD')) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamAId === 'BYE' && m.teamBId === 'BYE') {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        return m;
    };

    const replaceMatch = (matches: Match[], updated: Match) => {
        return matches.map(m => (m.id === updated.id ? { ...m, ...updated } : m));
    };

    const propagateWinnerFromMatch = (finishedMatch: Match, matches: Match[]) => {
        const rounds = buildBracketRounds(matches);
        const pos = findMatchPositionInRounds(rounds, finishedMatch.id);
        if (!pos) return matches;

        let rIdx = pos.rIdx;
        let mIdx = pos.mIdx;
        let current = finishedMatch;

        let out = [...matches];
        const byId = new Map(out.map(m => [m.id, m]));
        const upsert = (u: Match) => {
            byId.set(u.id, u);
            out = out.map(m => (m.id === u.id ? u : m));
        };

        while (true) {
            const winner = resolveWinnerTeamId(current);
            if (!winner || winner === 'BYE') break;

            const nextRound = rounds[rIdx + 1];
            if (!nextRound || nextRound.length === 0) break;

            const nextSkel = nextRound[Math.floor(mIdx / 2)];
            if (!nextSkel) break;

            const next = byId.get(nextSkel.id) || nextSkel;
            const slot: 'teamAId' | 'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
            if ((next as any)[slot]) break;

            let nextUpdated: Match = { ...next, [slot]: winner } as any;
            const beforeStatus = nextUpdated.status;
            nextUpdated = applyByeAutoWin(nextUpdated);
            upsert(nextUpdated);

            if (beforeStatus !== 'finished' && nextUpdated.status === 'finished') {
                current = nextUpdated;
                rIdx = rIdx + 1;
                mIdx = Math.floor(mIdx / 2);
                continue;
            }
            break;
        }

        return out;
    };

    const autoResolveBracketByes = (matches: Match[]) => {
        let out = [...matches];
        let changed = true;
        let guard = 0;
        while (changed && guard < 2000) {
            guard++;
            changed = false;
            for (const m of out) {
                if (m.phase !== 'bracket') continue;
                if (m.status === 'finished') continue;
                const after = applyByeAutoWin(m);
                const didChange = (after.status !== m.status) || (after.scoreA !== m.scoreA) || (after.scoreB !== m.scoreB) || (after.played !== m.played);
                if (after.status === 'finished' && didChange) {
                    out = replaceMatch(out, after);
                    out = propagateWinnerFromMatch(after, out);
                    changed = true;
                }
            }
        }
        return out;
    };

    // ===== Match selection / lookup =====
    const initReportFormFromMatch = (m: Match) => {
        if (!m) return;
        const nextForm: StatsForm = {};

        const participantIds = (m.teamIds && m.teamIds.length)
            ? (m.teamIds || [])
            : ([m.teamAId, m.teamBId].filter(Boolean) as string[]);

        const participantTeams = participantIds
            .filter(id => id && !isByeTeamId(id))
            .map(id => getTeamFromCatalog(id))
            .filter(Boolean) as Team[];

        const getKey = (teamId: string, playerName: string) => `${teamId}||${playerName}`;

        const existing = new Map<string, { canestri: number; soffi: number }>();
        (m.stats || []).forEach(s => {
            const k = getKey(s.teamId, s.playerName);
            existing.set(k, { canestri: s.canestri || 0, soffi: s.soffi || 0 });
        });

        const seedPlayer = (teamId?: string, playerName?: string) => {
            if (!teamId || !playerName) return;
            if (isByeTeamId(teamId)) return;
            const k = getKey(teamId, playerName);
            const v = existing.get(k) || { canestri: 0, soffi: 0 };
            nextForm[k] = { canestri: String(v.canestri ?? 0), soffi: String(v.soffi ?? 0) };
        };

        participantTeams.forEach(tt => {
            seedPlayer(tt?.id, tt?.player1);
            seedPlayer(tt?.id, tt?.player2);
        });

        setReportStatsForm(nextForm);
    };

    const selectMatch = (m: Match) => {
        if (!m?.id) return;
        setCodeChoices([]);
        setFoundMatchId(m.id);
        persistReportCode(m.code || '');
        setReportCodeError(null);
        setEntryMode(null);
        clearOcrSupport();
        initReportFormFromMatch(m);
        setPage('report');
        scrollToPageTop();
    };

    const lookupMatchByCode = (overrideCode?: string) => {
        setReportCodeError(null);
        setCodeChoices([]);
        setEntryMode(null);
        clearOcrSupport();

        const code = (overrideCode ?? reportCode ?? '').trim().toUpperCase();
        if (!code) {
            setFoundMatchId('');
            setReportCodeError(t('referees_err_missing_code') || 'Inserisci un codice referto.');
            return;
        }

        const hitsAll = tournamentMatchesSorted.filter(m => (m.code || '').trim().toUpperCase() === code);
        if (!hitsAll.length) {
            setFoundMatchId('');
            setReportCodeError(t('referees_err_code_not_found') || 'Codice non trovato nel torneo live.');
            return;
        }

        const isValidRefMatch = (m: Match) => {
            const ids = getMatchParticipantIds(m);
            if (!ids.length) return false;
            if (ids.some(x => isByeTeamId(x))) return false;
            if (ids.some(x => isTbdTeamId(x))) return false;
            return true;
        };

        const hits = hitsAll.filter(isValidRefMatch);
        if (!hits.length) {
            // Keep legacy behavior: show the first match-specific error.
            const candidate = hitsAll[0];
            const ids = getMatchParticipantIds(candidate);
            if (!ids.length) {
                setFoundMatchId('');
                setReportCodeError(t('referees_err_invalid_match') || 'Match non valido (partecipanti mancanti).');
                return;
            }
            if (ids.some(x => isByeTeamId(x))) {
                setFoundMatchId('');
                setReportCodeError(t('referees_err_is_bye') || 'Questo codice corrisponde a un BYE. Nessun referto richiesto.');
                return;
            }
            if (ids.some(x => isTbdTeamId(x))) {
                setFoundMatchId('');
                setReportCodeError(t('referees_err_has_tbd') || 'Questo match contiene TBD: non è ancora pronto per il referto.');
                return;
            }
            setFoundMatchId('');
            setReportCodeError(t('referees_err_invalid_match') || 'Match non valido.');
            return;
        }

        if (hits.length > 1) {
            const sorted = [...hits].sort((a, b) => {
                const rank = (m: Match) => (m.status === 'playing' ? 0 : (m.status === 'scheduled' ? 1 : 2));
                const ra = rank(a);
                const rb = rank(b);
                if (ra !== rb) return ra - rb;
                return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
            });
            setFoundMatchId('');
            setCodeChoices(sorted);
            setReportCodeError(t('referees_duplicate_code_select_match') || 'Codice duplicato: seleziona il match corretto dalla lista qui sotto.');
            return;
        }

        const hit = hits[0];

        setFoundMatchId(hit.id);
        persistReportCode(hit.code || code);
        setReportCodeError(null);
        initReportFormFromMatch(hit);
        setPage('report');
        scrollToPageTop();
    };

    // ===== Derived scores + tie guard =====
    const participantsForForm = useMemo(() => {
        if (!foundMatch) return [] as Team[];
        const ids = getMatchParticipantIds(foundMatch)
            .filter(id => id && !isByeTeamId(id))
            .filter(id => !isTbdTeamId(id));
        const teams = ids.map(id => getTeamFromCatalog(id)).filter(Boolean) as Team[];
        // Ensure stable order: match order (teamIds) or A/B
        return teams;
    }, [foundMatch, state.tournament, state.teams]);

    const ocrQuickSuggestions = useMemo<null | {
        byKey: Record<string, { canestri?: number; soffi?: number }>;
        winnerTeamId?: string;
        issues: string[];
    }>(() => {
        const byKey: Record<string, { canestri?: number; soffi?: number }> = {};
        const issues = Array.isArray(supportOcrData?.issues) ? supportOcrData.issues.filter(Boolean) : [];

        if (supportOcrData && foundMatch) {
            const assignPlayer = (
                teamId: string | undefined,
                playerName: string | undefined,
                suggestion: { canestri?: number; soffi?: number } | undefined,
            ) => {
                if (!teamId || !playerName || !suggestion) return;
                if (suggestion.canestri === undefined && suggestion.soffi === undefined) return;
                byKey[`${teamId}||${playerName}`] = {
                    canestri: suggestion.canestri,
                    soffi: suggestion.soffi,
                };
            };

            const teamA = foundMatch.teamAId ? getTeamFromCatalog(foundMatch.teamAId) : undefined;
            const teamB = foundMatch.teamBId ? getTeamFromCatalog(foundMatch.teamBId) : undefined;
            assignPlayer(teamA?.id, teamA?.player1, supportOcrData.playerA1);
            assignPlayer(teamA?.id, teamA?.player2, supportOcrData.playerA2);
            assignPlayer(teamB?.id, teamB?.player1, supportOcrData.playerB1);
            assignPlayer(teamB?.id, teamB?.player2, supportOcrData.playerB2);

            const winnerTeamId = supportOcrData.winnerSide === 'A'
                ? teamA?.id
                : supportOcrData.winnerSide === 'B'
                    ? teamB?.id
                    : undefined;

            if (Object.keys(byKey).length || winnerTeamId || issues.length) {
                return { byKey, winnerTeamId, issues };
            }
        }

        if (!supportOcrText || !foundMatch) return null;

        const textNorm = normalizeForOcr(supportOcrText);
        if (!textNorm) return null;

        participantsForForm.forEach(tt => {
            const players = [tt.player1, tt.player2].filter(Boolean) as string[];
            players.forEach(p => {
                const r = extractPlayerNumbersFromOcr(textNorm, p);
                if (!r) return;
                const key = `${tt.id}||${p}`;
                byKey[key] = r;
            });
        });

        const winnerTeamId = detectWinnerTeamIdFromOcr(textNorm, participantsForForm);

        if (!Object.keys(byKey).length && !winnerTeamId && !issues.length) return null;

        return { byKey, winnerTeamId, issues };
    }, [supportOcrData, supportOcrText, foundMatch, foundMatchId, participantsForForm, teamNameById]);

    const applyOcrSuggestions = () => {
        if (!ocrQuickSuggestions) return;

        setReportStatsForm(prev => {
            const next: StatsForm = { ...prev };
            const entries = Object.entries(ocrQuickSuggestions.byKey) as Array<[
                string,
                { canestri?: number; soffi?: number }
            ]>;
            for (const [key, sug] of entries) {
                const cur = next[key] || { canestri: '0', soffi: '0' };

                const nextCan = sug.canestri !== undefined ? String(sug.canestri) : undefined;
                const nextSf = sug.soffi !== undefined ? String(sug.soffi) : undefined;

                // Conservative apply: only fill empty/0 fields to avoid overwriting manual edits.
                next[key] = {
                    canestri: (nextCan && (!cur.canestri || cur.canestri === '0')) ? nextCan : cur.canestri,
                    soffi: (nextSf && (!cur.soffi || cur.soffi === '0')) ? nextSf : cur.soffi,
                };
            }
            return next;
        });
    };

    const derivedScoresByTeam = useMemo(() => {
        const out: Record<string, number> = {};
        if (!foundMatch) return out;

        const getCan = (teamId: string, playerName?: string) => {
            if (!playerName) return 0;
            const k = `${teamId}||${playerName}`;
            const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
            return Math.max(0, parseInt(f.canestri || '0', 10) || 0);
        };

        for (const tt of participantsForForm) {
            if (!tt?.id) continue;
            out[tt.id] = getCan(tt.id, tt.player1) + getCan(tt.id, tt.player2);
        }
        return out;
    }, [foundMatch, participantsForForm, reportStatsForm]);

    const tieNotAllowed = useMemo(() => {
        const vals = Object.values(derivedScoresByTeam) as number[];
        if (!vals.length) return false;
        const max = Math.max(...vals);
        const leaders = Object.keys(derivedScoresByTeam).filter(id => (derivedScoresByTeam[id] || 0) === max);
        // if max is 0 and all zero, don't block UI yet (but save will still block)
        if (max === 0) return false;
        return leaders.length !== 1;
    }, [derivedScoresByTeam]);

    // ===== Save report =====
    const saveReport = async () => {
        if (!state.tournament) {
            alert(t('alert_no_live_active'));
            return;
        }
        if (!foundMatch) {
            alert(t('alert_select_match'));
            return;
        }

        if (foundMatch.status === 'finished') {
            const ok = confirm(t('referees_overwrite_confirm') || 'Match già finito. Vuoi sovrascrivere il referto?');
            if (!ok) return;
        }

        setSaveBusy(true);
        try {
            let matches = [...(state.tournamentMatches || [])];
            const idx = matches.findIndex(m => m.id === foundMatch.id);
            if (idx === -1) {
                alert(t('alert_select_match'));
                return;
            }
            const base = matches[idx];

            const isMulti = !!(base.teamIds && base.teamIds.length >= 2);
            const participantIds = isMulti
                ? (base.teamIds || []).filter(Boolean)
                : ([base.teamAId, base.teamBId].filter(Boolean) as string[]);

            const participantTeams = participantIds
                .filter(id => id && !isByeTeamId(id))
                .map(id => getTeamFromCatalog(id))
                .filter(Boolean) as Team[];

            const scoresByTeam: Record<string, number> = {};
            participantTeams.forEach(tt => { scoresByTeam[tt.id] = derivedScoresByTeam[tt.id] ?? 0; });

            // Prevent saving ties: there must be a unique winner.
            const vals = Object.values(scoresByTeam) as number[];
            const max = vals.length ? Math.max(...vals) : 0;
            const leaders = Object.keys(scoresByTeam).filter(id => (scoresByTeam[id] || 0) === max);
            if (leaders.length !== 1) {
                alert(t('alert_tie_not_allowed') || 'Pareggio non ammesso: inserisci lo spareggio nei canestri dei giocatori.');
                return;
            }

            const orderedScores = Object.values(scoresByTeam).sort((a, b) => b - a);
            const updated: Match = {
                ...base,
                // For tie-break matches we promote the effective target to the final max score.
                // This makes the UI badge "a N" reflect the actual race-to-N reached (2–1, 3–2, ...).
                targetScore: base.isTieBreak ? max : base.targetScore,
                scoresByTeam: isMulti ? scoresByTeam : base.scoresByTeam,
                scoreA: isMulti ? (orderedScores[0] ?? 0) : (scoresByTeam[base.teamAId || ''] ?? 0),
                scoreB: isMulti ? (orderedScores[1] ?? 0) : (scoresByTeam[base.teamBId || ''] ?? 0),
                status: 'finished',
                played: true,
            };

            // Build stats
            const nextStats: MatchStats[] = [];
            const pushStat = (teamId?: string, playerName?: string) => {
                if (!teamId || !playerName) return;
                if (isByeTeamId(teamId)) return;
                const k = `${teamId}||${playerName}`;
                const f = reportStatsForm[k] || { canestri: '0', soffi: '0' };
                nextStats.push({
                    teamId,
                    playerName,
                    canestri: Math.max(0, parseInt(f.canestri || '0', 10) || 0),
                    soffi: Math.max(0, parseInt(f.soffi || '0', 10) || 0),
                });
            };

            participantTeams.forEach(tt => {
                pushStat(tt?.id, tt?.player1);
                pushStat(tt?.id, tt?.player2);
            });

            if (nextStats.length) updated.stats = nextStats;

            matches[idx] = updated;

            // Sync bracket from groups in groups+elimination mode
            if (updated.phase === 'groups' && state.tournament?.type === 'groups_elimination') {
                matches = syncBracketFromGroups(state.tournament, matches);
                matches = autoResolveBracketByes(matches);
            }

            // Final stage: if the final round-robin is activated and completed, auto-create FTB* if needed.
            if (updated.phase === 'groups' && state.tournament) {
                matches = ensureFinalTieBreakIfNeeded(state.tournament, matches);
            }

            // Propagate winner in bracket
            if (updated.phase === 'bracket' && updated.status === 'finished') {
                matches = propagateWinnerFromMatch(updated, matches);
            }

            const nextTournament = state.tournament ? { ...state.tournament, matches } : state.tournament;
            const nextState: AppState = { ...state, tournament: nextTournament, tournamentMatches: matches };

            const shouldUseRefereeRemotePush = !isLocalOnlyMode() && !!getSupabaseConfig() && !getSupabaseAccessToken();
            if (shouldUseRefereeRemotePush) {
                const configuredRefereePassword = String((state.tournament as any)?.refereesPassword || '').trim();
                const refereePassword = configuredRefereePassword || (syncedPasswordRef.current || '').trim();
                if (!refereePassword) {
                    alert(t('referees_session_expired_relogin') || 'Sessione arbitro scaduta su questo dispositivo. Per sicurezza la password arbitri non viene salvata nel browser: effettua di nuovo il login arbitri.');
                    return;
                }
                try {
                    await pushRefereeLiveState(nextState, {
                        tournamentId: state.tournament.id,
                        refereePassword,
                        baseUpdatedAt: getRemoteBaseUpdatedAt()
                    });
                    clearDbSyncCurrentIssue();
                    markDbSyncOk('snapshot');
                } catch (e: any) {
                    if (e?.code === 'FLBP_DB_CONFLICT') {
                        try {
                            const pulled = await pullRefereeLiveState(state.tournament.id, refereePassword);
                            if (pulled?.ok && pulled.state) {
                                const mergeResult = tryMergeRemoteStateConflict({
                                    baseState: state,
                                    localState: nextState,
                                    remoteState: pulled.state
                                });
                                if (mergeResult.ok) {
                                    await pushRefereeLiveState(mergeResult.state, {
                                        tournamentId: state.tournament.id,
                                        refereePassword,
                                        baseUpdatedAt: pulled.updated_at || null
                                    });
                                    clearDbSyncCurrentIssue();
                                    markDbSyncOk('snapshot');
                                    setState(mergeResult.state);
                                    alert(t('alert_report_saved'));
                                    return;
                                }
                            }
                        } catch {
                            // fall through to the user-facing conflict warning below
                        }
                        markDbSyncConflict(e?.message || 'Conflitto DB');
                        alert(t('referees_db_updated_elsewhere') || 'Il torneo è stato aggiornato da un altro dispositivo. Riapri la schermata arbitri e riprova.');
                    } else {
                        markDbSyncError(e?.message || String(e), 'snapshot');
                        alert(t('referees_db_save_failed') || 'Salvataggio DB arbitri non riuscito. Controlla connessione e riprova.');
                    }
                    return;
                }
            }

            setState(nextState);
            alert(t('alert_report_saved'));
        } finally {
            setSaveBusy(false);
        }
    };

    // ===== OCR flow =====
    const extractCodeFromOcr = (text: string) => {
        const cleaned = String(text || '').replace(/\r/g, '\n');
        const m = cleaned.match(/\b([A-Z]{1,2}TB\d{1,4}|[A-Z]{1,2}\d{1,4})\b/i);
        return m ? m[1].toUpperCase() : '';
    };

    const extractScoreLabelFromOcr = (text: string) => {
        const cleaned = String(text || '').replace(/\r/g, '\n');
        // Match "10-8" or "1-2-1" etc (2..5 numbers)
        const m = cleaned.match(/\b(\d{1,2}(?:\s*[-–:]\s*\d{1,2}){1,4})\b/);
        return m ? m[1].replace(/\s+/g, '') : '';
    };

    const openOcrModal = (payload: {
        codeGuess: string;
        scoreGuess: string;
        text: string;
        imageUrl: string;
        data?: RefertoStructuredOcrResult | null;
    }) => {
        setOcrModalError(null);
        setOcrModalCode(payload.codeGuess || reportCode || '');
        setOcrModalScoreLabel(payload.scoreGuess || '');
        setOcrModalText(payload.text || '');
        setOcrModalImageUrl(payload.imageUrl || '');
        setOcrModalData(payload.data || null);
        setOcrModalOpen(true);
    };

    const closeOcrModal = () => {
        setOcrModalOpen(false);
        setOcrModalError(null);
        setOcrModalData(null);
    };

    const confirmOcrModal = () => {
        const code = (ocrModalCode || '').trim().toUpperCase();
        if (!code) {
            setOcrModalError(t('referees_err_missing_code') || 'Inserisci un codice referto.');
            return;
        }

        const hitsAll = tournamentMatchesSorted.filter(m => (m.code || '').trim().toUpperCase() === code);
        if (!hitsAll.length) {
            setOcrModalError(t('referees_err_code_not_found') || 'Codice non trovato nel torneo live.');
            return;
        }

        const hits = hitsAll.filter(m => {
            const ids = getMatchParticipantIds(m);
            if (!ids.length) return false;
            if (ids.some(x => isByeTeamId(x))) return false;
            if (ids.some(x => isTbdTeamId(x))) return false;
            return true;
        });
        if (!hits.length) {
            // Fall back to legacy single-hit validation on the first candidate.
            const candidate = hitsAll[0];
            const ids = getMatchParticipantIds(candidate);
            if (!ids.length) {
                setOcrModalError(t('referees_err_invalid_match') || 'Match non valido (partecipanti mancanti).');
                return;
            }
            if (ids.some(x => isByeTeamId(x))) {
                setOcrModalError(t('referees_err_is_bye') || 'Questo codice corrisponde a un BYE.');
                return;
            }
            if (ids.some(x => isTbdTeamId(x))) {
                setOcrModalError(t('referees_err_has_tbd') || 'Questo match contiene TBD: non è pronto per il referto.');
                return;
            }
            setOcrModalError(t('referees_err_invalid_match') || 'Match non valido.');
            return;
        }

        if (hits.length > 1) {
            setOcrModalError(t('referees_duplicate_code_use_manual') || 'Codice duplicato: usa l\'inserimento manuale e seleziona il match corretto dalla lista.');
            return;
        }

        const hit = hits[0];

        // Apply
        persistReportCode(code);
        setFoundMatchId(hit.id);
        initReportFormFromMatch(hit);
        setEntryMode('manual');
        setSupportImageUrl(ocrModalImageUrl || '');
        setSupportOcrText(ocrModalText || '');
        setSupportOcrData(ocrModalData);
        closeOcrModal();
    };

    const runOcrOnFile = async (file?: File) => {
        if (!file) return;
        if (!foundMatch) {
            setReportCodeError(t('alert_select_match'));
            return;
        }

        setOcrBusy(true);
        try {
            const {
                preprocessRefertoToAlignedCanvas,
                ocrStructuredRefertoFromAlignedCanvas,
                ocrTextFromAlignedCanvas,
            } = await loadImageProcessingService();
            const aligned = await preprocessRefertoToAlignedCanvas(file);
            const imgUrl = aligned.toDataURL('image/jpeg', 0.92);

            let text = '';
            let structured: RefertoStructuredOcrResult | null = null;
            try {
                structured = await ocrStructuredRefertoFromAlignedCanvas(aligned);
                text = buildStructuredOcrSupportText(structured, foundMatch) || structured.summaryText || '';
            } catch (e) {
                console.error(e);
                try {
                    text = await ocrTextFromAlignedCanvas(aligned);
                } catch (inner) {
                    console.error(inner);
                    text = '';
                }
            }

            const codeGuess = structured?.code
                || (foundMatch?.code || '').trim().toUpperCase()
                || extractCodeFromOcr(text)
                || (reportCode || '').trim().toUpperCase();
            const scoreGuess = structured
                && structured.teamAScore !== undefined
                && structured.teamBScore !== undefined
                ? `${structured.teamAScore}-${structured.teamBScore}`
                : extractScoreLabelFromOcr(text);

            openOcrModal({
                codeGuess,
                scoreGuess,
                text: text || '',
                imageUrl: imgUrl,
                data: structured,
            });
        } catch (e) {
            console.error(e);
            alert(t('referees_ocr_failed') || "Errore durante l'OCR. Prova un'altra foto.");
        } finally {
            setOcrBusy(false);
        }
    };

    if (!liveTournament) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 text-2xl font-black tracking-tight">
                        <Gavel className="w-6 h-6" />
                        <span>{t('referees_area')}</span>
                    </div>
                    <div className="text-sm text-slate-600 font-semibold mt-2">
                        {t('referees_only_during_live') || "Nessun torneo live attivo. L'area arbitri è disponibile solo durante un torneo live."}
                    </div>

                    <div className="mt-6">
                        <button
                            onClick={onBack}
                            className="w-full rounded-2xl border border-slate-200 bg-white font-black px-4 py-3 hover:bg-slate-50 transition"
                        >
                            {t('back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!authed && liveRefereeBypassChecking) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 text-2xl font-black tracking-tight">
                        <Repeat2 className="w-6 h-6 animate-spin text-slate-500" />
                        <span>{t('referees_area')}</span>
                    </div>
                    <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900">
                        {t('referees_checking_player_bypass')}
                    </div>
                </div>
            </div>
        );
    }

    if (!authed) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 text-2xl font-black tracking-tight">
                        <Gavel className="w-6 h-6" />
                        <span>{t('referees_area')}</span>
                    </div>
                    <div className="text-sm text-slate-600 font-semibold mt-2">
                        {t('referees_auth_desc')}
                    </div>

                    {requiresTransientRefereeSecret ? (
                        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-900">
                            {t('referees_transient_password_note') || "In questa build pubblica la password arbitri remota non viene conservata nel browser. Se ricarichi la pagina o chiudi la scheda dovrai autenticarti di nuovo prima di salvare il referto su Supabase."}
                        </div>
                    ) : null}

                    <div className="mt-5">
                        <label className="text-xs font-black text-slate-700">{t('referees_password_placeholder')}</label>
                        <div className="mt-2 relative">
                            <input
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); if (loginError) setLoginError(null); }}
                                placeholder={t('referees_password_placeholder')}
                                type={showPassword ? 'text' : 'password'}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 font-bold outline-none focus:ring-2 focus:ring-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded-lg p-1"
                                aria-label={showPassword ? (t('hide_password') || 'Nascondi password') : (t('show_password') || 'Mostra password')}
                                title={showPassword ? (t('hide_password') || 'Nascondi password') : (t('show_password') || 'Mostra password')}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {!liveTournament.refereesPassword && isLocalOnlyMode() && (
                        <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-3 font-bold">
                            {t('referees_access_not_configured_ask_admin') || "Accesso arbitri non configurato per questo torneo. Chiedi all'Admin."}
                        </div>
                    )}
                    {loginError && (
                        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3 font-bold">
                            {loginError}
                        </div>
                    )}

                    <div className="mt-5 flex gap-3">
                        <button
                            onClick={() => { void doLogin(); }}
                            disabled={loginBusy || (!liveTournament.refereesPassword && (!getSupabaseConfig() || isLocalOnlyMode()))}
                            className="flex-1 rounded-2xl bg-slate-900 text-white font-black py-3 hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loginBusy ? (t('referees_login_checking') || 'Verifica…') : t('referees_login')}
                        </button>
                        <button
                            onClick={onBack}
                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-3 hover:bg-slate-50 transition"
                        >
                            {t('back')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6">
            {/* OCR Modal */}
            {ocrModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-lg font-black">{t('referees_ocr_confirm_title') || 'Conferma OCR'}</div>
                                <div className="text-xs text-slate-600 font-semibold mt-1">{t('referees_ocr_confirm_desc') || 'Controlla e correggi i dati estratti prima di aprire l\'inserimento manuale.'}</div>
                            </div>
                            <button
                                onClick={closeOcrModal}
                                className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50"
                            >
                                {t('close') || 'Chiudi'}
                            </button>
                        </div>

                        <div className="p-5 grid gap-4 lg:grid-cols-2">
                            <div>
                                <div className="text-xs font-black text-slate-700">{t('referees_ocr_preview') || 'Anteprima'}</div>
                                {ocrModalImageUrl ? (
                                    <img src={ocrModalImageUrl} className="mt-2 w-full rounded-2xl border border-slate-200 object-contain max-h-[360px] bg-white" alt="referto" />
                                ) : (
                                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{t('referees_no_image') || '(Nessuna immagine)'}</div>
                                )}
                            </div>

                            <div>
                                <div className="grid gap-3">
                                    {!!ocrModalData?.issues?.length && (
                                        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                                            <div className="text-xs font-black text-red-800">{t('referees_manual_check_required') || 'Controllo manuale richiesto'}</div>
                                            <div className="mt-1 space-y-1">
                                                {ocrModalData.issues.map((issue, index) => (
                                                    <div key={`${issue}-${index}`} className="text-[11px] font-semibold text-red-700">
                                                        {issue}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-xs font-black text-slate-700">{t('referees_ocr_code_label') || 'Codice referto'}</label>
                                        <input
                                            value={ocrModalCode}
                                            onChange={(e) => { setOcrModalCode(e.target.value); setOcrModalError(null); }}
                                            placeholder={t('referees_report_code_placeholder')}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-700">{t('referees_ocr_score_label') || 'Score rilevato (solo controllo)'}</label>
                                        <input
                                            value={ocrModalScoreLabel}
                                            onChange={(e) => setOcrModalScoreLabel(e.target.value)}
                                            placeholder={t('referees_ocr_score_placeholder') || 'Es. 10-8 o 1-2-1'}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                        />
                                        <div className="mt-1 text-[11px] text-slate-500 font-semibold">
                                            Nota: il risultato salvato deriva dai canestri per giocatore (non dallo score OCR).
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-700">{t('referees_ocr_text_label') || 'Testo OCR'}</label>
                                        <textarea
                                            value={ocrModalText}
                                            onChange={(e) => setOcrModalText(e.target.value)}
                                            rows={7}
                                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-slate-200"
                                        />
                                    </div>
                                    {ocrModalError && (
                                        <div className="text-xs font-black text-red-600">{ocrModalError}</div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={confirmOcrModal}
                                            className="flex-1 rounded-2xl bg-slate-900 text-white font-black py-3 hover:bg-slate-800"
                                        >
                                            {t('referees_ocr_apply') || 'Apri inserimento manuale'}
                                        </button>
                                        <button
                                            onClick={closeOcrModal}
                                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-3 hover:bg-slate-50"
                                        >
                                            {t('referees_ocr_cancel') || 'Annulla'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pt-4 pb-4 bg-white/85 backdrop-blur border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-2 text-2xl md:text-3xl font-black tracking-tight">
                        <Gavel className="w-7 h-7" />
                        <span>{t('referees_area')}</span>
                    </div>
                    <div className="text-sm text-slate-600 font-semibold mt-1">
                        {liveTournamentName ? (
                            <>{t('referees_live_tournament_label') || 'Torneo Live'}: <span className="font-black text-slate-800">{liveTournamentName}</span></>
                        ) : (
                            <>{t('alert_no_live_active') || 'Nessun torneo live attivo.'}</>
                        )}
                    </div>
                    {selectedReferee && (
                        <div className="text-xs font-black text-slate-700 mt-1">
                            {t('referees_selected')}: <span className="text-slate-900">{selectedReferee}</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-2 flex-wrap">
                    {(page === 'match' || page === 'report') && (
                        <button
                            onClick={backToSelectPage}
                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                            <span className="inline-flex items-center gap-2"><Repeat2 className="w-4 h-4" /> {t('referees_change_referee')}</span>
                        </button>
                    )}
                    {page === 'report' && (
                        <button
                            onClick={backToMatchStep}
                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                            Scegli altro match
                        </button>
                    )}
                    {page === 'report' && !!foundMatch && (
                        <button
                            onClick={backToModeStep}
                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                            Cambia modalità
                        </button>
                    )}
                    {page === 'report' && !!(supportImageUrl || supportOcrText || supportOcrData) && (
                        <button
                            onClick={clearOcrSupport}
                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                            {t('referees_clear_ocr_button') || 'Pulisci OCR'}
                        </button>
                    )}
                    <button
                        onClick={doLogout}
                        className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                        title={t('logout')}
                    >
                        <span className="inline-flex items-center gap-2"><LogOut className="w-4 h-4" /> {t('logout')}</span>
                    </button>
                    <button
                        onClick={onBack}
                        className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                        <span className="inline-flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> {t('back')}</span>
                    </button>
                </div>
            </div>

        </div>

        {page === 'select' ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_step_1_label') || 'Passo 1'}</div>
                        <div className="mt-1 font-black text-slate-800">{t('referees_step_1_title') || 'Seleziona arbitro'}</div>
                        <div className="text-sm text-slate-600 font-semibold mt-2">
                            {t('referees_step_1_desc') || 'Scegli il tuo nome tra gli arbitri configurati per il torneo live, oppure aggiungi un arbitro.'}
                        </div>
                        <div className="mt-4">
                            <label className="text-xs font-black text-slate-700">{t('referees_select_referee')}</label>
                            <select
                                value={selectedReferee}
                                onChange={(e) => persistSelectedReferee(e.target.value)}
                                disabled={!liveTournament}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                                <option value="">{t('referees_select_placeholder')}</option>
                                {availableReferees.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                            {!availableReferees.length && (
                                <div className="mt-2 text-xs font-bold text-slate-500">
                                    {t('referees_no_referees_configured') || 'Nessun arbitro configurato per questo torneo.'}
                                </div>
                            )}

                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => { setAddingManual(v => !v); setManualError(null); }}
                                    disabled={!liveTournament}
                                    className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition disabled:bg-slate-50 disabled:text-slate-400"
                                >
                                    {t('referees_add_manual')}
                                </button>
                            </div>

                            {addingManual && (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="text-xs font-black text-slate-700">{t('referees_add_manual')}</div>
                                    <input
                                        value={manualName}
                                        onChange={(e) => { setManualName(e.target.value); setManualError(null); }}
                                        placeholder={t('referees_add_name_placeholder')}
                                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                    />
                                    {manualError && (
                                        <div className="mt-2 text-xs font-black text-red-600">{manualError}</div>
                                    )}
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            onClick={addManualReferee}
                                            className="rounded-2xl bg-slate-900 text-white font-black px-4 py-2 hover:bg-slate-800 transition"
                                        >
                                            {t('referees_add_confirm')}
                                        </button>
                                        <button
                                            onClick={() => { setAddingManual(false); setManualName(''); setManualError(null); }}
                                            className="rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-slate-200"
                                        >
                                            {t('referees_add_cancel')}
                                        </button>
                                    </div>
                                    <div className="mt-3 text-[11px] text-slate-600 font-semibold">
                                        {t('referees_manual_name_added_note') || 'Il nome inserito verrà aggiunto al torneo live (solo come lista arbitri abilitati).'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_step_2_label') || 'Passo 2'}</div>
                        <div className="mt-1 font-black text-slate-800">{t('referees_step_2_title') || 'Apri referto'}</div>
                        <div className="text-sm text-slate-600 font-semibold mt-2">
                            {t('referees_step_2_desc') || 'Inserisci il referto tramite codice (o scegli dalla lista), con opzioni manuale e OCR.'}
                        </div>
                        <button
                            onClick={enterMatchPage}
                            disabled={!canProceedToMatch}
                            className={`mt-4 w-full rounded-2xl font-black py-3 transition ${canProceedToMatch ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400'}`}
                            title={!liveTournament ? (t('alert_no_live_active') || 'Nessun torneo live attivo.') : (!selectedReferee ? (t('referees_select_referee_first') || 'Seleziona un arbitro') : '')}
                        >
                            {t('referees_open_match_selection') || 'Apri selezione match'}
                        </button>
                        {!selectedReferee && liveTournament && (
                            <div className="mt-3 text-[11px] text-slate-500 font-semibold">
                                {t('referees_select_name_first') || 'Seleziona prima il tuo nome per procedere.'}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mt-6 grid gap-4 xl:grid-cols-12">
                    {page === 'match' && (
                        <div className="grid gap-4 xl:col-span-12 xl:max-w-5xl">
                            <div className="rounded-3xl border border-slate-200 bg-white p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_step_2_label') || 'Passo 2'}</div>
                                        <div className="mt-1 font-black text-slate-800">{t('referees_find_or_select_match') || 'Cerca o seleziona il match'}</div>
                                    </div>
                                    <div className="text-[11px] font-black text-slate-600">{filteredPendingMatches.length}{filteredPendingMatches.length !== pendingMatches.length ? ` / ${pendingMatches.length}` : ''}</div>
                                </div>
                                <div className="text-sm text-slate-600 font-semibold mt-2">
                                    {t('referees_find_match_desc') || 'Inserisci il codice del referto, oppure filtra l’elenco partite e seleziona il match corretto.'}
                                </div>

                                <div className="mt-4">
                                    <label className="text-xs font-black text-slate-700">{t('referees_report_code_label')}</label>
                                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                        <input
                                            value={reportCode}
                                            onChange={(e) => persistReportCode(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') lookupMatchByCode();
                                            }}
                                            placeholder={t('referees_search_by_code_or_teams') || 'Cerca per codice o squadre'}
                                            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                        />
                                        <button
                                            onClick={() => lookupMatchByCode()}
                                            className="rounded-2xl bg-slate-900 text-white font-black px-4 py-3 hover:bg-slate-800 transition"
                                        >
                                            {t('referees_find_code')}
                                        </button>
                                    </div>
                                    <div className="mt-2 text-[11px] font-semibold text-slate-500">
                                        {t('referees_code_search_help') || 'Se hai già il foglio usa il codice. Altrimenti l’elenco qui sotto si filtra mentre scrivi.'}
                                    </div>
                                    {reportCodeError && (
                                        <div className="mt-3 text-xs font-black text-red-600">{reportCodeError}</div>
                                    )}
                                    {codeChoices.length > 0 && (
                                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                            <div className="text-[11px] font-black text-amber-900">{t('referees_duplicate_code_choose_match') || 'Codice duplicato: scegli il match corretto'}</div>
                                            <div className="mt-2 space-y-2">
                                                {codeChoices.slice(0, 6).map(m => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => selectMatch(m)}
                                                        className="w-full text-left rounded-xl border border-amber-200 bg-white px-3 py-2 hover:bg-amber-100/40"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="font-black text-slate-900">{m.code || m.id}</div>
                                                            <div className="text-[10px] font-black text-amber-900">
                                                                {formatPhaseBadge(m)}
                                                            </div>
                                                        </div>
                                                        <div className="mt-1 text-[11px] font-semibold text-slate-700">{formatMatchLabel(m)}</div>
                                                        <div className="mt-1 text-[10px] font-black text-slate-600">Stato: {m.status}</div>
                                                    </button>
                                                ))}
                                                {codeChoices.length > 6 && (
                                                    <div className="text-[11px] font-semibold text-amber-900">+ altri {codeChoices.length - 6}…</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-white p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_pending_matches') || 'Match da refertare'}</div>
                                        <div className="mt-1 font-black text-slate-800">{t('referees_selectable_list') || 'Elenco selezionabile'}</div>
                                    </div>
                                    <div className="text-[11px] font-black text-slate-600">{pendingMatches.length}</div>
                                </div>
                                <div className="text-sm text-slate-600 font-semibold mt-2">
                                    {t('referees_pending_matches_desc') || 'Seleziona rapidamente un match (solo scheduled/playing).'}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-800">
                                        {t('referees_playing_count') || 'In corso'}: {filteredPlayingMatches.length}
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700">
                                        {t('referees_scheduled_count') || 'Schedulati'}: {filteredScheduledMatches.length}
                                    </div>
                                    {reportCode.trim() && (
                                        <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-800">
                                            Filtro attivo
                                        </div>
                                    )}
                                </div>
                                {!pendingMatches.length ? (
                                    <div className="mt-4 text-sm text-slate-500 font-semibold">{t('referees_no_pending_matches') || 'Nessun match in attesa.'}</div>
                                ) : !filteredPendingMatches.length ? (
                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                                        {t('referees_no_matches_current_search') || 'Nessun match corrisponde alla ricerca corrente.'}
                                    </div>
                                ) : (
                                    <div className="mt-4 max-h-[620px] space-y-4 overflow-auto pr-1">
                                        {!!filteredPlayingMatches.length && (
                                            <div>
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{t('referees_playing_now') || 'In corso'}</div>
                                                    <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                                                        {filteredPlayingMatches.length}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {filteredPlayingMatches.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => selectMatch(m)}
                                                            className="w-full text-left rounded-2xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 transition hover:bg-emerald-50"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-black text-slate-900">{m.code}</div>
                                                                <div className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-900">
                                                                    IN CORSO
                                                                </div>
                                                            </div>
                                                            <div className="mt-1 text-[11px] font-semibold text-slate-600">
                                                                {formatMatchLabel(m)}
                                                            </div>
                                                            <div className="mt-2 flex items-center justify-between gap-3">
                                                                <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-700">
                                                                    {formatPhaseBadge(m)}
                                                                </div>
                                                                <div className="text-[11px] font-black text-slate-700">
                                                                    {t('score_label') || 'Score'}: {formatMatchScoreLabel(m)}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {!!filteredScheduledMatches.length && (
                                            <div>
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_scheduled_label') || 'Schedulati'}</div>
                                                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-700">
                                                        {filteredScheduledMatches.length}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {filteredScheduledMatches.slice(0, 40).map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => selectMatch(m)}
                                                            className="w-full text-left rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-black text-slate-900">{m.code}</div>
                                                                <div className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                                                                    {t('scheduled_short') || 'SCHED'}
                                                                </div>
                                                            </div>
                                                            <div className="mt-1 text-[11px] font-semibold text-slate-600">
                                                                {formatMatchLabel(m)}
                                                            </div>
                                                            <div className="mt-2 flex items-center justify-between gap-3">
                                                                <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-700">
                                                                    {formatPhaseBadge(m)}
                                                                </div>
                                                                <div className="text-[11px] font-black text-slate-700">
                                                                    {t('score_label') || 'Score'}: {formatMatchScoreLabel(m)}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {filteredScheduledMatches.length > 40 && (
                                            <div className="text-[11px] text-slate-500 font-semibold">+ altri {filteredScheduledMatches.length - 40} match schedulati…</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {page === 'report' && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 xl:col-span-12">
                        {!foundMatch ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <div className="font-black text-slate-800">{t('referees_select_match_first') || 'Seleziona prima un match'}</div>
                                <div className="mt-2 text-sm font-semibold text-slate-600">
                                    {t('referees_select_match_first_desc') || 'Torna alla schermata precedente e scegli il codice o il match da refertare.'}
                                </div>
                                <button
                                    onClick={backToMatchStep}
                                    className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800 transition"
                                >
                                    {t('referees_back_to_match_list') || 'Torna alla lista match'}
                                </button>
                            </div>
                        ) : (
                        <>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('referees_selected_match') || 'Match selezionato'}</div>
                            <div className="mt-1 font-black text-slate-900">
                                {foundMatch.code || foundMatch.id}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-slate-700">
                                {formatMatchLabel(foundMatch)}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-600 font-semibold">
                                {foundMatch.groupName ? <>{t('group') || 'Girone'}: <span className="font-black">{foundMatch.groupName}</span> • </> : null}
                                {t('status') || 'Stato'}: <span className="font-black">{foundMatch.status}</span>
                                {foundMatch.isTieBreak ? <> • <span className="font-black text-amber-900">{t('tie_break_upper') || 'SPAREGGIO'}</span></> : null}
                            </div>
                            {foundMatch.status === 'finished' && (
                                <div className="mt-2 text-[11px] text-amber-800 font-black">
                                    {t('referees_finished_match_overwrite_note') || 'Match già finito: se salvi un nuovo referto verrà chiesta conferma.'}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{entryMode ? (t('referees_step_4_label') || 'Passo 4') : (t('referees_step_3_label') || 'Passo 3')}</div>
                            <div className="mt-1 font-black text-slate-800">{t('referees_choose_entry')}</div>
                            <div className="text-sm text-slate-600 font-semibold mt-2">
                                {t('referees_choose_entry_desc') || 'Scegli la modalità e completa il referto del match selezionato.'}
                            </div>
                        </div>
                            <div className="flex flex-wrap gap-2">
                                {foundMatch && (
                                    <button
                                        onClick={backToMatchStep}
                                        className="rounded-2xl border border-slate-200 bg-white font-black px-3 py-2 hover:bg-slate-50 transition"
                                    >
                                        {t('referees_back_to_match_list') || 'Torna alla lista match'}
                                    </button>
                                )}
                                {entryMode && (
                                    <button
                                        onClick={backToModeStep}
                                        className="rounded-2xl border border-slate-200 bg-white font-black px-3 py-2 hover:bg-slate-50 transition"
                                    >
                                        {t('referees_back_to_entry_mode') || 'Torna alla modalità'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2 flex-wrap">
                            <button
                                onClick={() => { if (!foundMatch) return; setEntryMode('manual'); }}
                                disabled={!foundMatch}
                                className={`rounded-2xl font-black px-4 py-2 border transition ${entryMode === 'manual' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'} disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-100`}
                            >
                                {t('referees_entry_manual')}
                            </button>
                            <button
                                onClick={() => {
                                    if (!foundMatch) return;
                                    setEntryMode('ocr');
                                    setReportCodeError(null);
                                    try { ocrInputRef.current?.click(); } catch { /* ignore */ }
                                }}
                                disabled={!foundMatch}
                                className={`rounded-2xl font-black px-4 py-2 border transition ${entryMode === 'ocr' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'} disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-100`}
                            >
                                {t('referees_entry_ocr')}
                            </button>
                        </div>

                        {/* Hidden file input */}
                        <input
                            ref={ocrInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                runOcrOnFile(f);
                            }}
                        />

                        {ocrBusy && (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="font-black text-slate-800">{t('referees_ocr_processing') || 'OCR in corso…'}</div>
                                <div className="text-sm text-slate-600 font-semibold mt-1">{t('referees_wait_image_processing') || "Attendi l'elaborazione dell'immagine."}</div>
                            </div>
                        )}

                        {entryMode === 'ocr' && !ocrBusy && (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="font-black text-slate-800">{t('referees_ocr_step_title') || 'OCR (R4)'}</div>
                                <div className="text-sm text-slate-600 font-semibold mt-2">
                                    {t('referees_upload_photo_desc') || 'Carica la foto: comparirà una finestra di conferma per correggere codice e testo OCR.'}
                                </div>
                                <button
                                    onClick={() => ocrInputRef.current?.click()}
                                    disabled={!foundMatch}
                                    className="mt-3 w-full rounded-2xl bg-white border border-slate-200 font-black py-3 hover:bg-slate-50 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-100"
                                >
                                    {t('referees_upload_photo')}
                                </button>
                            </div>
                        )}

                        {entryMode === 'manual' && foundMatch && (
                            <div className="mt-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-black text-slate-800">{t('referees_manual_title') || 'Inserimento manuale'}</div>
                                        <div className="text-[11px] text-slate-600 font-semibold mt-1">
                                            {t('referees_manual_entry_compact_desc') || 'Inserisci canestri (PT) e soffi (SF) per ogni giocatore. Lo score match è derivato.'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={clearOcrSupport}
                                        disabled={!supportImageUrl && !supportOcrText && !supportOcrData}
                                        className="rounded-2xl border border-slate-200 bg-white font-black px-3 py-2 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400"
                                        title={t('referees_clear_ocr_support') || 'Rimuovi supporto OCR'}
                                    >
                                        {t('referees_clear') || 'Pulisci'}
                                    </button>
                                </div>

                                {(supportOcrText || supportOcrData) && ocrQuickSuggestions && (
                                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs font-black text-slate-700">
                                            {t('referees_ocr_quick_suggestions') || 'Suggerimenti OCR (numeri) — opzionale'}
                                        </div>
                                        {!!ocrQuickSuggestions.issues.length && (
                                            <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3">
                                                <div className="text-[11px] font-black text-red-800">{t('referees_manual_verification_required') || 'Verifica manuale obbligatoria'}</div>
                                                <div className="mt-1 space-y-1">
                                                    {ocrQuickSuggestions.issues.map((issue, index) => (
                                                        <div key={`${issue}-${index}`} className="text-[11px] font-semibold text-red-700">
                                                            {issue}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {ocrQuickSuggestions.winnerTeamId && (
                                            <div className="mt-2 text-[11px] font-black text-slate-700">
                                                {t('referees_possible_winner_detected') || 'Possibile vincitore rilevato:'} {teamNameById.get(ocrQuickSuggestions.winnerTeamId) || ocrQuickSuggestions.winnerTeamId}
                                            </div>
                                        )}
                                        <div className="mt-2 space-y-1">
                                            {participantsForForm.map(tt => {
                                                const teamLabel = teamNameById.get(tt.id) || tt.name || tt.id;
                                                const players = [tt.player1, tt.player2].filter(Boolean) as string[];
                                                return (
                                                    <div key={tt.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                                                        <div className="text-[11px] font-black text-slate-800">{teamLabel}</div>
                                                        <div className="mt-1 space-y-1">
                                                            {players.map(p => {
                                                                const key = `${tt.id}||${p}`;
                                                                const sug = (ocrQuickSuggestions.byKey || {})[key];
                                                                if (!sug) return null;
                                                                return (
                                                                    <div key={key} className="flex items-start justify-between gap-3 text-[11px] font-semibold text-slate-700">
                                                                        <div className="min-w-0 flex-1 whitespace-normal break-words leading-tight">{p}</div>
                                                                        <div className="flex items-center gap-3 font-black text-slate-900">
                                                                            {sug.canestri !== undefined && <span>PT: {sug.canestri}</span>}
                                                                            {sug.soffi !== undefined && <span>SF: {sug.soffi}</span>}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={applyOcrSuggestions}
                                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white font-black px-4 py-2 hover:bg-slate-50 transition"
                                            title="Compila automaticamente PT/SF nei campi vuoti (o 0)"
                                        >
                                            Applica suggerimenti OCR
                                        </button>
                                        <div className="mt-2 text-[11px] text-slate-500 font-semibold">
                                            Nota: non sovrascrive valori già inseriti (diversi da 0).
                                        </div>
                                    </div>
                                )}

{/* Scoreboard */}
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="text-xs font-black text-slate-700">Score derivato</div>
                                    <div className="mt-2 space-y-1">
                                        {participantsForForm.map(tt => (
                                            <div key={tt.id} className="flex items-center justify-between">
                                                <div className="text-sm font-black text-slate-800">{teamNameById.get(tt.id) || tt.name || tt.id}</div>
                                                <div className="text-sm font-black text-slate-900">{derivedScoresByTeam[tt.id] ?? 0}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {tieNotAllowed && (
                                        <div className="mt-3 text-xs font-black text-amber-900">
                                            {t('alert_tie_not_allowed') || 'Pareggio non ammesso: inserisci uno spareggio nei canestri.'}
                                        </div>
                                    )}
                                </div>

                                {/* Manual form */}
                                <div className="mt-4 space-y-3">
                                    {participantsForForm.map(tt => {
                                        const teamLabel = teamNameById.get(tt.id) || tt.name || tt.id;
                                        const players = [tt.player1, tt.player2].filter(Boolean) as string[];
                                        return (
                                            <div key={tt.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-black text-slate-900">{teamLabel}</div>
                                                    {foundMatch.isTieBreak ? (
                                                        <div className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                                                            SPAREGGIO{participantsForForm.length >= 3 ? ' MULTI' : ''}{typeof foundMatch.targetScore === 'number' ? ` a ${foundMatch.targetScore}` : ''}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="mt-3 grid gap-2">
                                                    {players.map(p => {
                                                        const key = `${tt.id}||${p}`;
                                                        const f = reportStatsForm[key] || { canestri: '0', soffi: '0' };
                                                        return (
                                                            <div key={key} className="grid grid-cols-12 gap-2 items-center">
                                                                <div className="col-span-6 text-sm font-black text-slate-800">{p}</div>
                                                                <div className="col-span-3">
                                                                    <label className="text-[10px] font-black text-slate-500">PT</label>
                                                                    <input
                                                                        value={f.canestri}
                                                                        onChange={(e) => {
                                                                            const v = e.target.value;
                                                                            setReportStatsForm(prev => ({ ...prev, [key]: { ...prev[key], canestri: v, soffi: (prev[key]?.soffi ?? f.soffi) } }));
                                                                        }}
                                                                        inputMode="numeric"
                                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                                                        onFocus={handleZeroValueFocus}
                                                                        onMouseUp={handleZeroValueMouseUp}
                                                                        onBlur={handleZeroValueBlur}
                                                                    />
                                                                </div>
                                                                <div className="col-span-3">
                                                                    <label className="text-[10px] font-black text-slate-500">SF</label>
                                                                    <input
                                                                        value={f.soffi}
                                                                        onChange={(e) => {
                                                                            const v = e.target.value;
                                                                            setReportStatsForm(prev => ({ ...prev, [key]: { ...prev[key], soffi: v, canestri: (prev[key]?.canestri ?? f.canestri) } }));
                                                                        }}
                                                                        inputMode="numeric"
                                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-black outline-none focus:ring-2 focus:ring-slate-200"
                                                                        onFocus={handleZeroValueFocus}
                                                                        onMouseUp={handleZeroValueMouseUp}
                                                                        onBlur={handleZeroValueBlur}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* OCR support */}
                                {(supportImageUrl || supportOcrText || supportOcrData) && (
                                    <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="font-black text-slate-800">{t('referees_ocr_support') || 'Supporto OCR'}</div>
                                        <div className="text-[11px] text-slate-600 font-semibold mt-1">{t('referees_ocr_support_desc') || "Usa l'immagine e il testo OCR come riferimento mentre compili manualmente."}</div>
                                        {!!supportOcrData?.issues?.length && (
                                            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3">
                                                <div className="text-[11px] font-black text-red-800">Controllo manuale richiesto</div>
                                                <div className="mt-1 space-y-1">
                                                    {supportOcrData.issues.map((issue, index) => (
                                                        <div key={`${issue}-${index}`} className="text-[11px] font-semibold text-red-700">
                                                            {issue}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {supportImageUrl && (
                                            <img src={supportImageUrl} className="mt-3 w-full rounded-2xl border border-slate-200 object-contain max-h-[280px] bg-white" alt="referto" />
                                        )}
                                        {supportOcrText && (
                                            <textarea
                                                value={supportOcrText}
                                                onChange={(e) => setSupportOcrText(e.target.value)}
                                                rows={6}
                                                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-slate-200"
                                            />
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={() => { void saveReport(); }}
                                    disabled={saveBusy || !foundMatch}
                                    className={`mt-4 w-full rounded-2xl font-black py-3 transition ${saveBusy ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                                >
                                    {saveBusy ? (t('referees_save_busy') || 'Salvataggio…') : (t('referees_save_report') || 'Salva referto')}
                                </button>
                            </div>
                        )}

                        {!entryMode && (
                            <div className="mt-4 text-[11px] text-slate-500 font-semibold">
                                {t('referees_select_mode_to_continue') || 'Seleziona una modalità per procedere.'}
                            </div>
                        )}
                        </>
                        )}
                    </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RefereesArea;
