import type { AppState } from './storageService';
import type { PlayerProfileSnapshot } from '../types';
import type { PlayerAccountAdminRow } from './playerAppService';
import { buildPlayerProfileSnapshots } from './playerDataProvenance';
import { getPlayerKey, normalizeBirthDateInput, resolvePlayerKey } from './playerIdentity';
import { mergeAliasIntoBirthdatedProfile } from './playerProfileAdmin';
import { normalizeNameLower, splitCanonicalPlayerName } from './textUtils';

export type PlayerAccountAliasConfidence = 'high' | 'medium';
export type PlayerAccountAliasReason =
  | 'same_birthdate'
  | 'exact_name'
  | 'close_name'
  | 'existing_stats';

export type PlayerAccountAliasMergeMode =
  | 'candidate_into_account'
  | 'account_into_candidate'
  | 'alias_candidate_into_account';

export interface PlayerAccountAliasSuggestion {
  id: string;
  accountId: string;
  sourcePlayerId: string;
  candidatePlayerId: string;
  candidateDisplayName: string;
  candidateBirthDate?: string;
  candidateBirthDateLabel: string;
  confidence: PlayerAccountAliasConfidence;
  reasons: PlayerAccountAliasReason[];
  mergeMode: PlayerAccountAliasMergeMode;
  candidateTotalTitles: number;
  candidateTotalCanestri: number;
  candidateTotalSoffi: number;
  candidateAliasCount: number;
}

interface MergeResult {
  state: AppState;
  nextCanonicalPlayerId: string;
  nextCanonicalPlayerName: string;
  nextBirthDate?: string;
}

const deaccent = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeComparable = (value: string) => normalizeNameLower(deaccent(value));

const compactComparable = (value: string) => normalizeComparable(value).replace(/\s+/g, '');

const extractBirthDateFromPlayerId = (playerId: string): string | undefined => {
  const match = String(playerId || '').trim().match(/_(\d{4}-\d{2}-\d{2})$/i);
  return normalizeBirthDateInput(match?.[1] || undefined);
};

const isUndatedPlayerId = (playerId: string) => /_ND$/i.test(String(playerId || '').trim());

const getBirthDateLabel = (birthDate?: string) => {
  if (!birthDate) return 'ND';
  const normalized = normalizeBirthDateInput(birthDate);
  if (!normalized) return 'ND';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
};

const hasPrefixCompatibility = (left: string, right: string) => {
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  if (minLength < 4) return left[0] === right[0];
  return left.startsWith(right) || right.startsWith(left);
};

const compareCanonicalNames = (leftRaw: string, rightRaw: string) => {
  const left = splitCanonicalPlayerName(leftRaw);
  const right = splitCanonicalPlayerName(rightRaw);
  const leftFirst = normalizeComparable(left.firstName);
  const leftLast = normalizeComparable(left.lastName);
  const rightFirst = normalizeComparable(right.firstName);
  const rightLast = normalizeComparable(right.lastName);

  const exactName =
    normalizeComparable(leftRaw) === normalizeComparable(rightRaw)
    || compactComparable(leftRaw) === compactComparable(rightRaw);

  const closeName =
    !!leftLast
    && !!rightLast
    && leftLast === rightLast
    && hasPrefixCompatibility(leftFirst, rightFirst);

  return {
    exactName,
    closeName,
  };
};

export const getPlayerAccountAliasIgnoreKey = (accountId: string, candidatePlayerId: string) =>
  `${String(accountId || '').trim()}::${String(candidatePlayerId || '').trim()}`;

