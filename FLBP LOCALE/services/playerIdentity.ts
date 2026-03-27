const ISO_BIRTHDATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IT_BIRTHDATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

const isValidCalendarDate = (year: number, month: number, day: number) => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === (month - 1) && date.getUTCDate() === day;
};

export const normalizeBirthDateInput = (raw: string | null | undefined): string | undefined => {
    const value = String(raw || '').trim();
    if (!value) return undefined;

    if (ISO_BIRTHDATE_RE.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return isValidCalendarDate(year, month, day) ? value : undefined;
    }

    if (IT_BIRTHDATE_RE.test(value)) {
        const [day, month, year] = value.split('/').map(Number);
        if (!isValidCalendarDate(year, month, day)) return undefined;
        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    return undefined;
};

export const formatBirthDateDisplay = (raw: string | null | undefined): string => {
    const iso = normalizeBirthDateInput(raw);
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
};

export const deriveYoBFromBirthDate = (raw: string | null | undefined): number | undefined => {
    const iso = normalizeBirthDateInput(raw);
    if (!iso) return undefined;
    const year = parseInt(iso.slice(0, 4), 10);
    return Number.isFinite(year) ? year : undefined;
};

export const pickPlayerIdentityValue = (birthDate?: string | null, _yob?: number | null): string | 'ND' => {
    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    if (normalizedBirthDate) return normalizedBirthDate;
    return 'ND';
};

/**
 * BirthDate-first persisted identity helper.
 * Historic YoB can remain stored as legacy metadata, but it must not guide
 * player identity, alias resolution or U25 classification anymore.
 */
export const pickStoredPlayerIdentityValue = (birthDate?: string | null, _yob?: number | null): string | 'ND' => {
    const normalizedBirthDate = normalizeBirthDateInput(birthDate);
    if (normalizedBirthDate) return normalizedBirthDate;
    return 'ND';
};

export const getPlayerKey = (name: string, identity?: number | 'ND' | string) => {
    const base = (name || '').trim().toLowerCase().replace(/\s+/g, '_');
    // Backward compatible: if identity not provided, keep legacy key.
    if (identity === undefined) return base;
    let suffix: string;
    if (typeof identity === 'string') {
        const normalizedBirthDate = normalizeBirthDateInput(identity);
        if (normalizedBirthDate) suffix = normalizedBirthDate;
        else suffix = identity.trim() || 'ND';
    } else {
        suffix = String(identity);
    }
    return `${base}_${suffix}`;
};

/**
 * Resolve a PlayerKey through the alias map (Option A: logical merge).
 * Follows chains and prevents cycles.
 */
export const resolvePlayerKey = (
    stateOrAliases: { playerAliases?: Record<string, string> } | Record<string, string> | null | undefined,
    key: string
): string => {
    const aliases: Record<string, string> =
        !stateOrAliases
            ? {}
            : ('playerAliases' in (stateOrAliases as any)
                ? (((stateOrAliases as any).playerAliases || {}) as Record<string, string>)
                : ((stateOrAliases as any) as Record<string, string>)) || {};

    let cur = key;
    const seen = new Set<string>();
    while (aliases[cur] && !seen.has(cur)) {
        seen.add(cur);
        cur = aliases[cur];
    }
    return cur;
};

export const getPlayerKeyLabel = (key: string): { name: string; yob: string } => {
    const raw = (key || '').trim();
    const m = raw.match(/_(ND|\d{4}|\d{4}-\d{2}-\d{2})$/i);
    if (!m) return { name: raw.replace(/_/g, ' '), yob: 'ND' };
    const suffix = m[1];
    const yob = ISO_BIRTHDATE_RE.test(suffix) ? formatBirthDateDisplay(suffix) : suffix.toUpperCase();
    const namePart = raw.slice(0, raw.length - m[0].length).replace(/_/g, ' ').trim();
    return { name: namePart, yob };
};

export const isU25 = (identity?: number | string) => {
    const yob = typeof identity === 'string' ? deriveYoBFromBirthDate(identity) : identity;
    if (!yob) return false;
    const currentYear = new Date().getFullYear();
    return (currentYear - yob) < 26;
};
