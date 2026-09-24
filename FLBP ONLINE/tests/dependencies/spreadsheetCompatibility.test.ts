import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getXLSX } from '../../services/lazyXlsx';
import { readScorersFile } from '../../services/scorersImport';

for (const format of ['xlsx', 'biff8'] as const) {
  test(`${format} export/import preserves Unicode player names, calendar dates and totals`, async () => {
    const XLSX = await getXLSX();
    const workbook = XLSX.utils.book_new();
    const source = [
      { Nome: 'François', Cognome: 'Müller', DataNascita: new Date(1994, 6, 13), Partite: 4, Canestri: 20, Soffi: 2 },
      { Nome: 'Иван', Cognome: 'Петров', DataNascita: new Date(1989, 2, 26), Partite: 3, Canestri: 15, Soffi: 1 },
      { Nome: '明', Cognome: '李', DataNascita: new Date(2000, 0, 4), Partite: 2, Canestri: 8, Soffi: 0 },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(source, { cellDates: true }), 'Marcatori');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: format, cellDates: true });
    const rows = await readScorersFile(new File([bytes], `marcatori.${format === 'xlsx' ? 'xlsx' : 'xls'}`));
    assert.deepEqual(rows.map(({ name, birthDate, games, points, soffi }) => ({ name, birthDate, games, points, soffi })), [
      { name: 'Müller François', birthDate: '1994-07-13', games: 4, points: 20, soffi: 2 },
      { name: 'Петров Иван', birthDate: '1989-03-26', games: 3, points: 15, soffi: 1 },
      { name: '李 明', birthDate: '2000-01-04', games: 2, points: 8, soffi: 0 },
    ]);
  });
}

test('legacy BIFF5 XLS decodes the stored Windows-1251 codepage without corrupting identity', async () => {
  const bytes = fs.readFileSync(process.env.FLBP_SPREADSHEET_FIXTURE!);
  const rows = await readScorersFile(new File([bytes], 'legacy-cp1251.xls'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Иван Петров');
  assert.equal(rows[0].birthDate, '1994-07-13');
  assert.equal(rows[0].games, 4);
  assert.equal(rows[0].points, 20);
  assert.equal(rows[0].soffi, 2);
});

test('UTF-8 CSV still imports accented names and dates through the shared file reader', async () => {
  const content = '\uFEFFNome;Cognome;DataNascita;Partite;Canestri;Soffi\nFrançois;Müller;13/07/1994;4;20;2\n';
  const rows = await readScorersFile(new File([content], 'marcatori.csv', { type: 'text/csv' }));
  assert.equal(rows[0].name, 'Müller François');
  assert.equal(rows[0].birthDate, '1994-07-13');
  assert.equal(rows[0].points, 20);
});