const collectSuggestionReasons = (
  sourceName: string,
  sourceBirthDate: string | undefined,
  candidate: PlayerProfileSnapshot
): {
  confidence: PlayerAccountAliasConfidence;
  reasons: PlayerAccountAliasReason[];
} | null => {
  const candidateBirthDate = extractBirthDateFromPlayerId(candidate.playerId);
  if (sourceBirthDate && candidateBirthDate && sourceBirthDate !== candidateBirthDate) {
    return null;
  }

  const names = compareCanonicalNames(sourceName, candidate.displayName || '');
  if (!names.exactName && !names.closeName) return null;

  const reasons: PlayerAccountAliasReason[] = [];
  let confidence: PlayerAccountAliasConfidence = 'medium';

  if (sourceBirthDate && candidateBirthDate && sourceBirthDate === candidateBirthDate) {
    reasons.push('same_birthdate');
    confidence = 'high';
  }

  if (names.exactName) {
    reasons.push('exact_name');
    if (!sourceBirthDate || !candidateBirthDate) confidence = 'high';
  } else if (names.closeName) {
    reasons.push('close_name');
  }

  if (candidate.totalTitles > 0 || candidate.totalCanestri > 0 || candidate.totalSoffi > 0) {
    reasons.push('existing_stats');
  }

  return { confidence, reasons };
};

const dedupeReasons = (reasons: PlayerAccountAliasReason[]) => Array.from(new Set(reasons));

export const buildPlayerAccountAliasSuggestions = (
  state: AppState,
  row: PlayerAccountAdminRow
): PlayerAccountAliasSuggestion[] => {
  const sourcePlayerIdRaw = String(row.canonicalPlayerId || '').trim();
  const sourcePlayerId = resolvePlayerKey(state, sourcePlayerIdRaw);
  const sourceName = String(row.linkedPlayerName || '').trim();
  const sourceBirthDate = normalizeBirthDateInput(row.birthDate || extractBirthDateFromPlayerId(sourcePlayerIdRaw) || undefined);
  if (!sourcePlayerIdRaw || !sourcePlayerId || !sourceName) return [];

  const ignored = state.playerAccountAliasIgnores || {};
  const sourceAlreadyAliased = sourcePlayerId !== sourcePlayerIdRaw;
  if (sourceAlreadyAliased) return [];

  return buildPlayerProfileSnapshots(state)
    .filter((profile) => profile.playerId !== sourcePlayerId)
    .map((candidate) => {
      const match = collectSuggestionReasons(sourceName, sourceBirthDate, candidate);
      if (!match) return null;

      const candidateBirthDate = extractBirthDateFromPlayerId(candidate.playerId);
      const mergeMode: PlayerAccountAliasMergeMode =
        sourceBirthDate && !candidateBirthDate
          ? 'candidate_into_account'
          : !sourceBirthDate && !!candidateBirthDate
            ? 'account_into_candidate'
            : 'alias_candidate_into_account';

      const id = getPlayerAccountAliasIgnoreKey(row.id, candidate.playerId);
      if (ignored[id]) return null;

      return {
        id,
        accountId: row.id,
        sourcePlayerId,
        candidatePlayerId: candidate.playerId,
        candidateDisplayName: candidate.displayName,
        candidateBirthDate,
        candidateBirthDateLabel: getBirthDateLabel(candidateBirthDate),
        confidence: match.confidence,
        reasons: dedupeReasons(match.reasons),
        mergeMode,
        candidateTotalTitles: candidate.totalTitles,
        candidateTotalCanestri: candidate.totalCanestri,
        candidateTotalSoffi: candidate.totalSoffi,
        candidateAliasCount: candidate.aliasCount,
      } satisfies PlayerAccountAliasSuggestion;
    })
    .filter(Boolean)
    .sort((left, right) => {
      const confidenceDiff =
        (left!.confidence === 'high' ? 1 : 0) - (right!.confidence === 'high' ? 1 : 0);
      if (confidenceDiff !== 0) return confidenceDiff * -1;
      const leftScore = left!.candidateTotalTitles * 1000 + left!.candidateTotalCanestri * 10 + left!.candidateTotalSoffi;
      const rightScore = right!.candidateTotalTitles * 1000 + right!.candidateTotalCanestri * 10 + right!.candidateTotalSoffi;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left!.candidateDisplayName.localeCompare(right!.candidateDisplayName, 'it', { sensitivity: 'base' });
    }) as PlayerAccountAliasSuggestion[];
};

