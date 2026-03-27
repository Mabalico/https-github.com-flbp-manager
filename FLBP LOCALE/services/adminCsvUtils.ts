export const decodeCsvText = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);

    const decodeWith = (enc: string) => {
        try {
            return new TextDecoder(enc as any, { fatal: false }).decode(bytes);
        } catch {
            return '';
        }
    };

    // Try UTF-8 first, then fall back to Windows-1252 if it looks broken.
    let text = decodeWith('utf-8');
    if (!text || text.includes('\uFFFD')) {
        const alt = decodeWith('windows-1252');
        if (alt) text = alt;
    }

    // Strip UTF-8 BOM if present.
    return text.replace(/^\uFEFF/, '');
};

export const detectCsvSeparator = (text: string): string => {
    const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
    const count = (c: string) => (sample.match(new RegExp('\\' + c, 'g')) || []).length;
    const counts = {
        ';': count(';'),
        ',': count(','),
        '\t': (sample.match(/\t/g) || []).length,
    };
    if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) return '\t';
    return counts[';'] > counts[','] ? ';' : ',';
};

export const parseCsvRows = (text: string, sep: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = text[i + 1];
                if (next === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }

        if (ch === sep) {
            row.push(field);
            field = '';
            continue;
        }

        if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            // push row if not empty
            const cleaned = row.map(v => (v ?? '').toString().trim());
            if (cleaned.some(v => v !== '')) rows.push(cleaned);
            row = [];
            continue;
        }

        field += ch;
    }

    row.push(field);
    const cleaned = row.map(v => (v ?? '').toString().trim());
    if (cleaned.some(v => v !== '')) rows.push(cleaned);
    return rows;
};
