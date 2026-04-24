import React from 'react';
import { Trophy } from 'lucide-react';
import { TournamentBracket } from './TournamentBracket';
import type { Match, Team, TournamentData } from '../types';
import { isByeTeamId, isTbdTeamId } from '../services/matchUtils';
import { getPreferredBracketRounds } from '../services/tournamentStructureSelectors';
import { useTranslation } from '../App';
import { isResultsOnlyTournament } from '../services/tournamentModes';

type LayoutProfile = {
  matchWidth: number;
  matchHeight: number;
  gapX: number;
  gapY: number;
  centerGap: number;
  topPad: number;
  bottomPad: number;
  sidePad: number;
  labelY: number;
  fontSize: number;
  labelSize: number;
};

type ResolvedStageMatch = {
  uid: string;
  raw: Match;
  roundIndex: number;
  matchIndex: number;
  top: string;
  bottom: string;
  sourceUids: string[];
  visible: boolean;
};

type Placement = {
  x: number;
  y: number;
  centerY: number;
  side: 'left' | 'right' | 'center';
};

type LayoutData = {
  profile: LayoutProfile;
  stageWidth: number;
  stageHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  labels: Array<{ key: string; x: number; y: number; text: string; side: 'left' | 'right' | 'center' }>;
  placements: Record<string, Placement>;
};

interface TvClassicBracketProps {
  teams: Team[];
  matches: Match[];
  data?: TournamentData | null;
  compact?: boolean;
  minimalChrome?: boolean;
}

const sortByOrderIndexSafe = (a: Match, b: Match) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0);

const roundLabelFromMatch = (m?: Match, fallback?: string) => {
  const raw = String(m?.roundName || '').trim();
  if (raw) return raw.toUpperCase();
  return String(fallback || 'TURNO').toUpperCase();
};


const getLabelStyle = (
  text: string,
  baseSize: number,
  compact: boolean,
  side: 'left' | 'right' | 'center',
  profile: LayoutProfile,
) => {
  const length = String(text || '').trim().length;
  const dense = compact || profile.matchHeight <= 52;
  let fontSize = baseSize + (side === 'center' ? (compact ? 0.9 : 1.3) : 0);
  if (dense && side !== 'center') fontSize -= 0.45;
  if (length >= 18) fontSize -= compact ? 1.6 : 1.2;
  else if (length >= 12) fontSize -= compact ? 0.9 : 0.6;

  return {
    fontSize: `${Math.max(compact ? 7.6 : 8.4, Number(fontSize.toFixed(1)))}px`,
    paddingInline: side === 'center' ? (compact ? '10px' : '12px') : (dense ? '8px' : compact ? '9px' : '11px'),
    maxWidth: side !== 'center' ? (dense ? '112px' : compact ? '128px' : '156px') : compact ? '140px' : '168px',
  } as const;
};

const getLabelClassName = (side: 'left' | 'right' | 'center', compact: boolean, profile: LayoutProfile) => {
  const dense = compact || profile.matchHeight <= 52;
  if (side === 'center') {
    return 'border-amber-300/35 bg-amber-950/95 text-amber-100 shadow-[0_0_26px_rgba(245,158,11,0.16)]';
  }
  if (dense) {
    return 'border-white/6 bg-slate-950/68 text-slate-200/68 shadow-[0_8px_18px_rgba(0,0,0,0.16)]';
  }
  return compact
    ? 'border-white/8 bg-slate-950/82 text-slate-100/82 shadow-[0_8px_18px_rgba(0,0,0,0.16)]'
    : 'border-white/10 bg-slate-950/90 text-slate-100/92 shadow-lg';
};

const computeRoundCenters = (matchCount: number, topPad: number, matchHeight: number, gapY: number) => {
  const rounds: number[][] = [];
  const first = Array.from({ length: matchCount }, (_, index) => (
    topPad + (matchHeight / 2) + index * (matchHeight + gapY)
  ));
  rounds.push(first);

  let previous = first;
  while (previous.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      next.push((previous[i] + previous[i + 1]) / 2);
    }
    rounds.push(next);
    previous = next;
  }
  return rounds;
};

const getProfile = (bracketSize: number, compact: boolean): LayoutProfile => {
  if (compact) {
    if (bracketSize <= 8) return { matchWidth: 228, matchHeight: 76, gapX: 46, gapY: 28, centerGap: 58, topPad: 88, bottomPad: 42, sidePad: 32, labelY: 28, fontSize: 16, labelSize: 12 };
    if (bracketSize <= 16) return { matchWidth: 206, matchHeight: 68, gapX: 34, gapY: 22, centerGap: 46, topPad: 82, bottomPad: 36, sidePad: 28, labelY: 26, fontSize: 14, labelSize: 11 };
    if (bracketSize <= 32) return { matchWidth: 188, matchHeight: 60, gapX: 26, gapY: 14, centerGap: 36, topPad: 78, bottomPad: 30, sidePad: 24, labelY: 24, fontSize: 12, labelSize: 10 };
    if (bracketSize <= 64) return { matchWidth: 168, matchHeight: 52, gapX: 20, gapY: 10, centerGap: 28, topPad: 72, bottomPad: 24, sidePad: 20, labelY: 22, fontSize: 11, labelSize: 9 };
    return { matchWidth: 148, matchHeight: 44, gapX: 14, gapY: 6, centerGap: 22, topPad: 66, bottomPad: 20, sidePad: 16, labelY: 20, fontSize: 10, labelSize: 8 };
  }

  if (bracketSize <= 8) return { matchWidth: 260, matchHeight: 84, gapX: 54, gapY: 34, centerGap: 70, topPad: 98, bottomPad: 48, sidePad: 38, labelY: 30, fontSize: 17, labelSize: 13 };
  if (bracketSize <= 16) return { matchWidth: 234, matchHeight: 74, gapX: 40, gapY: 24, centerGap: 54, topPad: 92, bottomPad: 40, sidePad: 34, labelY: 28, fontSize: 15, labelSize: 12 };
  if (bracketSize <= 32) return { matchWidth: 214, matchHeight: 64, gapX: 30, gapY: 16, centerGap: 42, topPad: 86, bottomPad: 34, sidePad: 28, labelY: 26, fontSize: 13, labelSize: 11 };
  if (bracketSize <= 64) return { matchWidth: 188, matchHeight: 56, gapX: 24, gapY: 10, centerGap: 34, topPad: 80, bottomPad: 28, sidePad: 24, labelY: 24, fontSize: 11, labelSize: 10 };
  return { matchWidth: 168, matchHeight: 48, gapX: 18, gapY: 6, centerGap: 28, topPad: 74, bottomPad: 22, sidePad: 20, labelY: 22, fontSize: 10, labelSize: 9 };
};

