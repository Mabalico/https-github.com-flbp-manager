import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// CI may install Playwright separately; no app dependency is needed.
const playwright = require(process.env.FLBP_PLAYWRIGHT_MODULE || 'playwright');
const mutant = process.argv.includes('--prove-regression');
const server = await createServer({
  configFile: path.join(root, 'vite.fanta-rules-tests.config.ts'),
  plugins: mutant ? [{
    name: 'prove-fanta-rules-click-regression',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replaceAll('\\\\', '/').endsWith('/components/fantabeerpong/FantaHistorySection.tsx')) return;
      const target = 'onClick={onOpenRules}';
      assert.equal(source.split(target).length - 1, 1, 'the real history CTA must be uniquely identified');
      return source.replace(target, 'onClick={() => {}}');
    },
  }] : [],
});
let browser;
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.FLBP_BROWSER_EXECUTABLE ? { executablePath: process.env.FLBP_BROWSER_EXECUTABLE } : {}),
  });
  const errors = [];
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    // Fail closed before page scripts run: no network outside the local fixture.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : (errors.push('External request: ' + route.request().url()), route.abort()));
    await context.addInitScript(() => localStorage.setItem('fixture-roster-draft', '{"players":["kept"]}'));
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.setDefaultNavigationTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/tests/ui/fantaArchivedRules.html');
    await page.getByRole('heading', { name: 'Torneo Fanta concluso', exact: true }).waitFor();
    await page.getByRole('button', { name: /Coppa Fixture/ }).waitFor();
    await page.getByRole('button', { name: /Rivedi il regolamento/ }).click();
    const rules = page.getByText('Regole essenziali della modalità Fanta', { exact: true });
    if (mutant) {
      await assert.rejects(rules.waitFor({ timeout: 700 }), /Timeout/);
      console.log('PASS negative control: disconnected real CTA is rejected');
      await context.close();
      break;
    }
    await rules.waitFor();
    assert.equal(await page.getByRole('button', { name: /Controlla la mia squadra|Verifica la tua rosa|Apri la classifica generale/ }).count(), 0);
    await page.getByRole('button', { name: 'Posso cambiare i ruoli durante il torneo?', exact: true }).click();
    await page.getByText('No, i ruoli (Capitano e Difensori) sono bloccati insieme alla rosa all\'inizio della prima partita.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Indietro', exact: true }).click();
    await page.getByRole('heading', { name: 'Torneo Fanta concluso', exact: true }).waitFor();
    assert.equal(await rules.count(), 0);
    await page.getByRole('button', { name: /Rivedi il regolamento/ }).click();
    await rules.waitFor();
    await page.getByRole('button', { name: /Vai allo storico/ }).click();
    await page.getByRole('button', { name: /Coppa Fixture/ }).click();
    await page.getByRole('heading', { name: 'Edizione fixture-archive', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Torna allo storico fixture', exact: true }).click();
    await page.getByRole('heading', { name: 'Torneo Fanta concluso', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('fixture-roster-draft')), '{"players":["kept"]}');
    await page.getByRole('button', { name: 'Indietro', exact: true }).click();
    await page.getByRole('heading', { name: 'Origine fixture', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log('PASS archived rules click, FAQ, both returns, archive detail, external back and storage at ' + viewport.width + 'px');

    for (const mode of ['disabled', 'results-only']) {
      await page.goto(origin + '/tests/ui/fantaArchivedRules.html?mode=' + mode);
      await page.getByRole('heading', { name: mode === 'disabled' ? 'Modulo non attivo' : 'Non attivo', exact: true }).waitFor();
      assert.equal(await rules.count(), 0);
      assert.equal(await page.getByRole('button', { name: /Rivedi il regolamento/ }).count(), 0);
    }
    await page.goto(origin + '/tests/ui/fantaArchivedRules.html?mode=active');
    await page.getByText('Panoramica fixture', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Regole', exact: true }).click();
    await rules.waitFor();
    assert.equal(await page.getByRole('button', { name: /Verifica la tua rosa/ }).count(), 1);
    await page.getByRole('button', { name: /Vai allo storico/ }).click();
    await page.getByRole('button', { name: /Coppa Fixture/ }).waitFor();
    console.log('PASS disabled/results-only gates and active rules destinations at ' + viewport.width + 'px');
    await context.close();
  }
  assert.deepEqual(errors, [], 'no page error or external request is allowed');
} finally {
  await browser?.close();
  await server.close();
}
