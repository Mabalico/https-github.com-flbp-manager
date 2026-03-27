import React from 'react';
import { Printer, Search, ShieldCheck, X, Eye, EyeOff } from 'lucide-react';
import type { AppState } from '../../../services/storageService';
import { getPlayerKey, isU25, resolvePlayerKey } from '../../../services/storageService';
import type { Match, Team } from '../../../types';
import { formatMatchTeamsLabel, getMatchParticipantIds } from '../../../services/matchUtils';
import { formatBirthDateDisplay, normalizeBirthDateInput } from '../../../services/playerIdentity';
import { useTranslation } from '../../../App';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../../../services/formInputUX';

export interface RefereesTabProps {
    state: AppState;
    refTables: number;
    setRefTables: (v: number) => void;
    getTeamName: (id?: string) => string;
    updateLiveRefereesPassword: (password: string) => { ok: boolean; message: string };
}

export const RefereesTab: React.FC<RefereesTabProps> = ({ state, refTables, setRefTables, getTeamName, updateLiveRefereesPassword }) => {
    const [query, setQuery] = React.useState('');
    const [passwordDraft, setPasswordDraft] = React.useState('');
    const [showPasswordDraft, setShowPasswordDraft] = React.useState(false);
    const [passwordOpen, setPasswordOpen] = React.useState(false);
    const [passwordError, setPasswordError] = React.useState<string | null>(null);
    const nTables = Math.max(1, Math.floor(refTables || 1));
    const { t } = useTranslation();


    // Lightweight Admin UI tokens (local to this tab): keeps buttons/inputs consistent
    // without introducing new dependencies or cross-tab refactors.
    const inputBase =
        'border border-slate-200 bg-white rounded-xl py-2.5 text-sm font-black placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const iconBtn =
        'inline-flex items-center justify-center rounded-xl p-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';
    const btnBase =
        'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black border border-slate-200 bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2';

    React.useEffect(() => {
        if (!passwordOpen) {
            setPasswordDraft('');
            setShowPasswordDraft(false);
            setPasswordError(null);
        }
    }, [passwordOpen]);

    const handlePasswordSave = () => {
        const result = updateLiveRefereesPassword(passwordDraft);
        if (!result.ok) {
            setPasswordError(result.message);
            return;
        }
        setPasswordOpen(false);
        setPasswordDraft('');
        setPasswordError(null);
        alert(result.message);
    };
    
    return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h3 className="text-xl font-black flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" /> {t('referees')}
                </h3>
                <div className="text-xs font-bold text-slate-500 mt-1">
                    {t('referees_tab_desc')}
                </div>
            </div>
    
            <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label={t('referees_actions_toolbar')}>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('referees_search_placeholder')}
                            aria-label={t('referees_search_aria')}
                            className={`w-full sm:w-72 max-w-full pl-9 pr-9 ${inputBase}`}
                        />
                        {query.trim() && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className={`${iconBtn} absolute right-2 top-1/2 -translate-y-1/2`}
                                aria-label={t('clear_search')}
                                title={t('clear_search')}
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {!passwordOpen ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setPasswordOpen(true);
                                    setPasswordError(null);
                                }}
                                disabled={!state.tournament}
                                className={`${btnBase} disabled:bg-slate-100 disabled:text-slate-400`}
                                title={!state.tournament ? t('alert_no_live_active') : t('referees_reset_password')}
                            >
                                {t('referees_password_button')}
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative">
                                    <input
                                        type={showPasswordDraft ? 'text' : 'password'}
                                        value={passwordDraft}
                                        onChange={(e) => {
                                            setPasswordDraft(e.target.value);
                                            setPasswordError(null);
                                        }}
                                        placeholder={t('referees_new_password_placeholder')}
                                        className={`w-52 px-3 pr-10 ${inputBase}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordDraft((v) => !v)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2 rounded-lg p-1"
                                        aria-label={showPasswordDraft ? t('hide_password') : t('show_password')}
                                        title={showPasswordDraft ? t('hide_password') : t('show_password')}
                                    >
                                        {showPasswordDraft ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handlePasswordSave}
                                    disabled={!state.tournament}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                                >
                                    {t('save_password')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPasswordOpen(false);
                                        setPasswordDraft('');
                                        setPasswordError(null);
                                    }}
                                    className={btnBase}
                                >
                                    {t('referees_add_cancel')}
                                </button>
                            </div>
                        )}
                    </div>
    
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                        <div className="text-xs font-black text-slate-700 whitespace-nowrap">{t('tables_label')}</div>
                        <input
                            type="number"
                            min={1}
                            value={refTables}
                            onChange={(e) => {
                                const v = Math.max(1, parseInt(e.target.value || '0', 10) || 1);
                                setRefTables(v);
                                try { localStorage.setItem('flbp_ref_tables', String(v)); } catch {}
                            }}
                            className={`w-20 px-2 ${inputBase}`}
                            aria-label={t('tables_aria')}
                            onFocus={handleZeroValueFocus}
                            onMouseUp={handleZeroValueMouseUp}
                            onBlur={handleZeroValueBlur}
                        />
                    </div>
                </div>
    
                <div className="text-xs font-bold text-slate-500">
                    {t('referees_round_block_prefix')} <b>{nTables}</b> {t('match_count_suffix')}
                </div>
                {passwordOpen && passwordError ? (
                    <div className="text-xs font-black text-red-600">{passwordError}</div>
                ) : null}
            </div>
        </div>
    
        {!state.tournament && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-600 font-bold">
                {t('admin_no_live_guidance')}. {t('structure')} → <b>{t('start_live')}</b>.
            </div>
        )}
    
        {state.tournament && (
            <>
                {(() => {
                    const catalog = (state.tournament?.teams && state.tournament.teams.length) ? (state.tournament.teams as Team[]) : ((state.teams || []) as Team[]);
                    const teamById = new Map(catalog.map(t => [t.id, t]));
    
                    type RefPerson = { id: string; name: string; birthDate?: string; teamId: string; teamName: string; slot: 'G1'|'G2' };
    
                    // Build referee list (player1IsReferee/player2IsReferee). Legacy fallback: team.isReferee => player1 referee.
                    const refsAll: RefPerson[] = [];
                    catalog.forEach(team => {
                        const p1Legacy = !!team.isReferee && !(team as any).player2IsReferee;
                        const p1Ref = !!(team as any).player1IsReferee || p1Legacy;
                        const p2Ref = !!(team as any).player2IsReferee;

                        if (p1Ref && team.player1) {
                            const birthDate = normalizeBirthDateInput((team as any).player1BirthDate);
                            const id = getPlayerKey(team.player1, birthDate || 'ND');
                            refsAll.push({ id, name: team.player1, birthDate, teamId: team.id, teamName: team.name, slot: 'G1' });
                        }
                        if (p2Ref && team.player2) {
                            const birthDate = normalizeBirthDateInput((team as any).player2BirthDate);
                            const id = getPlayerKey(team.player2, birthDate || 'ND');
                            refsAll.push({ id, name: team.player2, birthDate, teamId: team.id, teamName: team.name, slot: 'G2' });
                        }
                    });
    
                    const seen = new Set<string>();
                    const refs = refsAll.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
    
                    const q = query.trim().toLowerCase();
                    const refsFiltered = !q
                        ? refs
                        : refs.filter(r => {
                            const name = (r.name || '').toLowerCase();
                            const team = (r.teamName || '').toLowerCase();
                            const birthDate = (formatBirthDateDisplay(r.birthDate) || '').toLowerCase();
                            return name.includes(q) || team.includes(q) || birthDate.includes(q);
                        });
    
                    const isPlaceholder = (id?: string) => {
                        const up = String(id || '').trim().toUpperCase();
                        return !up || up === 'BYE' || up === 'TBD' || up.startsWith('TBD-');
                    };
    
    
                    const hasValidParticipants = (m: Match) => {
    
                        const ids = getMatchParticipantIds(m);
    
                        if (ids.length < 2) return false;
    
                        return ids.every(id => !isPlaceholder(id));
    
                    };
    
    
                    const msAll = [...(state.tournamentMatches || [])]
    
                        .filter(m => m.status !== 'finished')
    
                        .filter(m => !(m as any).hidden)
    
                        .filter(m => !(m as any).isBye)
    
                        .filter(m => hasValidParticipants(m))
    
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    
                    const blocks: Match[][] = [];
                    for (let i = 0; i < msAll.length; i += nTables) blocks.push(msAll.slice(i, i + nTables));
    
                    const playingIdxs = msAll
                        .map((m, i) => (m.status === 'playing' ? i : -1))
                        .filter(i => i >= 0) as number[];
    
                    const currentBlockIdx = playingIdxs.length ? Math.floor(Math.min(...playingIdxs) / nTables) : 0;
    
                    const currentMatches = blocks[currentBlockIdx] || [];
                    const nextMatches = blocks[currentBlockIdx + 1] || [];
    
                    const escapeHtml = (s: string) => (s || '')
                        .replace(/&/g,'&amp;')
                        .replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;')
                        .replace(/"/g,'&quot;')
                        .replace(/'/g,'&#39;');
    
                    const openPrintWindow = (title: string, bodyHtml: string) => {
                        // No popups: print via hidden iframe to avoid browser popup blockers.
                        // Keeps the exact same HTML/CSS used by the ref sheets.
                        try {
                            const iframe = document.createElement('iframe');
                            iframe.style.position = 'fixed';
                            iframe.style.right = '0';
                            iframe.style.bottom = '0';
                            iframe.style.width = '0';
                            iframe.style.height = '0';
                            iframe.style.border = '0';
                            iframe.style.opacity = '0';
                            iframe.style.pointerEvents = 'none';
                            iframe.setAttribute('aria-hidden', 'true');

                            // Print template: MUST match the official FLBP referto PDF exactly.
                            // We print a full-page image (A4) derived from the provided PDF template.
                            const fullHtml = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
                        <style>
                          @page{ size:A4; margin:0; }
                          html, body{ margin:0; padding:0; }
                          body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                          img{ max-width:none; }
                          .page{ position:relative; width:210mm; height:297mm; page-break-after:always; }
                          .page:last-child{ page-break-after:auto; }
                          .tpl{ width:210mm; height:297mm; display:block; position:absolute; left:0; top:0; z-index:0; }
                          .fill{ position:absolute; z-index:1; font-family: Arial, Helvetica, sans-serif; color:#111; }
                          /* Two anchoring modes:
                             - fillCenter: for fields inside tall boxes (team names) -> vertically centered
                             - fillBaseline: for fields that must sit on dashed guide lines (ID, players) -> baseline-ish */
                          .fillCenter{ transform:translateY(-50%); line-height:1; }
                          .fillBaseline{ transform:translateY(-78%); line-height:1; }
                        </style>
                        </head><body>${bodyHtml}</body></html>`;

                            const cleanup = () => {
                                try { iframe.remove(); } catch { /* noop */ }
                            };

                            iframe.onload = () => {
                                const win = iframe.contentWindow;
                                const doc = iframe.contentDocument;
                                if (!win || !doc) {
                                    cleanup();
                                    alert(t('print_not_supported_browser'));
                                    return;
                                }

                                const doPrint = () => {
                                    try {
                                        try { win.addEventListener('afterprint', cleanup, { once: true } as any); } catch { /* noop */ }
                                        win.focus();
                                        // Slight delay improves reliability (Chrome/Safari) when using srcdoc.
                                        setTimeout(() => {
                                            try { win.print(); } catch { cleanup(); }
                                        }, 50);
                                    } catch {
                                        cleanup();
                                        alert(t('print_not_supported_browser'));
                                    }
                                };

                                // Ensure the A4 template image is fully loaded before printing,
                                // otherwise browsers may print a blank page.
                                try {
                                    const imgs = Array.from(doc.images || []);
                                    if (!imgs.length) {
                                        doPrint();
                                        return;
                                    }

                                    const isReady = () => imgs.every(im => im.complete);
                                    if (isReady()) {
                                        doPrint();
                                        return;
                                    }

                                    let done = false;
                                    const finish = () => {
                                        if (done) return;
                                        done = true;
                                        doPrint();
                                    };

                                    let pending = imgs.length;
                                    const onOne = () => {
                                        pending -= 1;
                                        if (pending <= 0 || isReady()) finish();
                                    };

                                    imgs.forEach(im => {
                                        if (im.complete) {
                                            onOne();
                                        } else {
                                            try { im.addEventListener('load', onOne, { once: true } as any); } catch { /* noop */ }
                                            try { im.addEventListener('error', onOne, { once: true } as any); } catch { /* noop */ }
                                        }
                                    });

                                    // Hard fallback: don't block printing forever.
                                    setTimeout(finish, 3000);
                                } catch {
                                    doPrint();
                                }
                            };

                            iframe.srcdoc = fullHtml;
                            document.body.appendChild(iframe);
                        } catch {
                            alert(t('print_not_supported_browser'));
                        }
                    };
    
                    
                    const cleanText = (s?: string) => String(s || '').replace(/\s+/g, ' ').trim();

                    const fitScaleX = (raw: string, maxChars: number, minScale: number) => {
                        const t = cleanText(raw);
                        if (!t) return 1;
                        // Basic heuristic: keep single-line and shrink horizontally if needed.
                        // Avoids ellipsis while keeping the template layout untouched.
                        const len = Array.from(t).length;
                        if (len <= maxChars) return 1;
                        const s = maxChars / Math.max(1, len);
                        return Math.max(minScale, Math.min(1, s));
                    };

                    const spanFit = (raw: string, maxChars: number, minScale: number) => {
                        const t = cleanText(raw);
                        const safe = escapeHtml(t);
                        const sx = fitScaleX(t, maxChars, minScale);
                        const style = sx < 0.999
                            ? ` style="display:inline-block; transform:scaleX(${sx.toFixed(3)}); transform-origin:left center;"`
                            : '';
                        return `<span${style}>${safe}</span>`;
                    };

                    // Same as spanFit, but keeps the squeeze visually centered inside a centered field.
                    const spanFitCentered = (raw: string, maxChars: number, minScale: number) => {
                        const t = cleanText(raw);
                        const safe = escapeHtml(t);
                        const sx = fitScaleX(t, maxChars, minScale);
                        const style = sx < 0.999
                            ? ` style="display:inline-block; transform:scaleX(${sx.toFixed(3)}); transform-origin:center center;"`
                            : '';
                        return `<span${style}>${safe}</span>`;
                    };

                    const getTeamsForMatch = (m: Match) => {
                        const ids = getMatchParticipantIds(m);
                        const aId = ids[0];
                        const bId = ids[1];
                        return {
                            aId,
                            bId,
                            a: aId ? teamById.get(aId) : undefined,
                            b: bId ? teamById.get(bId) : undefined,
                        };
                    };
    
                    const renderSheet = (_m: Match, _turnoLabel: string) => {
                        // Printed referto template stays identical (same official A4 image),
                        // but we prefill the identity fields so referees only write the score by hand.
                        const { aId, bId, a, b } = getTeamsForMatch(_m);

                        const matchId = cleanText((_m.code || _m.id || '')).toUpperCase();

                        const teamAName = cleanText(a?.name || getTeamName(aId));
                        const teamBName = cleanText(b?.name || getTeamName(bId));

                        const aP1 = cleanText(a?.player1);
                        const aP2 = cleanText(a?.player2);
                        const bP1 = cleanText(b?.player1);
                        const bP2 = cleanText(b?.player2);

                        // Positions are expressed in mm on A4 (210×297). The template image is 1:1.
                        // Calibrated against public/referto_template_flbp_2025.png (v2025): values target the
                        // centerline of the dashed input guides / the vertical center of the long team field.
                        return `<div class="page">
                            <img class="tpl" src="/referto_template_flbp_2025.png" alt="" aria-hidden="true" />
                            <!-- Anchor each field to match the official template guides (mm units on A4). -->
                            <div class="fill fillBaseline" style="left:18mm; top:49.2mm; width:56mm; font-size:12pt; font-weight:800; white-space:nowrap;">${spanFit(matchId, 18, 0.85)}</div>

                            <!-- Team name fields: center within the long input rectangle (exclude the 'SQUADRA X:' label). -->
                            <div class="fill fillCenter" style="left:74.0mm; top:65.6mm; width:124.0mm; font-size:15pt; font-weight:900; text-align:center; white-space:nowrap;">${spanFitCentered(teamAName, 42, 0.72)}</div>
                            <div class="fill fillBaseline" style="left:12.0mm; top:89.0mm; width:62.0mm; font-size:13pt; font-weight:800; white-space:nowrap;">${spanFit(aP1, 28, 0.78)}</div>
                            <div class="fill fillBaseline" style="left:12.0mm; top:115.1mm; width:62.0mm; font-size:13pt; font-weight:800; white-space:nowrap;">${spanFit(aP2, 28, 0.78)}</div>

                            <div class="fill fillCenter" style="left:74.0mm; top:152.2mm; width:124.0mm; font-size:15pt; font-weight:900; text-align:center; white-space:nowrap;">${spanFitCentered(teamBName, 42, 0.72)}</div>
                            <div class="fill fillBaseline" style="left:12.0mm; top:175.6mm; width:62.0mm; font-size:13pt; font-weight:800; white-space:nowrap;">${spanFit(bP1, 28, 0.78)}</div>
                            <div class="fill fillBaseline" style="left:12.0mm; top:203.1mm; width:62.0mm; font-size:13pt; font-weight:800; white-space:nowrap;">${spanFit(bP2, 28, 0.78)}</div>
                        </div>`;
                    };
    
                    const printRefSheets = (title: string, ms: Match[], turnoNumber: number) => {
                        if (!ms.length) {
                            alert(t('no_matches_to_print_round'));
                            return;
                        }
                        const turnLabel = String(turnoNumber);
                        const body = ms.map(m => renderSheet(m, turnLabel)).join('');
                        openPrintWindow(title, body);
                    };
    
                    const playersIn = (ms: Match[]) => {
                        const s = new Set<string>();
                        ms.forEach(m => {
                            getMatchParticipantIds(m).forEach(id => {
                                if (!id) return;
                                const team = teamById.get(id);
                                if (!team) return;
                                const p1BirthDate = normalizeBirthDateInput((team as any).player1BirthDate);
                                const p1Id = resolvePlayerKey(state, getPlayerKey(team.player1, p1BirthDate || 'ND'));
                                s.add(p1Id);
                                if (team.player2) {
                                    const p2BirthDate = normalizeBirthDateInput((team as any).player2BirthDate);
                                    const p2Id = resolvePlayerKey(state, getPlayerKey(team.player2, p2BirthDate || 'ND'));
                                    s.add(p2Id);
                                }
                            });
                        });
                        return s;
                    };
    
                    const currentPlayers = playersIn(currentMatches);
                    const nextPlayers = playersIn(nextMatches);
    
                    const engagedNow = refsFiltered.filter(r => currentPlayers.has(r.id));
                    const engagedNext = refsFiltered.filter(r => !currentPlayers.has(r.id) && nextPlayers.has(r.id));
                    const freeNow = refsFiltered.filter(r => !currentPlayers.has(r.id) && !nextPlayers.has(r.id));

                    const fmtRef = (r: RefPerson) => {
                        const birthDateLabel = formatBirthDateDisplay(r.birthDate) || 'ND';
                        return (
                            <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-black leading-tight text-slate-900 whitespace-normal break-words">{r.name}</span>
                                        <span className="text-xs font-black text-slate-500">({birthDateLabel})</span>
                                        {isU25(r.birthDate) && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black border border-amber-200 bg-amber-50 text-amber-800">U25</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black border border-slate-200 bg-slate-50 text-slate-700">{r.slot}</span>
                                    </div>
                                    <div className="text-xs font-bold leading-tight text-slate-500 whitespace-normal break-words">{r.teamName}</div>
                                </div>
                            </div>
                        );
                    };
    
                    const renderBox = (title: string, tone: 'emerald'|'rose'|'slate', list: RefPerson[], emptyText: string) => {
                        const toneClasses =
                            tone === 'emerald'
                                ? 'border-emerald-200 bg-emerald-50'
                                : tone === 'rose'
                                    ? 'border-rose-200 bg-rose-50'
                                    : 'border-slate-200 bg-slate-50';
    
                        return (
                            <div className={`border rounded-xl p-4 ${toneClasses}`}>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="font-black text-slate-900">{title}</div>
                                    <div className="text-xs font-black text-slate-700">{list.length}</div>
                                </div>
                                {list.length === 0 ? (
                                    <div className="text-sm font-bold text-slate-600">{emptyText}</div>
                                ) : (
                                    <div className="divide-y divide-slate-200">
                                        {list.map(fmtRef)}
                                    </div>
                                )}
                            </div>
                        );
                    };
    
                    const fmtMatch = (m: Match) => formatMatchTeamsLabel(m, (id) => getTeamName(id));
    
                    return (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="font-black text-slate-900">{t('current_round')}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-bold text-slate-500">{currentMatches.length}/{nTables}</div>
                                            <button type="button"
                                                onClick={() => printRefSheets('Referti - Turno corrente', currentMatches, currentBlockIdx + 1)}
                                                className={btnBase}
                                                title={t('print_scoresheets_current_round')}
                                                aria-label={t('print_scoresheets_current_round')}
                                            >
                                                <Printer className="w-4 h-4" /> <span className="hidden sm:inline">{t('print')}</span>
                                            </button>
                                        </div>
                                    </div>
                                    {currentMatches.length === 0 ? (
                                        <div className="text-sm font-bold text-slate-600">{t('no_matches_queued')}</div>
                                    ) : (
                                        <div className="space-y-1 text-xs font-bold text-slate-700">
                                            {currentMatches.map(m => (<div key={m.id} className="leading-tight whitespace-normal break-words">{fmtMatch(m)}</div>))}
                                        </div>
                                    )}
                                </div>
                                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="font-black text-slate-900">{t('next_round')}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-bold text-slate-500">{nextMatches.length}/{nTables}</div>
                                            <button type="button"
                                                onClick={() => printRefSheets('Referti - Prossimo turno', nextMatches, currentBlockIdx + 2)}
                                                className={btnBase}
                                                title={t('print_scoresheets_next_round')}
                                                aria-label={t('print_scoresheets_next_round')}
                                            >
                                                <Printer className="w-4 h-4" /> <span className="hidden sm:inline">{t('print')}</span>
                                            </button>
                                        </div>
                                    </div>
                                    {nextMatches.length === 0 ? (
                                        <div className="text-sm font-bold text-slate-600">{t('no_next_round_matches')}</div>
                                    ) : (
                                        <div className="space-y-1 text-xs font-bold text-slate-700">
                                            {nextMatches.map(m => (<div key={m.id} className="leading-tight whitespace-normal break-words">{fmtMatch(m)}</div>))}
                                        </div>
                                    )}
                                </div>
                            </div>
    
                            {refs.length === 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 font-bold">
                                    {t('no_referees_found_assign')} <b>{t('teams')}</b>.
                                </div>
                            )}
    
                            {refs.length > 0 && query.trim() ? (
                                <div className="text-xs font-bold text-slate-500">
                                    {t('search_results')}: <b>{refsFiltered.length}</b>/{refs.length}
                                </div>
                            ) : null}
    
                            {refs.length > 0 && refsFiltered.length === 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 font-bold flex items-center justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">{t('no_referee_matches_search')} <b>“{query.trim()}”</b>.</div>
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-black border border-slate-200 bg-white hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500"
                                    >
                                        <X className="w-4 h-4" /> {t('clear_search')}
                                    </button>
                                </div>
                            )}
    
                            {refsFiltered.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {renderBox(t('referees_busy_now'), 'rose', engagedNow, t('none_short'))}
                                    {renderBox(t('referees_free_now'), 'emerald', freeNow, t('none_free'))}
                                    {renderBox(t('referees_busy_next_round'), 'slate', engagedNext, t('none_short'))}
                                </div>
                            )}
    
                            <div className="text-xs font-bold text-slate-500">
                                {t('referees_rounds_note_prefix')} <b>{nTables}</b> {t('referees_rounds_note_suffix')}
                            </div>
                        </div>
                    );
                })()}
            </>
        )}
    </div>
    );
    };