const getWinnerId = (m?: Match) => {
  if (!m) return undefined;

  if (isByeTeamId(m.teamAId) && m.teamBId && !isByeTeamId(m.teamBId) && !isTbdTeamId(m.teamBId)) {
    return m.teamBId;
  }
  if (isByeTeamId(m.teamBId) && m.teamAId && !isByeTeamId(m.teamAId) && !isTbdTeamId(m.teamAId)) {
    return m.teamAId;
  }
  if (m.status !== 'finished') return undefined;
  if (m.scoreA > m.scoreB && m.teamAId && !isTbdTeamId(m.teamAId)) return m.teamAId;
  if (m.scoreB > m.scoreA && m.teamBId && !isTbdTeamId(m.teamBId)) return m.teamBId;
  return undefined;
};

const getTeamTextFontSize = (name: string, baseFontSize: number, compact: boolean) => {
  const normalized = String(name || '').trim();
  const len = normalized.length;
  let size = baseFontSize;

  if (len >= 30) size -= compact ? 3.2 : 3;
  else if (len >= 24) size -= compact ? 2.4 : 2.2;
  else if (len >= 18) size -= compact ? 1.4 : 1.1;

  return Math.max(compact ? 8.5 : 9.5, Number(size.toFixed(1)));
};

const scoreTextClass = (profile: LayoutProfile, compact: boolean) => {
  if (profile.fontSize >= 16 && !compact) return 'text-base';
  if (profile.fontSize >= 13) return compact ? 'text-sm' : 'text-[15px]';
  if (profile.fontSize >= 11) return compact ? 'text-[12px]' : 'text-sm';
  return 'text-[11px]';
};

const getRowPaddingClass = (profile: LayoutProfile, compact: boolean) => {
  if (compact && profile.matchHeight <= 52) return 'px-2';
  if (compact && profile.matchHeight <= 60) return 'px-2.5';
  if (profile.matchHeight <= 52) return 'px-2.5';
  return 'px-3';
};

const getCardRadiusClass = (profile: LayoutProfile, compact: boolean) => {
  if (compact && profile.matchHeight <= 52) return 'rounded-[14px]';
  if (profile.matchHeight <= 52) return 'rounded-[16px]';
  return 'rounded-[18px]';
};

const getCodeBadgeClass = (profile: LayoutProfile, compact: boolean) => {
  if (compact && profile.matchHeight <= 52) return 'hidden';
  if (compact && profile.matchHeight <= 60) return 'top-1 text-[9px]';
  if (profile.matchHeight <= 52) return 'top-1 text-[9px]';
  return 'top-1.5 text-[10px]';
};

const isPlaceholderTeamName = (name: string) => {
  const normalized = String(name || '').trim().toUpperCase();
  return !normalized || normalized === 'TBD';
};

const TeamLine: React.FC<{
  name: string;
  score: string | number;
  placementSide: Placement['side'];
  profile: LayoutProfile;
  compact: boolean;
  winner?: boolean;
  pendingAriaLabel: string;
  scoreAriaLabel: string;
}> = ({ name, score, placementSide, profile, compact, winner = false, pendingAriaLabel, scoreAriaLabel }) => {
  const textFontSize = getTeamTextFontSize(name, profile.fontSize, compact);
  const scoreClass = scoreTextClass(profile, compact);
  const isPlaceholder = isPlaceholderTeamName(name);
  const isPendingScore = score === '-';
  const scoreNode = score === '' ? null : (
    <span
      className={`shrink-0 font-mono font-black tabular-nums ${scoreClass} ${winner ? 'text-amber-100' : 'text-slate-100'} ${isPendingScore ? 'opacity-55' : ''}`}
      aria-label={isPendingScore ? pendingAriaLabel : `${scoreAriaLabel} ${score}`}
    >
      {score}
    </span>
  );
  const nameNode = (
    <span
      className={`min-w-0 flex-1 overflow-hidden whitespace-normal leading-[1.04] ${isPlaceholder ? 'uppercase tracking-[0.16em] text-slate-300/75' : winner ? 'text-amber-50' : 'text-slate-50'} ${winner ? 'font-black' : 'font-bold'}`}
      style={{
        fontSize: `${textFontSize}px`,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        wordBreak: isPlaceholder ? 'keep-all' : 'break-word',
        overflowWrap: 'anywhere',
      }}
      title={name}
    >
      {name}
    </span>
  );

  if (placementSide === 'right') {
    return (
      <>
        {scoreNode}
        {nameNode}
      </>
    );
  }

  return (
    <>
      {nameNode}
      {scoreNode}
    </>
  );
};

const getConnectorStyle = (profile: LayoutProfile, compact: boolean, isFinal: boolean) => {
  const dense = compact || profile.matchHeight <= 52;
  const veryDense = profile.matchHeight <= 44;

  if (isFinal) {
    return {
      stroke: 'rgba(252, 211, 77, 0.58)',
      glowStroke: 'rgba(251, 191, 36, 0.18)',
      strokeWidth: dense ? 2.2 : 2.7,
      glowWidth: dense ? 5.4 : 6.6,
    } as const;
  }

  return {
    stroke: dense ? 'rgba(103, 232, 249, 0.34)' : 'rgba(103, 232, 249, 0.4)',
    glowStroke: dense ? 'rgba(34, 211, 238, 0.08)' : 'rgba(34, 211, 238, 0.12)',
    strokeWidth: veryDense ? 1.35 : dense ? 1.6 : 2.15,
    glowWidth: veryDense ? 3.1 : dense ? 3.8 : 4.8,
  } as const;
};

