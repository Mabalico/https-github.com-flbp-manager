import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../App';
import { Match, Team, TournamentData, TournamentMatch } from '../types';
import { Edit2, Save, X, Trophy, Lock } from 'lucide-react';
import { isByeTeamId, isTbdTeamId } from '../services/matchUtils';
import { handleZeroValueBlur, handleZeroValueFocus, handleZeroValueMouseUp } from '../services/formInputUX';

interface TournamentBracketProps {
    teams: Team[];
    matches: Match[];
    data?: TournamentData;
    readOnly?: boolean;
    onUpdate?: (match: Match) => void;
    tvMode?: boolean;
    /** Scale to fit container width (Public): avoids horizontal scroll. */
    fitToWidth?: boolean;
        /** Scale to fit container width AND height (TV): avoids any cropping/scroll. Default false. */
    fitToBox?: boolean;
/** Optional UI scale factor (e.g. Monitor zoom). Default 1. */
    scale?: number;
    /** Optional: override click behavior for a match (e.g. open referto instead of score modal). */
    onMatchClick?: (match: Match) => void;
    /** If true, team names wrap instead of being truncated with ellipsis. */
    wrapTeamNames?: boolean;

    /** Admin/Monitor: show "slot libero" placeholders for BYE in Round 1 (instead of hiding). Default false. */
    showByeSlots?: boolean;
    /** Admin/Monitor: enable participant row selection (click on Team A/Team B rows). Default false. */
    participantSelectionMode?: boolean;
    /** Called when a participant row is clicked (useful for manual bracket edits). */
    onParticipantClick?: (args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => void;
    /** Optional: highlight selected participant slots (format: `${matchId}|A` / `${matchId}|B`). */
    highlightedSlotKeys?: string[];
    /** Optional: mark invalid participant slots (duplicates / empty) in red during admin edits. */
    invalidSlotKeys?: string[];
    /** Optional: mark slots changed in draft/editor mode. */
    changedSlotKeys?: string[];
    /** Optional: mark slots locked by played/in-progress matches. */
    lockedSlotKeys?: string[];
    /** Admin editor: allow visible Round 1 BYE slots to act as insertion targets. */
    interactiveByeSlots?: boolean;
    /** Admin/Monitor: current slot being dragged in manual edit mode. */
    draggingSlotKey?: string;
    /** Admin/Monitor: current drop target slot in manual edit mode. */
    dropTargetSlotKey?: string;

    /** Admin/Monitor: render an inline select dropdown for a specific participant slot (format `${matchId}|A` / `${matchId}|B`). */
    inlineEditSlotKey?: string;
    /** Value for the inline select (typically teamId/BYE/TBD). */
    inlineEditValue?: string;
    /** Options for the inline select (first option can be "Svuota slot"). */
    inlineEditOptions?: Array<{ value: string; label: string; disabled?: boolean }>;
    /** Called when the inline select value changes. */
    onInlineEditChange?: (value: string) => void;
    /** Drag start for a participant slot. */
    onParticipantDragStart?: (args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => void;
    /** Drag enter/over for a participant slot. */
    onParticipantDragEnter?: (args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => void;
    /** Drop on a participant slot. */
    onParticipantDrop?: (args: { matchId: string; side: 'A' | 'B'; teamId?: string; match: Match }) => void;
    /** Drag end/leave cleanup. */
    onParticipantDragEnd?: () => void;
    /** Admin/Monitor: show left-to-right connectors between rounds. Default false. */
    showConnectors?: boolean;
}

export const TournamentBracket: React.FC<TournamentBracketProps> = ({ teams, matches, data, readOnly = false, onUpdate, tvMode = false, fitToWidth = false, fitToBox = false, scale = 1, onMatchClick, wrapTeamNames = false, showByeSlots = false, participantSelectionMode = false, onParticipantClick, highlightedSlotKeys = [], invalidSlotKeys = [], changedSlotKeys = [], lockedSlotKeys = [], interactiveByeSlots = false, draggingSlotKey, dropTargetSlotKey, inlineEditSlotKey, inlineEditValue, inlineEditOptions, onInlineEditChange, onParticipantDragStart, onParticipantDragEnter, onParticipantDrop, onParticipantDragEnd, showConnectors = false }) => {
    const { t } = useTranslation();
    const [editingMatch, setEditingMatch] = useState<Match | null>(null);
    const [scoreA, setScoreA] = useState(0);
    const [scoreB, setScoreB] = useState(0);


    const containerRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const matchCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [fitScale, setFitScale] = useState(1);
    const [scaledBox, setScaledBox] = useState<{ w: number; h: number } | null>(null);
    const [connectorSize, setConnectorSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const userScale = (typeof scale === 'number' && isFinite(scale) && scale > 0) ? scale : 1;
    const renderCompleteStructure = showConnectors && readOnly && !tvMode;
    const spectatorLayout = renderCompleteStructure;
    const editorStructuredLayout = spectatorLayout && participantSelectionMode;
    const compactPublicFit = spectatorLayout && fitToWidth;
    const minStructuredFitScale = compactPublicFit ? 0.72 : 0;
    const finalScale = ((fitToWidth || fitToBox) ? fitScale : 1) * userScale;

    const padClass = tvMode ? 'p-3' : 'p-4';
    const containerSizeClass = fitToBox ? 'w-full h-full' : 'w-full';

    useLayoutEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;

        const measure = () => {
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            const iw = (content as HTMLElement).scrollWidth;
            const ih = (content as HTMLElement).scrollHeight;
            if (!iw || !ih) return;

            let autoFit = 1;
            if ((fitToWidth || fitToBox) && cw) {
                const sW = cw / iw;
                const sH = (fitToBox && ch) ? (ch / ih) : 1;
                autoFit = Math.min(1, sW, sH);
                if (minStructuredFitScale > 0) {
                    autoFit = Math.min(1, Math.max(autoFit, minStructuredFitScale));
                }
            }
            setFitScale(autoFit);

            const nextFinal = autoFit * userScale;
            setScaledBox({ w: iw * nextFinal, h: ih * nextFinal });
        };

        measure();
        const ro = new ResizeObserver(() => measure());
        ro.observe(container);
        ro.observe(content);
        return () => ro.disconnect();
    }, [fitToWidth, fitToBox, userScale, matches.length, data?.rounds?.length, minStructuredFitScale]);

    useLayoutEffect(() => {
        if (!showConnectors || tvMode) {
            setConnectorSize({ width: 0, height: 0 });
            return;
        }

        const content = contentRef.current;
        if (!content) return;

        const measure = () => {
            setConnectorSize({
                width: content.scrollWidth || content.clientWidth || 0,
                height: content.scrollHeight || content.clientHeight || 0,
            });
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(content);
        return () => ro.disconnect();
    }, [showConnectors, tvMode, matches, showByeSlots]);

    const rounds: Match[][] = [];
    if (data?.rounds) {
        data.rounds.forEach(r => rounds.push(r));
    } else if (matches && matches.length > 0) {
        const baseBracketMatches = matches.filter(m => m.phase === 'bracket');
        const bracketMatches = showByeSlots
            ? baseBracketMatches.filter(m => !(isByeTeamId(m.teamAId) && isByeTeamId(m.teamBId)))
            : baseBracketMatches;
        const map = new Map<number, Match[]>();
        bracketMatches.forEach(m => {
            const r = m.round || 1;
            if (!map.has(r)) map.set(r, []);
            map.get(r)!.push(m);
        });
        const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
        sortedKeys.forEach(k => {
            rounds.push(map.get(k)!.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));
        });
    }

    const getMatch = (id: string) => matches.find(m => m.id === id);

    const findMatchPosition = (matchId: string): { rIdx: number; mIdx: number } | null => {
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
            if (isTbdTeamId(m.teamBId)) return undefined;
            return m.teamBId;
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE') {
            if (isTbdTeamId(m.teamAId)) return undefined;
            return m.teamAId;
        }
        if (m.status !== 'finished') return undefined;
        if (m.scoreA > m.scoreB) {
            if (isTbdTeamId(m.teamAId)) return undefined;
            return m.teamAId;
        }
        if (m.scoreB > m.scoreA) {
            if (isTbdTeamId(m.teamBId)) return undefined;
            return m.teamBId;
        }
        return undefined;
    };

    const applyByeAutoWin = (m: Match): Match => {
        if (!m) return m;
        if (m.status === 'finished') return m;
        if (m.teamAId === 'BYE' && m.teamBId && m.teamBId !== 'BYE' && !isTbdTeamId(m.teamBId)) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamBId === 'BYE' && m.teamAId && m.teamAId !== 'BYE' && !isTbdTeamId(m.teamAId)) {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        if (m.teamAId === 'BYE' && m.teamBId === 'BYE') {
            return { ...m, played: true, status: 'finished', scoreA: 0, scoreB: 0, hidden: true, isBye: true };
        }
        return m;
    };

    const tryPropagateWinner = (rIdx: number, mIdx: number, finishedMatch: Match) => {
        if (!onUpdate) return;
        const winner = resolveWinnerTeamId(finishedMatch);
        if (!winner || winner === 'BYE') return;

        const nextRound = rounds[rIdx + 1];
        if (!nextRound || nextRound.length === 0) return;
        const nextMatchSkeleton = nextRound[Math.floor(mIdx / 2)];
        if (!nextMatchSkeleton) return;

        const nextMatch = (getMatch(nextMatchSkeleton.id) || nextMatchSkeleton);
        const slot: 'teamAId' | 'teamBId' = (mIdx % 2 === 0) ? 'teamAId' : 'teamBId';
        if ((nextMatch as any)[slot]) return;

        let nextUpdated: Match = { ...nextMatch, [slot]: winner } as any;
        const beforeStatus = nextUpdated.status;
        nextUpdated = applyByeAutoWin(nextUpdated);
        onUpdate(nextUpdated);

        // If it auto-finished due to a BYE, propagate further.
        if (beforeStatus !== 'finished' && nextUpdated.status === 'finished') {
            tryPropagateWinner(rIdx + 1, Math.floor(mIdx / 2), nextUpdated);
        }
    };

    const getWinnerTeamId = (m: Match) => resolveWinnerTeamId(m);

    const isStructuralByeMatch = (m: Match, roundIndex: number) => {
        const allowByeSlotsThisRound = showByeSlots && roundIndex === 0;
        if (allowByeSlotsThisRound) return false;

        const rawA = (m.teamAId || '').trim();
        const rawB = (m.teamBId || '').trim();
        return !!m.isBye || isByeTeamId(rawA) || isByeTeamId(rawB);
    };

    const isHiddenSkeletonMatch = (m: Match, roundIndex: number) => {
        if (isStructuralByeMatch(m, roundIndex)) return false;
        return !!((m as any).hidden || m.hidden);
    };

    const shouldHideStructuralMatch = (m: Match, roundIndex: number) => {
        if (isStructuralByeMatch(m, roundIndex)) return true;
        return !renderCompleteStructure && isHiddenSkeletonMatch(m, roundIndex);
    };

    const connectorPaths = (() => {
        if (!showConnectors || tvMode || !contentRef.current || connectorSize.width <= 0 || connectorSize.height <= 0) return [] as string[];

        const paths: string[] = [];

        const getCardBox = (matchId: string) => {
            const el = matchCardRefs.current[matchId];
            if (!el) return null;
            let left = 0;
            let top = 0;
            let node: HTMLElement | null = el;
            const contentNode = contentRef.current;

            while (node && node !== contentNode) {
                left += node.offsetLeft;
                top += node.offsetTop;
                node = node.offsetParent as HTMLElement | null;
            }

            const width = el.offsetWidth;
            const height = el.offsetHeight;
            return {
                left,
                right: left + width,
                top,
                centerY: top + height / 2,
            };
        };

        for (let rIdx = 1; rIdx < rounds.length; rIdx += 1) {
            const round = rounds[rIdx] || [];
            const prevRound = rounds[rIdx - 1] || [];
            round.forEach((m, mIdx) => {
                if (shouldHideStructuralMatch(m, rIdx)) return;
                const target = getCardBox(m.id);
                if (!target) return;

                const sourceMatches = [prevRound[mIdx * 2], prevRound[mIdx * 2 + 1]].filter(Boolean) as Match[];
                sourceMatches.forEach((src) => {
                    if (shouldHideStructuralMatch(src, rIdx - 1)) return;
                    const source = getCardBox(src.id);
                    if (!source) return;
                    if (source.right >= target.left) return;

                    const midX = source.right + Math.max(spectatorLayout ? 24 : 18, (target.left - source.right) / 2);
                    paths.push(`M ${source.right} ${source.centerY} H ${midX} V ${target.centerY} H ${target.left}`);
                });
            });
        }

        return paths;
    })();

    const handleMatchClick = (m: TournamentMatch) => {
        const fullMatch = getMatch(m.id) || m;
        // Guardrail: BYE matches never open referto/score.
        if (isByeTeamId(fullMatch.teamAId) || isByeTeamId(fullMatch.teamBId) || fullMatch.isBye) return;
        if (readOnly && !fullMatch.played) return;
        if (readOnly) return;

        if (onMatchClick) {
            onMatchClick(fullMatch);
            return;
        }

        setEditingMatch(fullMatch);
        setScoreA(fullMatch.scoreA || 0);
        setScoreB(fullMatch.scoreB || 0);
    };

    const teamWidthClass = tvMode
        ? 'max-w-[140px]'
        : editorStructuredLayout
            ? 'max-w-[136px] sm:max-w-[146px] lg:max-w-[158px] xl:max-w-[168px]'
            : (spectatorLayout ? 'max-w-[136px] sm:max-w-[160px] lg:max-w-[182px]' : 'max-w-[170px]');

    const teamTextClass = editorStructuredLayout
        ? 'text-[12px] sm:text-[13px] font-semibold leading-[1.25]'
        : spectatorLayout
            ? 'text-[13px] sm:text-sm font-black leading-tight'
            : 'text-sm font-medium';

    const teamNameClass = wrapTeamNames
        ? `${teamTextClass} ${teamWidthClass} whitespace-normal break-words`
        : `truncate ${teamTextClass} ${teamWidthClass}`;


    const formatTeamLabel = (teamId?: string, team?: Team, allowByeSlotLabel: boolean = false) => {
        const id = (teamId || '').trim();
        if (!id) return t('tbd_label');
        if (isByeTeamId(id)) return allowByeSlotLabel ? t('bracket_open_slot') : '';
        if (isTbdTeamId(id)) return t('tbd_label');
        return team?.name || id;
    };


    const handleSaveScore = () => {
        if (!editingMatch || !onUpdate) return;

        // Pareggio vietato: ci deve essere un vincitore unico (no BYE/TBD).
        const aId = editingMatch.teamAId;
        const bId = editingMatch.teamBId;
        const hasTwoRealTeams = !!aId && !!bId && !isByeTeamId(aId) && !isByeTeamId(bId) && !isTbdTeamId(aId) && !isTbdTeamId(bId);
        if (hasTwoRealTeams && scoreA === scoreB) {
            alert(t('bracket_tie_not_allowed_alert'));
            return;
        }

        const updated = { 
            ...editingMatch, 
            scoreA, 
            scoreB, 
            played: true, 
            status: 'finished' as const 
        };
        onUpdate(updated);
        const pos = findMatchPosition(updated.id);
        if (pos) {
            tryPropagateWinner(pos.rIdx, pos.mIdx, updated);
        }
        setEditingMatch(null);
    };

    if (!rounds || rounds.length === 0) return <div className="p-4 text-center text-slate-500">{t('bracket_no_bracket_available')}</div>;

    const monitorStructuredLayout = showConnectors && !tvMode;
    const baseMatchHeight = tvMode ? 78 : (editorStructuredLayout ? 108 : (spectatorLayout ? 120 : 128));
    const baseGapPx = tvMode ? 20 : (editorStructuredLayout ? 16 : (spectatorLayout ? 20 : 24));
    const baseUnitPx = baseMatchHeight + baseGapPx;
    const firstRoundCount = rounds[0]?.length || 0;
    const structuredColumnHeight = firstRoundCount > 0
        ? (firstRoundCount * baseMatchHeight) + (Math.max(0, firstRoundCount - 1) * baseGapPx)
        : 0;

    const getStructuredTop = (roundIndex: number, matchIndex: number) => {
        const step = Math.pow(2, roundIndex);
        const center = ((step - 1) / 2) * baseUnitPx + matchIndex * step * baseUnitPx + (baseMatchHeight / 2);
        return Math.round(center - (baseMatchHeight / 2));
    };

    // TV: make the bracket denser as rounds grow, to avoid over-shrinking (fitToBox).
    // Keep it conservative to preserve legibility.
    const tvMinWClass = tvMode
        ? (rounds.length >= 8
            ? 'min-w-[160px]'
            : (rounds.length >= 7
                ? 'min-w-[170px]'
                : (rounds.length >= 6
                    ? 'min-w-[180px]'
                    : (rounds.length >= 5
                        ? 'min-w-[200px]'
                        : 'min-w-[220px]'))))
        : 'min-w-[280px]';

    const nonTvColumnWidthClass = monitorStructuredLayout
        ? (editorStructuredLayout
            ? 'w-[204px] sm:w-[214px] lg:w-[226px] xl:w-[238px] flex-none'
            : spectatorLayout ? 'w-[220px] sm:w-[236px] lg:w-[252px] xl:w-[268px] flex-none' : 'w-[280px] flex-none')
        : 'min-w-[280px]';

    const tvRoundsGapClass = tvMode
        ? (rounds.length >= 7 ? 'gap-4' : (rounds.length >= 5 ? 'gap-6' : 'gap-8'))
        : (editorStructuredLayout ? 'gap-4 sm:gap-5 lg:gap-6 xl:gap-7' : (spectatorLayout ? 'gap-6 sm:gap-8 lg:gap-10 xl:gap-12' : 'gap-8'));

    const tvMatchesGapClass = tvMode
        ? (rounds.length >= 7 ? 'gap-3' : (rounds.length >= 5 ? 'gap-4' : 'gap-5'))
        : 'gap-4';

    const tvMatchMinHClass = tvMode
        ? (rounds.length >= 7 ? 'min-h-[66px]' : (rounds.length >= 5 ? 'min-h-[72px]' : 'min-h-[78px]'))
        : 'min-h-[80px]';

    const connectorGlowColor = editorStructuredLayout
        ? 'rgba(148, 163, 184, 0.12)'
        : spectatorLayout ? 'rgba(180, 83, 9, 0.28)' : 'rgba(180, 83, 9, 0.16)';
    const connectorGlowWidth = editorStructuredLayout ? '5.2' : (spectatorLayout ? '10' : '6');
    const connectorLineColor = editorStructuredLayout
        ? 'rgba(148, 163, 184, 0.76)'
        : spectatorLayout ? 'rgba(146, 64, 14, 0.94)' : 'rgba(180, 83, 9, 0.48)';
    const connectorLineWidth = editorStructuredLayout ? '2.3' : (spectatorLayout ? '4.8' : '2.6');
    const containerOverflowClass = (fitToWidth || fitToBox)
        ? ((compactPublicFit && !fitToBox) ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden')
        : (spectatorLayout ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain' : 'overflow-x-auto');
    const containerPadClass = editorStructuredLayout
        ? 'px-3 py-4 sm:px-4 sm:py-5'
        : spectatorLayout ? 'px-5 py-6 sm:px-6 sm:py-7' : padClass;

    return (
        <div ref={containerRef} className={`${containerPadClass} ${containerSizeClass} ${containerOverflowClass}`}>
            <div style={scaledBox ? { width: `${scaledBox.w}px`, height: `${scaledBox.h}px` } : undefined}>
                <div
                    ref={contentRef}
                    className={`relative flex ${tvRoundsGapClass} ${tvMode ? 'scale-100' : ''} ${spectatorLayout ? 'mx-auto' : ''}`}
                    style={((fitToWidth || fitToBox) || userScale !== 1) ? { transform: `scale(${finalScale})`, transformOrigin: 'top left', width: 'max-content' } : { width: 'max-content' }}
                >
            {showConnectors && !tvMode && connectorPaths.length > 0 && (
                <svg
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    width={connectorSize.width}
                    height={connectorSize.height}
                    viewBox={`0 0 ${connectorSize.width} ${connectorSize.height}`}
                    aria-hidden="true"
                >
                    {connectorPaths.map((d, idx) => (
                        <g key={`${idx}-${d}`}>
                            <path
                                d={d}
                                stroke={connectorGlowColor}
                                strokeWidth={connectorGlowWidth}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={d}
                                stroke={connectorLineColor}
                                strokeWidth={connectorLineWidth}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </g>
                    ))}
                </svg>
            )}
            {rounds.map((round, rIdx) => (
                <div
                    key={rIdx}
                    className={`${monitorStructuredLayout ? 'relative' : `flex flex-col justify-around ${tvMatchesGapClass}`} ${tvMode ? `${tvMinWClass} relative` : nonTvColumnWidthClass}`}
                    style={monitorStructuredLayout ? { minHeight: `${structuredColumnHeight}px`, height: `${structuredColumnHeight}px` } : undefined}
                >
                    {spectatorLayout ? (
                        <div className="mb-4 flex justify-center">
                            <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                                    rIdx === rounds.length - 1
                                        ? 'border-amber-300/45 bg-amber-300/16 text-amber-100 shadow-[0_10px_30px_-18px_rgba(251,191,36,0.85)]'
                                        : 'border-white/12 bg-white/6 text-white/70'
                                }`}
                            >
                                {rIdx === rounds.length - 1 ? t('bracket_final_label') : `${t('round')} ${rIdx + 1}`}
                            </span>
                        </div>
                    ) : (
                        <div className="text-center font-black uppercase text-slate-400 mb-2 text-xs">
                            {rIdx === rounds.length - 1 ? t('bracket_final_upper') : `${t('round')} ${rIdx + 1}`}
                        </div>
                    )}
                    {tvMode && rIdx < rounds.length - 1 && (
                        <div className="pointer-events-none absolute right-0 top-8 bottom-2 w-px bg-beer-500/25" />
                    )}
                    {round.map((m, mIdx) => {
                         const match = getMatch(m.id) || m;

                         const allowByeSlotsThisRound = showByeSlots && rIdx === 0;
                         const rawA = (match.teamAId || '').trim();
                         const rawB = (match.teamBId || '').trim();
                         const matchHasByeSlot = !!match.isBye || isByeTeamId(rawA) || isByeTeamId(rawB);
                         const isByeSlotMatchDisplay = allowByeSlotsThisRound && matchHasByeSlot;
                         const preserveEmptySlot = shouldHideStructuralMatch(match, rIdx);

                         const slotKeyA = `${match.id}|A`;
                         const slotKeyB = `${match.id}|B`;
                         const selectable = !!participantSelectionMode && !!onParticipantClick;
                         const selIndexA = (highlightedSlotKeys || []).indexOf(slotKeyA);
                         const selIndexB = (highlightedSlotKeys || []).indexOf(slotKeyB);
                         const invalidA = (invalidSlotKeys || []).includes(slotKeyA);
                         const invalidB = (invalidSlotKeys || []).includes(slotKeyB);
                         const changedA = (changedSlotKeys || []).includes(slotKeyA);
                         const changedB = (changedSlotKeys || []).includes(slotKeyB);
                         const lockedA = (lockedSlotKeys || []).includes(slotKeyA);
                         const lockedB = (lockedSlotKeys || []).includes(slotKeyB);
                         const draggingA = draggingSlotKey === slotKeyA;
                         const draggingB = draggingSlotKey === slotKeyB;
                         const dropA = dropTargetSlotKey === slotKeyA;
                         const dropB = dropTargetSlotKey === slotKeyB;
                         const isSelectedA = selIndexA >= 0;
                         const isSelectedB = selIndexB >= 0;

                         const selectedRingA = selIndexA === 0
                             ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50/80'
                             : (selIndexA === 1 ? 'ring-2 ring-violet-500 border-violet-300 bg-violet-50/80' : (isSelectedA ? 'ring-2 ring-slate-400 border-slate-300' : ''));

                         const selectedRingB = selIndexB === 0
                             ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50/80'
                             : (selIndexB === 1 ? 'ring-2 ring-violet-500 border-violet-300 bg-violet-50/80' : (isSelectedB ? 'ring-2 ring-slate-400 border-slate-300' : ''));
                         const isSlotLibreA = allowByeSlotsThisRound && isByeTeamId(match.teamAId);
                         const isSlotLibreB = allowByeSlotsThisRound && isByeTeamId(match.teamBId);
                         const selectableSlotA = selectable && !preserveEmptySlot && (!isSlotLibreA || interactiveByeSlots);
                         const selectableSlotB = selectable && !preserveEmptySlot && (!isSlotLibreB || interactiveByeSlots);

                         let teamAId = match.teamAId;
                         let teamBId = match.teamBId;
                         
                         if (rIdx > 0) {
                             const prev = rounds[rIdx - 1] || [];
                             const srcA = prev[mIdx * 2] ? (getMatch(prev[mIdx * 2].id) || prev[mIdx * 2]) : undefined;
                             const srcB = prev[mIdx * 2 + 1] ? (getMatch(prev[mIdx * 2 + 1].id) || prev[mIdx * 2 + 1]) : undefined;
                             if (!teamAId && srcA) teamAId = getWinnerTeamId(srcA);
                             if (!teamBId && srcB) teamBId = getWinnerTeamId(srcB);
                         }

                         const t1 = teams.find(t => t.id === teamAId);
                         const t2 = teams.find(t => t.id === teamBId);
                         
                         const isWinnerA = match.status === 'finished' && match.scoreA > match.scoreB;
                         const isWinnerB = match.status === 'finished' && match.scoreB > match.scoreA;

                         const isFinalRound = rIdx === rounds.length - 1;
                         const outerCardBaseClass = tvMode
                             ? 'z-10 bg-transparent p-1'
                             : editorStructuredLayout
                                 ? 'bg-[var(--editor-bg-surface-muted,#f8fafc)] border rounded-[18px] p-2.5 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.2)]'
                             : spectatorLayout
                                 ? 'bg-slate-950/78 border rounded-[20px] p-2.5 shadow-[0_20px_55px_-32px_rgba(15,23,42,0.95)] backdrop-blur-sm'
                                 : 'bg-white border rounded-lg p-2 shadow-sm';
                         const outerCardToneClass = (!isByeSlotMatchDisplay && !preserveEmptySlot && match.status === 'playing')
                             ? (tvMode
                                 ? 'ring-2 ring-beer-200 rounded-2xl'
                                 : editorStructuredLayout
                                     ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-[0_18px_36px_-28px_rgba(16,185,129,0.25)]'
                                 : spectatorLayout
                                     ? 'border-amber-300/80 ring-2 ring-amber-200/55 shadow-[0_18px_40px_-24px_rgba(251,191,36,0.7)]'
                                     : 'border-2 border-amber-600 ring-2 ring-amber-200')
                             : (tvMode
                                 ? ''
                                 : editorStructuredLayout
                                     ? 'border-slate-200'
                                 : spectatorLayout
                                     ? 'border-amber-200/35'
                                     : 'border-2 border-amber-600/80');
                         const byeCardClass = isByeSlotMatchDisplay
                             ? (tvMode
                                 ? 'opacity-50'
                                 : editorStructuredLayout
                                     ? 'border border-dashed border-slate-300 bg-slate-50/90'
                                 : spectatorLayout
                                     ? 'border-2 border-dashed border-amber-200/35 bg-slate-900/45'
                                     : 'border-2 border-dashed border-amber-600/70 bg-slate-50')
                             : '';
                         const rowBaseClass = tvMode
                             ? 'px-3 py-2 rounded-full border bg-white/95 border-beer-300'
                             : editorStructuredLayout
                                 ? 'px-3 py-2 rounded-[12px] border border-slate-200 bg-white text-slate-900 shadow-[0_10px_20px_-22px_rgba(15,23,42,0.18)] transition-all duration-150'
                             : spectatorLayout
                                 ? 'px-3 py-2 rounded-xl border border-slate-200/90 bg-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.6)]'
                                 : 'px-2 py-1 rounded border-2 border-slate-400 bg-white';
                         const rowWinAClass = isWinnerA
                             ? (tvMode ? 'bg-beer-50 border-beer-500 font-black text-beer-900' : editorStructuredLayout ? 'bg-[var(--editor-warning-50)] border-[color:var(--editor-warning-100)] text-[var(--editor-text-primary)] font-semibold' : spectatorLayout ? 'bg-amber-50 border-amber-300 text-amber-950 font-black' : 'bg-beer-100 font-bold text-beer-900')
                             : '';
                         const rowWinBClass = isWinnerB
                             ? (tvMode ? 'bg-beer-50 border-beer-500 font-black text-beer-900' : editorStructuredLayout ? 'bg-[var(--editor-warning-50)] border-[color:var(--editor-warning-100)] text-[var(--editor-text-primary)] font-semibold' : spectatorLayout ? 'bg-amber-50 border-amber-300 text-amber-950 font-black' : 'bg-beer-100 font-bold text-beer-900')
                             : '';
                         const changedRowAClass = changedA ? 'border-violet-200 bg-violet-50/85 shadow-[0_0_0_1px_rgba(124,58,237,0.06)]' : '';
                         const changedRowBClass = changedB ? 'border-violet-200 bg-violet-50/85 shadow-[0_0_0_1px_rgba(124,58,237,0.06)]' : '';
                         const lockedRowAClass = lockedA ? 'border-slate-200 bg-slate-100 text-slate-500' : '';
                         const lockedRowBClass = lockedB ? 'border-slate-200 bg-slate-100 text-slate-500' : '';
                         const scoreClass = editorStructuredLayout
                             ? 'ml-3 inline-flex min-w-[34px] items-center justify-center rounded-[10px] bg-slate-900 px-2 py-1 text-[11px] font-black text-white shadow-sm'
                             : spectatorLayout
                             ? 'ml-3 inline-flex min-w-[34px] items-center justify-center rounded-lg bg-slate-900 px-2 py-1 text-sm font-black text-white shadow-sm'
                             : `font-mono ${tvMode ? 'text-base font-black' : 'text-lg'}`;

                         return (
                            <div 
                                key={match.id} 
                                ref={(el) => { matchCardRefs.current[match.id] = el; }}
                                onClick={() => handleMatchClick(match)}
                                onKeyDown={(e) => {
                                    if (readOnly) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleMatchClick(match);
                                    }
                                }}
                                role={!readOnly && !isByeSlotMatchDisplay ? 'button' : undefined}
                                tabIndex={!readOnly && !isByeSlotMatchDisplay ? 0 : undefined}
                                className={`
                                    relative ${outerCardBaseClass} ${tvMatchMinHClass} flex flex-col justify-center transition-all
                                    ${(!readOnly && !isByeSlotMatchDisplay && !preserveEmptySlot) ? `${editorStructuredLayout ? 'cursor-pointer hover:border-blue-400 hover:shadow-[0_20px_40px_-32px_rgba(37,99,235,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white' : 'cursor-pointer hover:border-beer-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2'}` : ''}
                                    ${outerCardToneClass}
                                    ${byeCardClass}
                                    ${preserveEmptySlot ? 'opacity-0 pointer-events-none select-none' : ''}
                                    ${tvMode ? 'rounded-2xl' : ''}
                                `}
                                style={monitorStructuredLayout ? {
                                    position: 'absolute',
                                    top: `${getStructuredTop(rIdx, mIdx) + 24}px`,
                                    left: 0,
                                    right: 0,
                                    height: `${baseMatchHeight}px`,
                                } : undefined}
                            >
                                {tvMode && !isByeSlotMatchDisplay && !preserveEmptySlot && !isFinalRound && (
                                    <div className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-px bg-beer-500/35" />
                                )}
                                {(!isByeSlotMatchDisplay && !preserveEmptySlot && match.status === 'playing') && (
                                    <div className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[9px] font-black shadow flex items-center gap-1 ${editorStructuredLayout ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : spectatorLayout ? 'bg-emerald-400 text-slate-950 border border-white/30' : 'bg-green-500 text-white animate-pulse'}`}>
                                        {t('live_badge')}
                                    </div>
                                )}
                                {match.status === 'finished' && readOnly && !preserveEmptySlot && rIdx === rounds.length - 1 && (
                                    <div className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[9px] font-black shadow flex items-center gap-1 ${editorStructuredLayout ? 'bg-amber-100 text-amber-800 border border-amber-200' : spectatorLayout ? 'bg-amber-300 text-slate-950 border border-white/30' : 'bg-yellow-500 text-white'}`}>
                                        <Trophy className="w-3 h-3"/> {t('winner')}
                                    </div>
                                )}

                                <div
                                    onClick={selectableSlotA ? (e) => { e.stopPropagation(); e.preventDefault(); onParticipantClick?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match }); } : undefined}
                                    draggable={selectableSlotA}
                                    onDragStart={selectableSlotA ? (e) => {
                                        e.stopPropagation();
                                        try {
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', slotKeyA);
                                        } catch {
                                            // no-op
                                        }
                                        onParticipantDragStart?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match });
                                    } : undefined}
                                    onDragEnter={selectableSlotA ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onParticipantDragEnter?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match });
                                    } : undefined}
                                    onDragOver={selectableSlotA ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                        onParticipantDragEnter?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match });
                                    } : undefined}
                                    onDrop={selectableSlotA ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onParticipantDrop?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match });
                                    } : undefined}
                                    onDragEnd={selectableSlotA ? () => onParticipantDragEnd?.() : undefined}
                                    onKeyDown={selectableSlotA ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onParticipantClick?.({ matchId: match.id, side: 'A', teamId: match.teamAId, match });
                                        }
                                    } : undefined}
                                    role={selectableSlotA ? 'button' : undefined}
                                    tabIndex={selectableSlotA ? 0 : undefined}
                                    className={`
                                        flex justify-between ${wrapTeamNames ? 'items-start' : 'items-center'} outline-none
                                        ${rowBaseClass}
                                        ${rowWinAClass}
                                        ${changedRowAClass}
                                        ${lockedRowAClass}
                                        ${selectableSlotA ? `${editorStructuredLayout ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white' : 'cursor-pointer'}` : ''}
                                        ${selectedRingA}
                                        ${invalidA ? 'border-2 border-rose-500 bg-rose-50/85 ring-2 ring-rose-200' : ''}
                                        ${draggingA ? 'opacity-60 ring-2 ring-slate-500' : ''}
                                        ${dropA ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/80' : ''}
                                        ${inlineEditSlotKey === `${match.id}|A` ? 'ring-2 ring-beer-600 bg-white/90' : ''}
                                        ${isSlotLibreA ? 'border border-dashed border-sky-300 bg-sky-50 text-sky-700' : ''}
                                    `}
                                    aria-label={selectableSlotA ? t('bracket_select_team_a_slot') : undefined}
                                >
                                    {inlineEditSlotKey === `${match.id}|A` && inlineEditOptions && onInlineEditChange ? (
                                        <select
                                            className="max-w-[150px] rounded-[10px] border border-slate-200 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-900 shadow-[0_10px_22px_-20px_rgba(15,23,42,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            value={(inlineEditValue ?? teamAId ?? '').trim()}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                onInlineEditChange(e.target.value);
                                            }}
                                            aria-label={t('bracket_edit_team_a_slot')}
                                        >
                                            {inlineEditOptions.map((o) => (
                                                <option key={o.value} value={o.value} disabled={o.disabled}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="flex min-w-0 items-center gap-2">
                                            {lockedA ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : null}
                                            <span className={teamNameClass}>
                                                {formatTeamLabel(teamAId, t1, allowByeSlotsThisRound)}
                                            </span>
                                        </span>
                                    )}
                                    <span className={scoreClass}>{(!isByeSlotMatchDisplay && match.status === 'finished') ? match.scoreA : '-'}</span>
                                </div>

                                <div
                                    onClick={selectableSlotB ? (e) => { e.stopPropagation(); e.preventDefault(); onParticipantClick?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match }); } : undefined}
                                    draggable={selectableSlotB}
                                    onDragStart={selectableSlotB ? (e) => {
                                        e.stopPropagation();
                                        try {
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', slotKeyB);
                                        } catch {
                                            // no-op
                                        }
                                        onParticipantDragStart?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match });
                                    } : undefined}
                                    onDragEnter={selectableSlotB ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onParticipantDragEnter?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match });
                                    } : undefined}
                                    onDragOver={selectableSlotB ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                        onParticipantDragEnter?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match });
                                    } : undefined}
                                    onDrop={selectableSlotB ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onParticipantDrop?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match });
                                    } : undefined}
                                    onDragEnd={selectableSlotB ? () => onParticipantDragEnd?.() : undefined}
                                    onKeyDown={selectableSlotB ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onParticipantClick?.({ matchId: match.id, side: 'B', teamId: match.teamBId, match });
                                        }
                                    } : undefined}
                                    role={selectableSlotB ? 'button' : undefined}
                                    tabIndex={selectableSlotB ? 0 : undefined}
                                    className={`
                                        flex justify-between ${wrapTeamNames ? 'items-start' : 'items-center'} outline-none
                                        ${rowBaseClass}
                                        ${rowWinBClass}
                                        ${changedRowBClass}
                                        ${lockedRowBClass}
                                        ${selectableSlotB ? `${editorStructuredLayout ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white' : 'cursor-pointer'}` : ''}
                                        ${selectedRingB}
                                        ${invalidB ? 'border-2 border-rose-500 bg-rose-50/85 ring-2 ring-rose-200' : ''}
                                        ${draggingB ? 'opacity-60 ring-2 ring-slate-500' : ''}
                                        ${dropB ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/80' : ''}
                                        ${inlineEditSlotKey === `${match.id}|B` ? 'ring-2 ring-beer-600 bg-white/90' : ''}
                                        ${isSlotLibreB ? 'border border-dashed border-sky-300 bg-sky-50 text-sky-700' : ''}
                                    `}
                                    aria-label={selectableSlotB ? t('bracket_select_team_b_slot') : undefined}
                                >
                                    {inlineEditSlotKey === `${match.id}|B` && inlineEditOptions && onInlineEditChange ? (
                                        <select
                                            className="max-w-[150px] rounded-[10px] border border-slate-200 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-900 shadow-[0_10px_22px_-20px_rgba(15,23,42,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            value={(inlineEditValue ?? teamBId ?? '').trim()}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                onInlineEditChange(e.target.value);
                                            }}
                                            aria-label={t('bracket_edit_team_b_slot')}
                                        >
                                            {inlineEditOptions.map((o) => (
                                                <option key={o.value} value={o.value} disabled={o.disabled}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="flex min-w-0 items-center gap-2">
                                            {lockedB ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : null}
                                            <span className={teamNameClass}>
                                                {formatTeamLabel(teamBId, t2, allowByeSlotsThisRound)}
                                            </span>
                                        </span>
                                    )}
                                    <span className={scoreClass}>{(!isByeSlotMatchDisplay && match.status === 'finished') ? match.scoreB : '-'}</span>
                                </div>

                                {!readOnly && !isByeSlotMatchDisplay && !preserveEmptySlot && <Edit2 className="w-3 h-3 absolute top-1 right-1 text-slate-300" />}
                            </div>
                        );
                    })}
                </div>
            ))}
                </div>
            </div>

            {editingMatch && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div
                        className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-up"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="edit-score-title"
                    >
                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                            <h3 id="edit-score-title" className="font-bold">{t('edit_match_result')}</h3>
                            <button
                                type="button"
                                onClick={() => setEditingMatch(null)}
                                aria-label={t('close')}
                                className="rounded-md p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                            >
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex justify-between items-center gap-4">
                                <div className="text-center flex-1">
                                    <div className="mb-1 text-xs font-bold leading-tight text-slate-500 whitespace-normal break-words">{teams.find(t=>t.id===editingMatch.teamAId)?.name || t('team_a')}</div>
                                    <input 
                                        type="number" 
                                        aria-label={t('bracket_team_a_score_aria')}
                                        value={scoreA} 
                                        onChange={e => setScoreA(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-16 h-16 text-center text-2xl font-black border-2 border-slate-200 rounded-xl focus:border-beer-500 outline-none"
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                    />
                                </div>
                                <div className="font-black text-slate-300">-</div>
                                <div className="text-center flex-1">
                                    <div className="mb-1 text-xs font-bold leading-tight text-slate-500 whitespace-normal break-words">{teams.find(t=>t.id===editingMatch.teamBId)?.name || t('team_b')}</div>
                                    <input 
                                        type="number" 
                                        aria-label={t('bracket_team_b_score_aria')}
                                        value={scoreB} 
                                        onChange={e => setScoreB(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-16 h-16 text-center text-2xl font-black border-2 border-slate-200 rounded-xl focus:border-beer-500 outline-none"
                                        onFocus={handleZeroValueFocus}
                                        onMouseUp={handleZeroValueMouseUp}
                                        onBlur={handleZeroValueBlur}
                                    />
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={handleSaveScore}
                                className="w-full bg-beer-500 text-white py-3 rounded-xl font-black uppercase hover:bg-beer-600 transition flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2"
                            >
                                <Save className="w-4 h-4"/> {t('register_result')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
