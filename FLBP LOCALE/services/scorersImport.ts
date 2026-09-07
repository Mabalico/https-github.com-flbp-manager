import type { IntegrationScorerEntry } from '../types';
import { buildCanonicalPlayerNameFromParts, normalizeCol } from './textUtils';
import { deriveYoBFromBirthDate, normalizeBirthDateInput } from './playerIdentity';
import { uuid } from './id';
import { decodeCsvText, detectCsvSeparator, parseCsvRows } from './adminCsvUtils';
import { getXLSX } from './lazyXlsx';

export const parseScorersRows = (rows: Array<Record<string, unknown>>, source: string): IntegrationScorerEntry[] => {
    const field = (row: Record<string, unknown>, names: string[]) => {
        const key = Object.keys(row).find(key => names.map(normalizeCol).includes(normalizeCol(key)));
        return key ? String(row[key] ?? '').trim() : '';
    };
    const integer = (value: string) => {
        if (!value) return 0;
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('edition_import_invalid_number');
        return Number(value);
    };
    return rows.flatMap(row => {
        const name = buildCanonicalPlayerNameFromParts(field(row, ['Nome', 'FirstName', 'First Name']), field(row, ['Cognome', 'LastName', 'Last Name', 'Surname']))
            || field(row, ['Nome', 'Giocatore', 'Player', 'CognomeNome', 'Cognome Nome', 'Name']);
        if (!name) return [];
        const rawDate = field(row, ['DataNascita', 'Data di nascita', 'BirthDate', 'DOB', 'NascitaCompleta']);
        const birthDate = normalizeBirthDateInput(rawDate);
        if (rawDate && !birthDate) throw new Error('edition_birth_date_invalid');
        return [{
            id: `sc_${uuid()}`, name, birthDate,
            yob: deriveYoBFromBirthDate(birthDate) || integer(field(row, ['Anno', 'AnnoNascita', 'Year', 'YoB', 'Nascita', 'BirthYear'])) || undefined,
            games: integer(field(row, ['Partite', 'Gare', 'Games', 'Played'])),
            points: integer(field(row, ['Canestri', 'Punti', 'Points', 'PT'])),
            soffi: integer(field(row, ['Soffi', 'SF', 'Blows'])),
            teamName: field(row, ['Squadra', 'Team', 'TeamName']) || undefined,
            createdAt: Date.now(), source, sourceLabel: source, sourceType: 'manual_integration' as const, sourceTournamentId: null,
        }];
    });
};

export const readScorersFile = async (file: File): Promise<IntegrationScorerEntry[]> => {
    if (/\.csv$/i.test(file.name) || file.type.includes('csv')) {
        const text = await decodeCsvText(file);
        const [header, ...data] = parseCsvRows(text, detectCsvSeparator(text));
        if (!header) return [];
        return parseScorersRows(data.map(row => Object.fromEntries(header.map((key, i) => [key, row[i] ?? '']))), file.name);
    }
    const XLSX = await getXLSX();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: '' });
    // Spreadsheet date cells are calendar dates; do not turn local midnight into
    // a different day by converting it to UTC.
    const normalized = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` : value,
    ])));
    return parseScorersRows(normalized, file.name);
};