const getFinalCardVisuals = (profile: LayoutProfile, compact: boolean, finished: boolean) => {
  const dense = compact || profile.matchHeight <= 52;
  const veryDense = profile.matchHeight <= 44;
  const badgeVisible = !veryDense;

  return {
    frameClass: finished
      ? (dense
        ? 'border-amber-300/50 shadow-[0_16px_36px_rgba(251,191,36,0.14)]'
        : 'border-amber-300/55 shadow-[0_20px_46px_rgba(251,191,36,0.18)]')
      : (dense
        ? 'border-amber-300/38 shadow-[0_14px_32px_rgba(251,191,36,0.11)]'
        : 'border-amber-300/42 shadow-[0_18px_40px_rgba(251,191,36,0.14)]'),
    glowClass: finished
      ? 'bg-[radial-gradient(circle_at_50%_45%,rgba(251,191,36,0.22),transparent_64%)]'
      : 'bg-[radial-gradient(circle_at_50%_45%,rgba(251,191,36,0.12),transparent_64%)]',
    badgeVisible,
    badgeClass: !badgeVisible
      ? 'hidden'
      : (dense
        ? 'top-1.5 left-1/2 -translate-x-1/2 text-[9px] px-2 py-0.5'
        : 'top-2 left-1/2 -translate-x-1/2 text-[10px] px-2.5 py-1'),
    codeClass: dense
      ? 'bottom-1.5 text-[8px] opacity-60'
      : 'bottom-2 text-[9px] opacity-70',
    showCodeBadge: !badgeVisible,
    railWidthClass: veryDense ? 'w-[2px]' : dense ? 'w-[2.5px]' : 'w-[3px]',
  } as const;
};

const getMatchRowClass = ({
  isWinner,
  isPlaceholder,
  isFinal,
  isSemifinal,
}: {
  isWinner: boolean;
  isPlaceholder: boolean;
  isFinal: boolean;
  isSemifinal: boolean;
}) => {
  if (isPlaceholder) {
    if (isFinal) return 'bg-white/[0.03] text-slate-300/88';
    if (isSemifinal) return 'bg-white/[0.02] text-slate-300/84';
    return 'bg-white/[0.018] text-slate-300';
  }

  if (isWinner) {
    if (isFinal) return 'bg-amber-100/16 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.16)]';
    if (isSemifinal) return 'bg-amber-50/11 text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.09)]';
    return 'bg-amber-50/10 text-amber-50';
  }

  if (isFinal) return 'bg-slate-950/16 text-slate-100/88';
  if (isSemifinal) return 'bg-slate-950/12 text-slate-100/84';
  return 'bg-white/[0.03] text-slate-50';
};

