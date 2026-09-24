import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const playwright = require(process.env.FLBP_PLAYWRIGHT_MODULE || 'playwright');
const mutant = process.argv.includes('--prove-regression');
const server = await createServer({
  configFile: path.join(root, 'vite.fanta-navigation-tests.config.ts'),
  plugins: mutant ? [{
    name: 'prove-fixed-fanta-back-callback-is-rejected',
    enforce: 'pre',
    transform(source, id) {
      if (path.normalize(id.split('?')[0]) !== path.join(root, 'App.tsx')) return;
      const target = "navigateToView(fantaOriginViewRef.current)";
      assert.equal(source.split(target).length - 1, 1, 'exactly one App Fanta return callback');
      return source.replace(target, "navigateToView('player_area')");
    },
  }] : [],
});
let browser;
const errors = [];
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.FLBP_BROWSER_EXECUTABLE ? { executablePath: process.env.FLBP_BROWSER_EXECUTABLE } : {}),
  });
  const makePage = async (viewport = { width: 1440, height: 960 }) => {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : (errors.push('External request: ' + route.request().url()), route.abort()));
    await context.addInitScript(() => localStorage.setItem('fixture-existing-draft', '{"kept":true}'));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/tests/ui/fantaNavigation.html');
    await page.getByRole('heading', { name: 'Tornei', exact: true }).waitFor();
    return { context, page };
  };
  const menu = async (page, name) => {
    await page.getByRole('button', { name: 'Apri menu', exact: true }).click();
    await page.getByRole('button', { name, exact: typeof name === 'string' }).last().click();
  };
  const fanta = page => page.getByRole('heading', { name: 'Torneo Fanta concluso', exact: true });
  const home = page => page.getByRole('heading', { name: 'Tornei', exact: true });
  const back = page => page.getByRole('button', { name: 'Indietro', exact: true }).click();
  const mode = async (page, button, value) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByLabel('Stato guard fixture').filter({ hasText: value }).waitFor();
  };
  const arm = page => mode(page, 'Arma guard fixture', 'confirm');
  const disarm = page => mode(page, 'Disattiva guard fixture', 'off');
  const busy = page => mode(page, 'Simula salvataggio fixture', 'saving');
  const dialog = page => page.getByRole('alertdialog', { name: 'Bozza fixture' });
  const cancel = page => page.getByRole('button', { name: 'Resta nella bozza fixture', exact: true }).click();
  const confirm = page => page.getByRole('button', { name: 'Conferma uscita fixture', exact: true }).click();

  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const { context, page } = await makePage(viewport);
    await menu(page, /FantaBeerpong/);
    await fanta(page).waitFor();
    // Selecting Fanta again must not replace its origin with itself.
    await menu(page, /FantaBeerpong/);
    await back(page);
    if (mutant) {
      await page.getByRole('button', { name: 'Registrati', exact: true }).waitFor();
      await assert.rejects(home(page).waitFor({ timeout: 700 }), /Timeout/);
      console.log('PASS negative control: old fixed player_area callback fails Home return');
      await context.close();
      break;
    }
    await home(page).waitFor();
    await menu(page, 'Area Giocatore');
    await page.getByRole('button', { name: 'Registrati', exact: true }).waitFor();
    await menu(page, /FantaBeerpong/);
    await fanta(page).waitFor();
    await page.getByRole('button', { name: /Rivedi il regolamento/ }).click();
    await page.getByText('Regole essenziali della modalità Fanta', { exact: true }).waitFor();
    await back(page);
    await fanta(page).waitFor();
    await back(page);
    await page.getByRole('button', { name: 'Registrati', exact: true }).waitFor();
    await menu(page, /FantaBeerpong/);
    await fanta(page).waitFor();
    await page.getByRole('button', { name: 'Ricarica in Fanta fixture', exact: true }).click();
    await fanta(page).waitFor();
    await back(page);
    await home(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('fixture-existing-draft')), '{"kept":true}');
    console.log('PASS App Home/Player origins, Fanta reselect, inner Rules return, reload fallback, storage at ' + viewport.width + 'px');

    await arm(page);
    await menu(page, /FantaBeerpong/);
    await dialog(page).waitFor();
    await cancel(page);
    await home(page).waitFor();
    await menu(page, /FantaBeerpong/);
    await dialog(page).waitFor();
    await menu(page, 'Tornei');
    await confirm(page);
    await fanta(page).waitFor();
    await disarm(page);
    await back(page);
    await home(page).waitFor();
    console.log('PASS App guard cancellation and pending destination preserved at ' + viewport.width + 'px');
    await context.close();
  }

  if (!mutant) {
    for (const stateAfterClick of ['dirty', 'saving']) {
      const { context, page } = await makePage();
      let resumePreload;
      const intercepted = new Promise(resolve => {
        page.route('**/components/FantaBeerpong.tsx*', route => {
          resumePreload = () => route.continue();
          resolve();
        });
      });
      await menu(page, /FantaBeerpong/);
      await Promise.race([intercepted, new Promise((_, reject) => setTimeout(() => reject(new Error('Fanta preload was not intercepted')), 10000))]);
      if (stateAfterClick === 'dirty') await arm(page);
      else await busy(page);
      await resumePreload();
      await page.getByLabel('Richieste guard fixture').filter({ hasText: '1' }).waitFor();
      if (stateAfterClick === 'dirty') {
        await dialog(page).waitFor();
        await cancel(page);
      }
      await home(page).waitFor();
      assert.equal(await fanta(page).count(), 0);
      console.log('PASS guard rechecks ' + stateAfterClick + ' created while the real App Fanta preload was suspended');
      await context.close();
    }

    const { context, page } = await makePage();
    await menu(page, 'Area Admin');
    await page.getByRole('heading', { name: 'Admin fixture', exact: true }).waitFor();
    await arm(page);
    await page.getByRole('button', { name: 'Apri TV fixture', exact: true }).click();
    await dialog(page).waitFor();
    await cancel(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('flbp_tv_mode')), null);
    await busy(page);
    await page.getByRole('button', { name: 'Apri TV fixture', exact: true }).click();
    await page.getByLabel('Richieste guard fixture').filter({ hasText: '2' }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('flbp_tv_mode')), null);
    await arm(page);
    await page.getByRole('button', { name: 'Apri TV fixture', exact: true }).click();
    await dialog(page).waitFor();
    await confirm(page);
    await page.waitForFunction(() => localStorage.getItem('flbp_tv_mode') === 'groups');
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Admin fixture', exact: true }).waitFor();
    console.log('PASS App TV entry guard cancel/busy/confirm; existing Escape returns from TV');
    await context.close();
  }
  assert.deepEqual(errors, [], 'no page errors or external requests');
} finally {
  await browser?.close();
  await server.close();
}