export const ignorePlayerAccountAliasSuggestion = (
  state: AppState,
  suggestion: Pick<PlayerAccountAliasSuggestion, 'id'>
): AppState => {
  const next = {
    ...(state.playerAccountAliasIgnores || {}),
    [suggestion.id]: Date.now(),
  };
  return {
    ...state,
    playerAccountAliasIgnores: next,
  };
};

const clearIgnoredSuggestion = (state: AppState, suggestionId: string): AppState => {
  if (!state.playerAccountAliasIgnores?.[suggestionId]) return state;
  const nextIgnores = { ...(state.playerAccountAliasIgnores || {}) };
  delete nextIgnores[suggestionId];
  return {
    ...state,
    playerAccountAliasIgnores: nextIgnores,
  };
};

export const applyPlayerAccountAliasSuggestion = (
  state: AppState,
  row: PlayerAccountAdminRow,
  suggestion: PlayerAccountAliasSuggestion
): MergeResult => {
  const sourcePlayerId = resolvePlayerKey(state, String(row.canonicalPlayerId || '').trim());
  const candidatePlayerId = resolvePlayerKey(state, suggestion.candidatePlayerId);
  const sourceName = String(row.linkedPlayerName || '').trim();
  const sourceBirthDate = normalizeBirthDateInput(row.birthDate || extractBirthDateFromPlayerId(String(row.canonicalPlayerId || '').trim()) || undefined);
  const candidateBirthDate = normalizeBirthDateInput(suggestion.candidateBirthDate || undefined);

  if (!sourcePlayerId || !candidatePlayerId || !sourceName || sourcePlayerId === candidatePlayerId) {
    throw new Error('Suggerimento alias non valido.');
  }

  let nextState = clearIgnoredSuggestion(state, suggestion.id);
  let nextCanonicalPlayerId = sourcePlayerId;
  let nextCanonicalPlayerName = sourceName;
  let nextBirthDate = sourceBirthDate;

  if (suggestion.mergeMode === 'candidate_into_account') {
    nextState = mergeAliasIntoBirthdatedProfile(nextState, {
      sourcePlayerId: candidatePlayerId,
      targetPlayerId: sourcePlayerId,
      targetPlayerName: sourceName,
    });
  } else if (suggestion.mergeMode === 'account_into_candidate') {
    nextState = mergeAliasIntoBirthdatedProfile(nextState, {
      sourcePlayerId: sourcePlayerId,
      targetPlayerId: candidatePlayerId,
      targetPlayerName: suggestion.candidateDisplayName,
    });
    nextCanonicalPlayerId = candidatePlayerId;
    nextCanonicalPlayerName = suggestion.candidateDisplayName;
    nextBirthDate = candidateBirthDate;
  } else {
    nextState = {
      ...nextState,
      playerAliases: {
        ...(nextState.playerAliases || {}),
        [candidatePlayerId]: sourcePlayerId,
      },
    };
  }

  return {
    state: nextState,
    nextCanonicalPlayerId,
    nextCanonicalPlayerName,
    nextBirthDate,
  };
};

export const buildPlayerAccountAliasTargetProfilePayload = (
  canonicalPlayerName: string,
  birthDate?: string
) => {
  const parts = splitCanonicalPlayerName(canonicalPlayerName);
  const firstName = String(parts.firstName || '').trim();
  const lastName = String(parts.lastName || '').trim();
  const normalizedBirthDate = normalizeBirthDateInput(birthDate || undefined);
  return {
    firstName,
    lastName,
    birthDate: normalizedBirthDate,
    canonicalPlayerId: getPlayerKey(canonicalPlayerName, normalizedBirthDate || 'ND'),
    canonicalPlayerName,
  };
};

export const shouldSyncAccountCanonicalAfterAliasMerge = (
  suggestion: PlayerAccountAliasSuggestion
) => suggestion.mergeMode === 'account_into_candidate';