const pathForConnector = (
  source: Placement,
  target: Placement,
  profile: LayoutProfile,
  compact: boolean,
  isFinal: boolean,
) => {
  const sourceFlowsRight = source.x < target.x;
  const startX = sourceFlowsRight ? source.x + profile.matchWidth : source.x;
  const endX = sourceFlowsRight ? target.x : target.x + profile.matchWidth;
  const startY = source.centerY;
  const endY = target.centerY;
  const midX = startX + ((endX - startX) / 2);
  const connectorPath = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
  const style = getConnectorStyle(profile, compact, isFinal);

  return (
    <g key={`${startX}-${startY}-${endX}-${endY}`}>
      <path
        d={connectorPath}
        stroke={style.glowStroke}
        strokeWidth={style.glowWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={connectorPath}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};

export const TvClassicBracket: React.FC<TvClassicBracketProps> = ({ teams, matches, data, compact = false, minimalChrome = false }) => {
  const { t } = useTranslation();
  const resultsOnlyBracket = isResultsOnlyTournament(data || null);

  const getTeamOutcomeLabel = React.useCallback((match: Match, side: 'A' | 'B') => {
    if (match.status !== 'finished') return resultsOnlyBracket ? '' : '-';
    if (!resultsOnlyBracket) return side === 'A' ? match.scoreA : match.scoreB;

    const winnerA = match.scoreA > match.scoreB;
    const winnerB = match.scoreB > match.scoreA;
    if (side === 'A') return winnerA ? 'W' : winnerB ? 'L' : '';
    return winnerB ? 'W' : winnerA ? 'L' : '';
  }, [resultsOnlyBracket]);

  const localizeRoundLabel = React.useCallback((text: string, compactMode = false) => {
    const normalized = String(text || '').trim().toUpperCase();
    if (!normalized) return compactMode ? 'R' : t('round_word');

    if (normalized === 'FINALE' || normalized === 'FINAL') return t('finale');
    if (normalized === 'SEMIFINALE' || normalized === 'SEMIFINALI' || normalized === 'SEMIFINAL' || normalized === 'SEMIFINALS') return t('semi');
    if (normalized === 'QUARTI DI FINALE' || normalized === 'QUARTERFINAL' || normalized === 'QUARTERFINALS') return t('quarti');
    if (normalized === 'OTTAVI DI FINALE' || normalized === 'ROUND OF 16') return t('ottavi');
    if (normalized === 'SEDICESIMI DI FINALE' || normalized === 'ROUND OF 32') return '1/16';
    if (normalized === 'TRENTADUESIMI DI FINALE' || normalized === 'ROUND OF 64') return '1/32';

    const roundMatch = normalized.match(/^(?:TURNO|ROUND)\s+(\d+)$/);
    if (roundMatch) return compactMode ? `R${roundMatch[1]}` : `${t('round_word')} ${roundMatch[1]}`;

    return normalized;
  }, [t]);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const measure = () => {
      setViewportSize({ width: node.clientWidth, height: node.clientHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const teamNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const team of (teams || [])) {
      map.set(team.id, team.name);
    }
    return map;
  }, [teams]);

  const currentMatchesById = React.useMemo(() => {
    const map = new Map<string, Match>();
    for (const match of (matches || [])) {
      if (!match?.id) continue;
      map.set(match.id, match);
    }
    return map;
  }, [matches]);

  const allRounds = React.useMemo(() => {
    return getPreferredBracketRounds(data || null, matches || []).map((round) =>
      round
        .map((match) => currentMatchesById.get(match.id) || match)
        .sort(sortByOrderIndexSafe)
    );
  }, [currentMatchesById, data, matches]);

  const resolvedRounds = React.useMemo<ResolvedStageMatch[][]>(() => {
    return allRounds.map((round, roundIndex) => {
      return round.map((raw, matchIndex) => {
        let topId = (raw.teamAId || '').trim();
        let bottomId = (raw.teamBId || '').trim();
        const prevRound = roundIndex > 0 ? allRounds[roundIndex - 1] || [] : [];

        if (!topId && prevRound[matchIndex * 2]) {
          topId = getWinnerId(prevRound[matchIndex * 2]) || 'TBD';
        }
        if (!bottomId && prevRound[matchIndex * 2 + 1]) {
          bottomId = getWinnerId(prevRound[matchIndex * 2 + 1]) || 'TBD';
        }

        const top = isByeTeamId(topId)
          ? 'BYE'
          : (isTbdTeamId(topId) ? 'TBD' : (teamNameById.get(topId) || topId || 'TBD'));
        const bottom = isByeTeamId(bottomId)
          ? 'BYE'
          : (isTbdTeamId(bottomId) ? 'TBD' : (teamNameById.get(bottomId) || bottomId || 'TBD'));

        const sourceUids = roundIndex > 0
          ? [
              prevRound[matchIndex * 2]?.id ? `tv-${prevRound[matchIndex * 2].id}` : '',
              prevRound[matchIndex * 2 + 1]?.id ? `tv-${prevRound[matchIndex * 2 + 1].id}` : '',
            ].filter(Boolean)
          : [];

        const visible = !raw.hidden && !raw.isBye && !isByeTeamId(topId) && !isByeTeamId(bottomId);

        return {
          uid: `tv-${raw.id}`,
          raw,
          roundIndex,
          matchIndex,
          top,
          bottom,
          sourceUids,
          visible,
        };
      });
    });
  }, [allRounds, teamNameById]);

  const classicLayoutSupported = React.useMemo(() => {
    if (!allRounds.length) return false;
    if (allRounds.length === 1) return (allRounds[0]?.length || 0) === 1;

    const counts = allRounds.map((round) => round.length);
    if (counts[counts.length - 1] !== 1) return false;

    for (let i = 0; i < counts.length - 1; i += 1) {
      const current = counts[i] || 0;
      const next = counts[i + 1] || 0;
      if (current <= 0 || next <= 0) return false;
      if (current % 2 !== 0) return false;
      if (Math.ceil(current / 2) !== next) return false;
    }

    return true;
  }, [allRounds]);

  const bracketSize = React.useMemo(() => {
    if (!allRounds.length) return 0;
    return Math.max(2, 2 ** allRounds.length);
  }, [allRounds.length]);

  const byeCount = React.useMemo(() => (
    (teams || []).filter((team) => team.hidden || team.isBye || isByeTeamId(team.id) || String(team.name || '').trim().toUpperCase() === 'BYE').length
  ), [teams]);

  const activeProfile = React.useMemo(() => getProfile(bracketSize, compact), [bracketSize, compact]);
  const denseLayout = compact || activeProfile.matchHeight <= 52;
  const veryDenseLayout = activeProfile.matchHeight <= 44;

  const layout = React.useMemo<LayoutData | null>(() => {
    if (!resolvedRounds.length || !viewportSize.width || !viewportSize.height) return null;

    let firstVisibleRound = 0;
    for (let i = 0; i < resolvedRounds.length - 1; i++) {
      if (resolvedRounds[i].some(m => m.visible)) {
        firstVisibleRound = i;
        break;
      }
      if (i === resolvedRounds.length - 2) {
        firstVisibleRound = i;
      }
    }

    const effectiveRounds = resolvedRounds.slice(firstVisibleRound);
    const profile = activeProfile;
    const totalRounds = effectiveRounds.length;
    const sideRounds = Math.max(0, totalRounds - 1);
    const firstRoundPerSide = sideRounds > 0
      ? Math.max(1, Math.floor((effectiveRounds[0]?.length || 0) / 2))
      : 1;

    const centers = computeRoundCenters(firstRoundPerSide, profile.topPad, profile.matchHeight, profile.gapY);
    const stageHeight = profile.topPad
      + firstRoundPerSide * profile.matchHeight
      + Math.max(0, firstRoundPerSide - 1) * profile.gapY
      + profile.bottomPad;

    const availableWidth = Math.max(1, viewportSize.width - 12);
    const availableHeight = Math.max(1, viewportSize.height - 12);
    const fixedColumnsWidth = sideRounds > 0
      ? profile.sidePad * 2 + (sideRounds * 2 + 1) * profile.matchWidth
      : profile.sidePad * 2 + profile.matchWidth;
    const baseFlexibleWidth = sideRounds > 0
      ? Math.max(0, sideRounds - 1) * 2 * profile.gapX + 2 * profile.centerGap
      : 0;
    const baseStageWidth = fixedColumnsWidth + baseFlexibleWidth;
    const heightScale = Math.min(1, availableHeight / Math.max(1, stageHeight));
    const widthScale = Math.min(1, availableWidth / Math.max(1, baseStageWidth));

    // Tall brackets shrink vertically; stretch the horizontal gutters so round 1 still hugs the TV edges.
    const targetStageWidth = sideRounds > 0 && baseFlexibleWidth > 0
      ? Math.max(baseStageWidth, availableWidth / Math.max(0.001, heightScale))
      : baseStageWidth;
    const flexibleWidth = Math.max(baseFlexibleWidth, targetStageWidth - fixedColumnsWidth);
    const horizontalGapMultiplier = baseFlexibleWidth > 0 ? flexibleWidth / baseFlexibleWidth : 1;
    const horizontalGapX = sideRounds > 1 ? profile.gapX * horizontalGapMultiplier : profile.gapX;
    const horizontalCenterGap = sideRounds > 0 ? profile.centerGap * horizontalGapMultiplier : profile.centerGap;

    const leftWidth = sideRounds > 0 ? sideRounds * profile.matchWidth + Math.max(0, sideRounds - 1) * horizontalGapX : 0;
    const rightWidth = leftWidth;
    const stageWidth = sideRounds > 0
      ? profile.sidePad + leftWidth + horizontalCenterGap + profile.matchWidth + horizontalCenterGap + rightWidth + profile.sidePad
      : profile.sidePad * 2 + profile.matchWidth;

    const finalX = sideRounds > 0
      ? profile.sidePad + leftWidth + horizontalCenterGap
      : (stageWidth - profile.matchWidth) / 2;
    const finalCenterY = centers[centers.length - 1]?.[0] ?? (profile.topPad + profile.matchHeight / 2);

    const placements: Record<string, Placement> = {};
    const labels: LayoutData['labels'] = [];

    for (let roundIndex = 0; roundIndex < sideRounds; roundIndex += 1) {
      const round = effectiveRounds[roundIndex] || [];
      const leftRound = round.slice(0, round.length / 2);
      const rightRound = round.slice(round.length / 2);
      const leftX = profile.sidePad + roundIndex * (profile.matchWidth + horizontalGapX);
      const rightX = finalX + profile.matchWidth + horizontalCenterGap + (sideRounds - 1 - roundIndex) * (profile.matchWidth + horizontalGapX);
      const originalRoundIndex = roundIndex + firstVisibleRound;
      const roundText = roundLabelFromMatch(round[0]?.raw, `Turno ${originalRoundIndex + 1}`);

      labels.push({ key: `left-${roundIndex}`, x: leftX + profile.matchWidth / 2, y: profile.labelY, text: roundText, side: 'left' });
      labels.push({ key: `right-${roundIndex}`, x: rightX + profile.matchWidth / 2, y: profile.labelY, text: roundText, side: 'right' });

      leftRound.forEach((match, matchIndex) => {
        const centerY = centers[roundIndex]?.[matchIndex];
        if (typeof centerY !== 'number') return;
        placements[match.uid] = { x: leftX, y: centerY - profile.matchHeight / 2, centerY, side: 'left' };
      });

      rightRound.forEach((match, matchIndex) => {
        const centerY = centers[roundIndex]?.[matchIndex];
        if (typeof centerY !== 'number') return;
        placements[match.uid] = { x: rightX, y: centerY - profile.matchHeight / 2, centerY, side: 'right' };
      });
    }

    const finalMatch = effectiveRounds[totalRounds - 1]?.[0];
    if (finalMatch) {
      placements[finalMatch.uid] = { x: finalX, y: finalCenterY - profile.matchHeight / 2, centerY: finalCenterY, side: 'center' };
      labels.push({ key: 'final', x: finalX + profile.matchWidth / 2, y: profile.labelY, text: 'FINALE', side: 'center' });
    }

    const scale = Math.min(1, availableWidth / stageWidth, availableHeight / stageHeight);
    const offsetX = (viewportSize.width - stageWidth * scale) / 2;
    const offsetY = (viewportSize.height - stageHeight * scale) / 2;

    return {
      profile,
      stageWidth,
      stageHeight,
      scale,
      offsetX,
      offsetY,
      labels,
      placements,
    };
  }, [activeProfile, resolvedRounds, viewportSize.height, viewportSize.width]);

  const visibleMatches = React.useMemo(() => resolvedRounds.flat().filter((match) => match.visible), [resolvedRounds]);

  const lines = React.useMemo(() => {
    if (!layout) return [] as React.ReactNode[];
    const rendered: React.ReactNode[] = [];
    const finalUid = resolvedRounds[resolvedRounds.length - 1]?.[0]?.uid;

    for (const match of visibleMatches) {
      const target = layout.placements[match.uid];
      if (!target) continue;
      for (const sourceUid of match.sourceUids) {
        const sourceMatch = resolvedRounds.flat().find((item) => item.uid === sourceUid && item.visible);
        if (!sourceMatch) continue;
        const source = layout.placements[sourceUid];
        if (!source) continue;
        rendered.push(pathForConnector(source, target, layout.profile, compact, match.uid === finalUid));
      }
    }

    return rendered;
  }, [layout, resolvedRounds, visibleMatches]);

  if (!resolvedRounds.length) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400 font-black uppercase tracking-[0.24em] text-sm">
        {t('no_bracket_available')}
      </div>
    );
  }

  const totalTeams = (teams || []).filter((team) => !(team.hidden || team.isBye || isByeTeamId(team.id) || String(team.name || '').trim().toUpperCase() === 'BYE')).length;
  const turni = resolvedRounds.length;

  if (!classicLayoutSupported) {
    if (minimalChrome) {
      return (
        <div className="relative h-full w-full overflow-hidden text-slate-50">
          <div className="absolute inset-0 overflow-hidden">
            <TournamentBracket
              data={data || null}
              teams={teams}
              matches={matches}
              readOnly={true}
              tvMode={true}
              fitToBox={true}
              wrapTeamNames={true}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,#07111f,#0c1d35_44%,#173056)] shadow-[0_18px_40px_rgba(0,0,0,0.34)] text-slate-50">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(97,230,255,0.18),transparent_20%),radial-gradient(circle_at_80%_15%,rgba(139,92,246,0.16),transparent_22%),radial-gradient(circle_at_70%_80%,rgba(41,214,255,0.08),transparent_18%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:32px_32px]" />

        <div className={compact ? 'absolute inset-x-2.5 top-2.5 z-10 flex items-start justify-between gap-2' : denseLayout ? 'absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2.5' : 'absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3'}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 shadow-lg backdrop-blur-md ${compact ? 'px-3 py-1.5' : denseLayout ? 'px-3.5 py-1.5' : 'px-4 py-2'}`}>
              <Trophy className={`${compact ? 'h-3.5 w-3.5' : denseLayout ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-cyan-300`} />
              <div className={`${compact ? 'text-[11px]' : denseLayout ? 'text-[12px]' : 'text-sm'} font-black uppercase tracking-[0.18em]`}>{t('admin_tv_bracket')}</div>
            </div>
            {compact ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-100 backdrop-blur-md">
                  <span className="text-slate-300">{t('turns_label')}</span>
                  <strong>{turni}</strong>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-100 backdrop-blur-md">
                  <span className="text-slate-300">{t('teams')}</span>
                  <strong>{totalTeams}</strong>
                </div>
              </>
            ) : (
              <>
                <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}>
                  <span className="text-slate-300">{t('teams')}</span>
                  <strong>{totalTeams}</strong>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}>
                  <span className="text-slate-300">{t('turns_label')}</span>
                  <strong>{turni}</strong>
                </div>
                {!denseLayout && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md">
                    <span className="text-slate-300">{t('bye_label')}</span>
                    <strong>{byeCount}</strong>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={`inline-flex items-center rounded-full border border-amber-300/20 bg-amber-950/60 font-black uppercase tracking-[0.18em] text-amber-100 backdrop-blur-md ${compact ? 'px-2.5 py-1.5 text-[9px]' : 'px-3 py-2 text-[10px]'}`}>
            {t('layout_fallback_compatibility')}
          </div>
        </div>

        <div className={`absolute z-10 rounded-full border border-white/10 bg-slate-950/55 text-slate-200 backdrop-blur-md ${compact ? 'bottom-2.5 left-2.5 px-2.5 py-1.5 text-[9px] tracking-[0.18em]' : denseLayout ? 'bottom-3 left-3 px-2.5 py-1.5 text-[9px] tracking-[0.18em]' : 'bottom-4 left-4 px-3 py-2 text-[10px] tracking-[0.2em]'} font-black uppercase`}>
          {compact || denseLayout ? t('historical_fallback_zero_click') : t('historical_fallback_bye_hidden_zero_click')}
        </div>

        {!compact && !denseLayout && (
          <div className="absolute bottom-4 right-4 z-10 flex flex-wrap justify-end gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-cyan-300" /> {t('bracket_word')}</div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-amber-300" /> {t('layout_fallback')}</div>
          </div>
        )}

        <div className={compact ? (veryDenseLayout ? 'absolute inset-x-1.5 bottom-8 top-12 overflow-hidden md:inset-x-2 md:bottom-9 md:top-12' : 'absolute inset-x-2 bottom-9 top-14 overflow-hidden md:inset-x-2 md:bottom-10 md:top-14') : (veryDenseLayout ? 'absolute inset-x-2 bottom-11 top-16 overflow-hidden md:inset-x-3 md:bottom-12 md:top-16' : denseLayout ? 'absolute inset-x-2.5 bottom-12 top-18 overflow-hidden md:inset-x-3 md:bottom-12 md:top-18' : 'absolute inset-x-3 bottom-14 top-20 overflow-hidden md:inset-x-4 md:bottom-14 md:top-20')}>
          <div className="h-full rounded-[22px] border border-white/10 bg-slate-950/26 p-2 md:p-3">
            <TournamentBracket
              teams={teams}
              matches={matches}
              data={data || undefined}
              readOnly={true}
              tvMode={true}
              fitToBox={true}
              wrapTeamNames={true}
            />
          </div>
        </div>
      </div>
    );
  }
  const viewportClassName = minimalChrome
    ? 'absolute inset-0 overflow-hidden'
    : compact
      ? (veryDenseLayout
        ? 'absolute inset-x-1.5 bottom-8 top-12 overflow-hidden md:inset-x-2 md:bottom-9 md:top-12'
        : 'absolute inset-x-2 bottom-9 top-14 overflow-hidden md:inset-x-2 md:bottom-10 md:top-14')
      : (veryDenseLayout
        ? 'absolute inset-x-2 bottom-11 top-16 overflow-hidden md:inset-x-3 md:bottom-12 md:top-16'
        : denseLayout
          ? 'absolute inset-x-2.5 bottom-12 top-18 overflow-hidden md:inset-x-3 md:bottom-12 md:top-18'
          : 'absolute inset-x-3 bottom-14 top-20 overflow-hidden md:inset-x-4 md:bottom-14 md:top-20');

  if (minimalChrome) {
    return (
      <div className="relative h-full w-full overflow-hidden text-slate-50">
        <div ref={viewportRef} className={viewportClassName}>
          {layout && (
            <div
              className="absolute left-0 top-0"
              style={{
                width: `${layout.stageWidth}px`,
                height: `${layout.stageHeight}px`,
                transform: `translate(${layout.offsetX}px, ${layout.offsetY}px) scale(${layout.scale})`,
                transformOrigin: 'top left',
              }}
            >
              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${layout.stageWidth} ${layout.stageHeight}`} aria-hidden="true">
                {lines}
              </svg>

              {layout.labels.map((label) => {
                const displayText = localizeRoundLabel(label.text, compact);
                const labelStyle = getLabelStyle(displayText, layout.profile.labelSize, compact, label.side, layout.profile);
                const labelClassName = getLabelClassName(label.side, compact, layout.profile);

                return (
                  <div
                    key={label.key}
                    className={`absolute -translate-x-1/2 rounded-full border py-1 text-center font-black tracking-[0.18em] ${labelClassName}`}
                    style={{ left: `${label.x}px`, top: `${label.y}px`, ...labelStyle }}
                    title={label.text}
                  >
                    {displayText}
                  </div>
                );
              })}

              {visibleMatches.map((match) => {
                const placement = layout.placements[match.uid];
                if (!placement) return null;

                const isFinal = match.roundIndex === resolvedRounds.length - 1;
                const isSemifinal = match.roundIndex === resolvedRounds.length - 2;
                const isWinnerA = match.raw.status === 'finished' && match.raw.scoreA > match.raw.scoreB;
                const isWinnerB = match.raw.status === 'finished' && match.raw.scoreB > match.raw.scoreA;
                const topIsPlaceholder = isPlaceholderTeamName(match.top);
                const bottomIsPlaceholder = isPlaceholderTeamName(match.bottom);
                const isPendingMatch = match.raw.status !== 'finished';
                const isUndecidedMatch = topIsPlaceholder || bottomIsPlaceholder;
                const rowPaddingClass = getRowPaddingClass(layout.profile, compact);
                const cardRadiusClass = getCardRadiusClass(layout.profile, compact);
                const finalCardVisuals = getFinalCardVisuals(layout.profile, compact, match.raw.status === 'finished');
                const finalWinnerRailClass = placement.side === 'right' ? 'right-0' : 'left-0';

                return (
                  <div
                    key={match.uid}
                    className={`absolute overflow-hidden ${cardRadiusClass} border transition-opacity ${placement.side === 'right' ? 'text-right' : 'text-left'} ${isFinal ? `${finalCardVisuals.frameClass} bg-[linear-gradient(180deg,rgba(68,52,13,0.9),rgba(15,21,35,0.98))]` : 'border-white/10 bg-[linear-gradient(180deg,rgba(19,34,61,0.94),rgba(10,19,36,0.96))] shadow-[0_12px_30px_rgba(0,0,0,0.26)]'} ${isUndecidedMatch && isPendingMatch ? 'opacity-[0.88]' : 'opacity-100'}`}
                    style={{ left: `${placement.x}px`, top: `${placement.y}px`, width: `${layout.profile.matchWidth}px`, height: `${layout.profile.matchHeight}px` }}
                  >
                    <div className={`absolute inset-0 ${isUndecidedMatch ? 'bg-[linear-gradient(120deg,rgba(148,163,184,0.08),transparent_55%,rgba(148,163,184,0.06))]' : 'bg-[linear-gradient(120deg,rgba(97,230,255,0.08),transparent_55%,rgba(139,92,246,0.08))]'}`} />
                    {isFinal && <div className={`absolute inset-0 ${finalCardVisuals.glowClass}`} />}
                    {isFinal && finalCardVisuals.badgeVisible && (
                      <div className={`absolute z-10 inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-slate-950/70 font-black uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)] backdrop-blur-md ${finalCardVisuals.badgeClass}`}>
                        <Trophy className="h-3 w-3" />
                        <span>{t('finale')}</span>
                      </div>
                    )}
                    {isFinal && (isWinnerA || isWinnerB) && (
                      <div className={`absolute ${finalWinnerRailClass} top-0 z-10 h-full ${finalCardVisuals.railWidthClass} bg-[linear-gradient(180deg,rgba(252,211,77,0.9),rgba(245,158,11,0.36))]`} />
                    )}

                    <div className={`relative z-10 flex h-1/2 items-center gap-2 border-b border-white/10 ${rowPaddingClass} ${placement.side === 'right' ? 'justify-end' : 'justify-between'} ${getMatchRowClass({ isWinner: isWinnerA, isPlaceholder: topIsPlaceholder, isFinal, isSemifinal })}`}>
                      <TeamLine
                        name={match.top}
                        score={getTeamOutcomeLabel(match.raw, 'A')}
                        placementSide={placement.side}
                        profile={layout.profile}
                        compact={compact}
                        winner={isWinnerA}
                        pendingAriaLabel={t('to_be_defined')}
                        scoreAriaLabel={t('score_label')}
                      />
                    </div>

                    <div className={`relative z-10 flex h-1/2 items-center gap-2 ${rowPaddingClass} ${placement.side === 'right' ? 'justify-end' : 'justify-between'} ${getMatchRowClass({ isWinner: isWinnerB, isPlaceholder: bottomIsPlaceholder, isFinal, isSemifinal })}`}>
                      <TeamLine
                        name={match.bottom}
                        score={getTeamOutcomeLabel(match.raw, 'B')}
                        placementSide={placement.side}
                        profile={layout.profile}
                        compact={compact}
                        winner={isWinnerB}
                        pendingAriaLabel={t('to_be_defined')}
                        scoreAriaLabel={t('score_label')}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,#07111f,#0c1d35_44%,#173056)] shadow-[0_18px_40px_rgba(0,0,0,0.34)] text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(97,230,255,0.18),transparent_20%),radial-gradient(circle_at_80%_15%,rgba(139,92,246,0.16),transparent_22%),radial-gradient(circle_at_70%_80%,rgba(41,214,255,0.08),transparent_18%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[48%] w-[28%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(255,209,102,0.12),transparent_60%)] blur-2xl" />

      <div className={compact ? 'absolute inset-x-2.5 top-2.5 z-10 flex items-start justify-between gap-2' : denseLayout ? 'absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2.5' : 'absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-3'}>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 shadow-lg backdrop-blur-md ${compact ? 'px-3 py-1.5' : denseLayout ? 'px-3.5 py-1.5' : 'px-4 py-2'}`}>
            <Trophy className={`${compact ? 'h-3.5 w-3.5' : denseLayout ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-cyan-300`} />
            <div className={`${compact ? 'text-[11px]' : denseLayout ? 'text-[12px]' : 'text-sm'} font-black uppercase tracking-[0.18em]`}>{t('admin_tv_bracket')}</div>
          </div>
          {compact ? (
            <>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-100 backdrop-blur-md">
                <span className="text-slate-300">{t('turns_label')}</span>
                <strong>{turni}</strong>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-100 backdrop-blur-md">
                <span className="text-slate-300">{t('teams')}</span>
                <strong>{totalTeams}</strong>
              </div>
            </>
          ) : (
            <>
              <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}>
                <span className="text-slate-300">{t('teams')}</span>
                <strong>{totalTeams}</strong>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md ${denseLayout ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}>
                <span className="text-slate-300">{t('turns_label')}</span>
                <strong>{turni}</strong>
              </div>
              {!denseLayout && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-100 backdrop-blur-md">
                  <span className="text-slate-300">{t('bye_label')}</span>
                  <strong>{byeCount}</strong>
                </div>
              )}
            </>
          )}
        </div>
        {!compact && !denseLayout && (
          <div className="hidden md:inline-flex items-center rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-md">
            {t('tv_read_only_169')}
          </div>
        )}
      </div>

      <div className={`absolute z-10 rounded-full border border-white/10 bg-slate-950/55 text-slate-200 backdrop-blur-md ${compact ? 'bottom-2.5 left-2.5 px-2.5 py-1.5 text-[9px] tracking-[0.18em]' : denseLayout ? 'bottom-3 left-3 px-2.5 py-1.5 text-[9px] tracking-[0.18em]' : 'bottom-4 left-4 px-3 py-2 text-[10px] tracking-[0.2em]'} font-black uppercase`}>
        {compact || denseLayout ? t('final_central_zero_click') : t('final_central_bye_hidden_zero_click')}
      </div>

      {!compact && !denseLayout && (
        <div className="absolute bottom-4 right-4 z-10 flex flex-wrap justify-end gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-cyan-300" /> {t('bracket_word')}</div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-amber-300" /> {t('finale')}</div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 backdrop-blur-md"><span className="h-2 w-2 rounded-full bg-slate-400" /> TBD</div>
        </div>
      )}

      <div ref={viewportRef} className={viewportClassName}>
        {layout && (
          <div
            className="absolute left-0 top-0"
            style={{
              width: `${layout.stageWidth}px`,
              height: `${layout.stageHeight}px`,
              transform: `translate(${layout.offsetX}px, ${layout.offsetY}px) scale(${layout.scale})`,
              transformOrigin: 'top left',
            }}
          >
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${layout.stageWidth} ${layout.stageHeight}`} aria-hidden="true">
              {lines}
            </svg>

            {layout.labels.map((label) => {
              const displayText = localizeRoundLabel(label.text, compact);
              const labelStyle = getLabelStyle(displayText, layout.profile.labelSize, compact, label.side, layout.profile);
              const labelClassName = getLabelClassName(label.side, compact, layout.profile);

              return (
                <div
                  key={label.key}
                  className={`absolute -translate-x-1/2 rounded-full border py-1 text-center font-black tracking-[0.18em] ${labelClassName}`}
                  style={{ left: `${label.x}px`, top: `${label.y}px`, ...labelStyle }}
                  title={label.text}
                >
                  {displayText}
                </div>
              );
            })}

            {visibleMatches.map((match) => {
              const placement = layout.placements[match.uid];
              if (!placement) return null;

              const isFinal = match.roundIndex === resolvedRounds.length - 1;
              const isSemifinal = match.roundIndex === resolvedRounds.length - 2;
              const isWinnerA = match.raw.status === 'finished' && match.raw.scoreA > match.raw.scoreB;
              const isWinnerB = match.raw.status === 'finished' && match.raw.scoreB > match.raw.scoreA;
              const topIsPlaceholder = isPlaceholderTeamName(match.top);
              const bottomIsPlaceholder = isPlaceholderTeamName(match.bottom);
              const isPendingMatch = match.raw.status !== 'finished';
              const isUndecidedMatch = topIsPlaceholder || bottomIsPlaceholder;
              const rowPaddingClass = getRowPaddingClass(layout.profile, compact);
              const cardRadiusClass = getCardRadiusClass(layout.profile, compact);
              const finalCardVisuals = getFinalCardVisuals(layout.profile, compact, match.raw.status === 'finished');
              const finalWinnerRailClass = placement.side === 'right' ? 'right-0' : 'left-0';

              return (
                <div
                  key={match.uid}
                  className={`absolute overflow-hidden ${cardRadiusClass} border transition-opacity ${placement.side === 'right' ? 'text-right' : 'text-left'} ${isFinal ? `${finalCardVisuals.frameClass} bg-[linear-gradient(180deg,rgba(68,52,13,0.9),rgba(15,21,35,0.98))]` : 'border-white/10 bg-[linear-gradient(180deg,rgba(19,34,61,0.94),rgba(10,19,36,0.96))] shadow-[0_12px_30px_rgba(0,0,0,0.26)]'} ${isUndecidedMatch && isPendingMatch ? 'opacity-[0.88]' : 'opacity-100'}`}
                  style={{ left: `${placement.x}px`, top: `${placement.y}px`, width: `${layout.profile.matchWidth}px`, height: `${layout.profile.matchHeight}px` }}
                >
                  <div className={`absolute inset-0 ${isUndecidedMatch ? 'bg-[linear-gradient(120deg,rgba(148,163,184,0.08),transparent_55%,rgba(148,163,184,0.06))]' : 'bg-[linear-gradient(120deg,rgba(97,230,255,0.08),transparent_55%,rgba(139,92,246,0.08))]'}`} />
                  {isFinal && <div className={`absolute inset-0 ${finalCardVisuals.glowClass}`} />}
                  {isFinal && finalCardVisuals.badgeVisible && (
                    <div className={`absolute z-10 inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-slate-950/70 font-black uppercase tracking-[0.18em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.14)] backdrop-blur-md ${finalCardVisuals.badgeClass}`}>
                      <Trophy className="h-3 w-3" />
                      <span>{t('finale')}</span>
                    </div>
                  )}
                  {isFinal && (isWinnerA || isWinnerB) && (
                    <div className={`absolute ${finalWinnerRailClass} top-0 z-10 h-full ${finalCardVisuals.railWidthClass} bg-[linear-gradient(180deg,rgba(252,211,77,0.9),rgba(245,158,11,0.36))]`} />
                  )}

                  <div className={`relative z-10 flex h-1/2 items-center gap-2 border-b border-white/10 ${rowPaddingClass} ${placement.side === 'right' ? 'justify-end' : 'justify-between'} ${getMatchRowClass({ isWinner: isWinnerA, isPlaceholder: topIsPlaceholder, isFinal, isSemifinal })}`}>
                    <TeamLine
                      name={match.top}
                      score={getTeamOutcomeLabel(match.raw, 'A')}
                      placementSide={placement.side}
                      profile={layout.profile}
                      compact={compact}
                      winner={isWinnerA}
                      pendingAriaLabel={t('to_be_defined')}
                      scoreAriaLabel={t('score_label')}
                    />
                  </div>

                  <div className={`relative z-10 flex h-1/2 items-center gap-2 ${rowPaddingClass} ${placement.side === 'right' ? 'justify-end' : 'justify-between'} ${getMatchRowClass({ isWinner: isWinnerB, isPlaceholder: bottomIsPlaceholder, isFinal, isSemifinal })}`}>
                    <TeamLine
                      name={match.bottom}
                      score={getTeamOutcomeLabel(match.raw, 'B')}
                      placementSide={placement.side}
                      profile={layout.profile}
                      compact={compact}
                      winner={isWinnerB}
                      pendingAriaLabel={t('to_be_defined')}
                      scoreAriaLabel={t('score_label')}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
