export type TeamImportLayout = 'team_rows' | 'player_rows';

export interface TeamImportProfile {
  version: 1;
  createdAt: number;
  sourceExt: 'xlsx' | 'csv';
  layout: TeamImportLayout;
  headersNormalized: string[];
}

const TEAM_IMPORT_PROFILE_STORAGE_KEY = 'flbp_team_import_profile_v1';

export const normalizeTeamImportHeader = (raw: string | null | undefined): string =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const headerMatches = (headers: string[], patterns: string[]) => {
  const normalizedPatterns = patterns.map(normalizeTeamImportHeader).filter(Boolean);
  return headers.some((header) => normalizedPatterns.includes(normalizeTeamImportHeader(header)));
};

export const detectTeamImportLayout = (headersRaw: string[]): TeamImportLayout | null => {
  const headers = (headersRaw || []).map(normalizeTeamImportHeader).filter(Boolean);
  const hasTeamName = headerMatches(headers, ['Squadra', 'Team']);
  const hasPlayer1 = headerMatches(headers, ['Giocatore1', 'Giocatore 1', 'Player1', 'Player 1']);
  const hasPlayerRowName = headerMatches(headers, ['Cognome Nome', 'Nome', 'Giocatore', 'Player']);
  if (hasTeamName && hasPlayer1) return 'team_rows';
  if (hasTeamName && hasPlayerRowName) return 'player_rows';
  return null;
};

export const loadTeamImportProfile = (): TeamImportProfile | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEAM_IMPORT_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamImportProfile | null;
    if (!parsed || parsed.version !== 1) return null;
    if (parsed.layout !== 'team_rows' && parsed.layout !== 'player_rows') return null;
    return {
      version: 1,
      createdAt: Number(parsed.createdAt) || Date.now(),
      sourceExt: parsed.sourceExt === 'csv' ? 'csv' : 'xlsx',
      layout: parsed.layout,
      headersNormalized: Array.isArray(parsed.headersNormalized)
        ? parsed.headersNormalized.map(normalizeTeamImportHeader).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
};

export const saveTeamImportProfile = (profile: TeamImportProfile) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      TEAM_IMPORT_PROFILE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        createdAt: Number(profile.createdAt) || Date.now(),
        sourceExt: profile.sourceExt === 'csv' ? 'csv' : 'xlsx',
        layout: profile.layout,
        headersNormalized: Array.isArray(profile.headersNormalized)
          ? profile.headersNormalized.map(normalizeTeamImportHeader).filter(Boolean)
          : [],
      } satisfies TeamImportProfile)
    );
  } catch {
    // ignore storage errors
  }
};

export const getTeamImportHeaderOverlap = (profileHeaders: string[], incomingHeaders: string[]): number => {
  const left = new Set((profileHeaders || []).map(normalizeTeamImportHeader).filter(Boolean));
  const right = new Set((incomingHeaders || []).map(normalizeTeamImportHeader).filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((value) => {
    if (right.has(value)) shared += 1;
  });
  return shared / Math.max(left.size, right.size);
};

export const isTeamImportCoherentWithProfile = (
  profile: TeamImportProfile | null,
  incomingHeaders: string[],
  detectedLayout: TeamImportLayout | null,
): boolean => {
  if (!profile) return true;
  if (detectedLayout && detectedLayout !== profile.layout) return false;
  if (!Array.isArray(profile.headersNormalized) || profile.headersNormalized.length === 0) return true;
  const overlap = getTeamImportHeaderOverlap(profile.headersNormalized, incomingHeaders);
  return overlap >= 0.34;
};


export const describeTeamImportLayout = (layout: TeamImportLayout | null | undefined): string => {
  if (layout === 'team_rows') return 'una riga per squadra';
  if (layout === 'player_rows') return 'una riga per giocatore';
  return 'layout non riconosciuto';
};
