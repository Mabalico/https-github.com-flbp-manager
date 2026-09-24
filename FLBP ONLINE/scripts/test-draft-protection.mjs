import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const online = root.endsWith('ONLINE');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FLBP_PLAYWRIGHT_MODULE || 'playwright');
const regression = process.argv.find(value => value.startsWith('--prove-'));
const negativeTargets = {
  '--prove-fanta-regression': { phase: 'saved-roster-language-event', message: 'flbp_language must not replace the draft', actual: 'Salvata account-a', expected: 'Bozza saved' },
  '--prove-edition-regression': { phase: 'dirty-edition-account-click', message: 'Account navigation must retain the dirty editor until explicit consent', actual: 0, expected: 1 },
};
if (regression && !negativeTargets[regression]) throw new Error(`Unknown negative control: ${regression}`);
let mutationApplied = false;
let negativePhase = null;
const server = await createServer({
  configFile: path.join(root, 'vite.draft-protection-tests.config.ts'),
  plugins: regression ? [{
    name: 'prove-original-draft-regression', enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/');
      if (regression === '--prove-fanta-regression' && file.endsWith('/FantaTeamBuilder.tsx')) {
        assert(source.includes('}, [accountId, sessionMode]);'));
        mutationApplied = true;
        return source.replace('if (event.key === null || event.key === PLAYER_PRESENCE_KEY) refresh();', 'refresh();')
          .replace("      setStep('info');", '')
          .replace('}, [accountId, sessionMode]);', '}, [session]);');
      }
      if (regression === '--prove-edition-regression' && file.endsWith('/admin/tabs/DataTab.tsx')) {
        assert(source.includes('void requestDraftNavigation(() => setMainSection(section));'));
        mutationApplied = true;
        return source.replace('void requestDraftNavigation(() => setMainSection(section));', 'setMainSection(section);');
      }
    },
  }] : [],
});
let browser;
const errors = [];
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ headless: true, ...(process.env.FLBP_BROWSER_EXECUTABLE ? { executablePath: process.env.FLBP_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : (errors.push('External request: ' + route.request().url()), route.abort()));
  await context.addInitScript(() => localStorage.setItem('flbp_player_presence_v1', JSON.stringify({ accountId: 'account-a', mode: 'live', lastActiveAt: 1 })));
  const page = await context.newPage();
  page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const goto = async query => {
    await page.bringToFront();
    await page.goto(`${origin}/tests/ui/draftProtection.html?${query}`);
    await page.waitForFunction(() => !!window.draftFixture);
  };
  const row = n => page.getByRole('button', { name: `Giocatore ${n}`, exact: true }).last().locator('..').locator('..');
  const add = n => page.getByRole('button', { name: `Giocatore ${n}`, exact: true }).first().locator('..').locator('..').getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const secondTab = await context.newPage();
  await secondTab.goto(`${origin}/tests/ui/draftProtection.html?mode=writer`);
  for (const roster of regression === '--prove-edition-regression' ? [] : ['saved', 'new']) {
    await goto(`mode=fanta&roster=${roster}`);
    await page.getByRole('button', { name: roster === 'saved' ? 'Modifica la selezione' : 'Inizia la selezione', exact: true }).click();
    if (roster === 'saved') {
      await row(3).getByRole('button').last().click();
      await add(5);
      await row(2).getByRole('button', { name: 'Difensore', exact: true }).click();
    } else {
      for (const n of [1, 2, 4, 5]) await add(n);
    }
    await row(4).getByRole('button', { name: 'Capitano', exact: true }).click();
    await row(1).getByRole('button', { name: 'Difensore', exact: true }).click();
    await row(5).getByRole('button', { name: 'Difensore', exact: true }).click();
    await page.getByRole('button', { name: 'Vai al riepilogo', exact: true }).click();
    await page.locator('#teamName').fill(`Bozza ${roster}`);
    assert.equal(await page.locator('#teamName').inputValue(), `Bozza ${roster}`, 'Fanta setup must finish before injecting the storage event');
    const fetches = await page.evaluate(() => window.draftFixture.fetches);
    // Actual cross-document StorageEvents, not a synthetic event dispatched in the editor.
    for (const key of ['flbp_language', 'flbp_remote_draft_owner_seen_v2:other', 'flbp_player_presence_v1']) {
      await page.evaluate(() => { window.__storageObserved = false; window.addEventListener('storage', () => { window.__storageObserved = true; }, { once: true }); });
      await secondTab.evaluate(key => localStorage.setItem(key, key === 'flbp_player_presence_v1' ? JSON.stringify({ accountId: 'account-a', mode: 'live', lastActiveAt: Date.now() }) : String(Date.now())), key);
      await page.waitForFunction(() => window.__storageObserved);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const currentName = await page.locator('#teamName').inputValue();
      assert.deepEqual(errors, [], 'Fanta negative control requires a clean browser/network setup');
      negativePhase = roster === 'saved' && key === 'flbp_language' ? 'saved-roster-language-event' : null;
      assert.equal(currentName, `Bozza ${roster}`, `${key} must not replace the draft`);
      negativePhase = null;
      assert.equal(await page.evaluate(() => window.draftFixture.fetches), fetches, `${key} must not rehydrate the roster`);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('flbp-player-preview-change')));
    await page.getByRole('button', { name: 'Conferma e Salva', exact: true }).click();
    await page.getByText('Errore simulato: bozza conservata', { exact: true }).waitFor();
    const [saved] = await page.evaluate(() => window.draftFixture.saves);
    assert.equal(saved.name, `Bozza ${roster}`);
    assert.deepEqual(saved.lineup.map(slot => [slot.player.id, slot.role]), [['p1', 'defender'], ['p2', 'starter'], ['p4', 'captain'], ['p5', 'defender']]);
    assert.equal(await page.evaluate(() => window.draftFixture.fetches), fetches);
    assert.equal(await page.locator('#teamName').inputValue(), `Bozza ${roster}`, 'failed save retains the draft');
    pass(`Fanta ${roster}: second-tab language/heartbeat/presence + same-account event preserve all draft fields`);
  }
  if (regression !== '--prove-edition-regression') {
    await goto('mode=fanta&roster=saved');
    await page.getByRole('button', { name: 'Modifica la selezione', exact: true }).waitFor();
    await page.evaluate(() => { window.draftFixture.holdReads = true; localStorage.setItem('flbp_player_presence_v1', JSON.stringify({ accountId: 'account-b', mode: 'live' })); window.dispatchEvent(new Event('flbp-player-preview-change')); });
    await page.waitForFunction(() => window.draftFixture.pendingReads.length === 1);
    await page.evaluate(() => { localStorage.removeItem('flbp_player_presence_v1'); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
    await page.getByRole('button', { name: 'Inizia la selezione', exact: true }).waitFor();
    await page.evaluate(() => window.draftFixture.pendingReads.splice(0).forEach(resolve => resolve()));
    await page.getByRole('button', { name: 'Inizia la selezione', exact: true }).click();
    assert(await page.getByText('Nessun giocatore selezionato.', { exact: true }).isVisible());
    pass('Fanta: logout clears prior identity; a delayed response from another account cannot restore it');

    const reviewSaved = async name => {
      await page.getByRole('button', { name: 'Modifica la selezione', exact: true }).click();
      await page.getByRole('button', { name: 'Vai al riepilogo', exact: true }).click();
      await page.locator('#teamName').fill(name);
    };
    const account = async value => {
      await page.evaluate(value => { localStorage.setItem('flbp_player_presence_v1', JSON.stringify({ accountId: value, mode: 'live' })); window.dispatchEvent(new Event('flbp-player-preview-change')); }, value);
      await page.getByRole('button', { name: 'Modifica la selezione', exact: true }).waitFor();
    };
    await goto('mode=fanta&roster=saved');
    await reviewSaved('Prima sessione A');
    await page.evaluate(() => { window.draftFixture.holdSaves = true; });
    await page.getByRole('button', { name: 'Conferma e Salva', exact: true }).click();
    await page.waitForFunction(() => window.draftFixture.pendingSaves.length === 1);
    await account('account-b'); await account('account-a');
    await reviewSaved('Nuova sessione A');
    await page.getByRole('button', { name: 'Conferma e Salva', exact: true }).click();
    await page.waitForFunction(() => window.draftFixture.pendingSaves.length === 2);
    await page.evaluate(() => window.draftFixture.pendingSaves.shift()(true));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText('Squadra salvata con successo!', { exact: true }).count(), 0);
    assert.equal(await page.locator('#teamName').inputValue(), 'Nuova sessione A');
    assert.equal(await page.locator('#teamName').locator('xpath=ancestor::div[contains(@class,"grid")][1]').getByRole('button').last().isDisabled(), true, 'old A completion cannot clear the new A saving state');
    await page.evaluate(() => window.draftFixture.pendingSaves.shift()(false));
    await page.getByText('Errore simulato: bozza conservata', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.draftFixture.backCalls), 0);
    pass('Fanta ABA: old save cannot publish feedback, clear a newer save or navigate the new draft');

    for (const transition of ['account-roundtrip', 'unmount']) {
      await goto('mode=fanta&roster=saved');
      await reviewSaved('Bozza con conferma precedente');
      await page.evaluate(() => { window.draftFixture.saveSuccess = true; });
      await page.getByRole('button', { name: 'Conferma e Salva', exact: true }).click();
      await page.getByText('Squadra salvata con successo!', { exact: true }).waitFor();
      if (transition === 'account-roundtrip') {
        await account('account-b'); await account('account-a');
      } else {
        await page.getByRole('button', { name: 'Monta/smonta builder fixture', exact: true }).click();
        await page.getByRole('button', { name: 'Monta/smonta builder fixture', exact: true }).click();
      }
      await reviewSaved('Bozza successiva');
      // The product schedules its success navigation after 1500 ms.
      await page.waitForTimeout(1650);
      assert.equal(await page.evaluate(() => window.draftFixture.backCalls), 0, 'old success timer cannot leave a later draft');
      assert.equal(await page.locator('#teamName').inputValue(), 'Bozza successiva');
      pass(`Fanta: old success timer is invalidated by ${transition}`);
    }
  }
  const openEdition = async () => {
    await goto('mode=editions');
    await page.getByRole('button', { name: 'Apri scheda', exact: true }).click();
    await page.getByLabel('Nome edizione', { exact: true }).fill('Bozza incompleta');
  };
  await openEdition();
  assert.equal(await page.getByLabel('Nome edizione', { exact: true }).inputValue(), 'Bozza incompleta', 'Edition setup must finish before the Account click');
  await page.getByRole('button', { name: /Account/ }).click();
  const remainingEditors = await page.getByLabel('Nome edizione', { exact: true }).count();
  assert.deepEqual(errors, [], 'Edition negative control requires a clean browser/network setup');
  negativePhase = 'dirty-edition-account-click';
  assert.equal(remainingEditors, 1, 'Account navigation must retain the dirty editor until explicit consent');
  negativePhase = null;
  const dialog = page.getByRole('dialog', { name: 'Modifiche non salvate' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  assert.equal(await page.getByLabel('Nome edizione', { exact: true }).inputValue(), 'Bozza incompleta');
  assert.equal(await page.getByText('Destination accounts', { exact: true }).count(), 0);
  pass('Edizioni: actual DataTab Account button is guarded; cancel preserves the mounted draft');
  for (const target of ['traffic', 'views', 'persistence']) {
    await page.evaluate(target => window.dispatchEvent(new Event(`flbp:open-data-${target}`)), target);
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
    assert.equal(await page.getByLabel('Nome edizione', { exact: true }).inputValue(), 'Bozza incompleta');
  }
  pass('Edizioni: all three custom navigation events require consent');
  await page.getByRole('button', { name: /Account/ }).click();
  await dialog.waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('flbp:open-data-traffic')));
  await dialog.getByRole('button', { name: 'Esci senza salvare', exact: true }).click();
  await page.getByText('Destination accounts', { exact: true }).waitFor();
  assert.equal(await page.getByText('Destination traffic', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
  pass('Edizioni: explicit discard follows first destination exactly once');
  await openEdition();
  await page.getByRole('button', { name: 'Uscita SPA fixture', exact: true }).click();
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
  assert.equal(await page.getByLabel('Nome edizione', { exact: true }).inputValue(), 'Bozza incompleta');
  pass('Edizioni: parent SPA navigation uses the same modal and retains fields on cancel');
  await page.getByRole('button', { name: 'Riepilogo modifiche', exact: true }).click();
  await page.getByRole('dialog', { name: 'Riepilogo modifiche' }).getByRole('button', { name: 'Salva modifiche', exact: true }).click();
  if (online) {
    await page.waitForFunction(() => !!window.draftFixture.pendingCommit);
    await page.evaluate(() => window.dispatchEvent(new Event('flbp:open-data-traffic')));
    assert.equal(await dialog.count(), 0, 'busy save must not offer discard');
    assert.equal(await page.getByText('Destination traffic', { exact: true }).count(), 0);
    await page.evaluate(() => window.draftFixture.pendingCommit(false));
    await page.getByText('Conferma non ricevuta: bozza conservata', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Account/ }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
    assert.equal(await page.getByLabel('Nome edizione', { exact: true }).inputValue(), 'Bozza incompleta');
    await page.getByRole('button', { name: 'Riepilogo modifiche', exact: true }).click();
    await page.getByRole('dialog', { name: 'Riepilogo modifiche' }).getByRole('button', { name: 'Salva modifiche', exact: true }).click();
    await page.waitForFunction(() => !!window.draftFixture.pendingCommit);
    await page.evaluate(() => window.draftFixture.pendingCommit(true));
    pass('Edizioni ONLINE: pending durable save prevents exit; failure retains dirty draft');
  }
  await page.getByRole('button', { name: 'Apri scheda', exact: true }).waitFor();
  await page.getByRole('button', { name: /Account/ }).click();
  await page.getByText('Destination accounts', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByLabel('Saved state').textContent(), '["Bozza incompleta"]');
  pass(`Edizioni ${online ? 'ONLINE' : 'LOCALE'}: successful save releases guard using existing persistence semantics`);
  assert.deepEqual(errors, []);
  if (regression) throw new Error(`Negative control ${regression} did not reproduce its target defect`);
  console.log(`PASS ${checks} draft protection browser checks; no external network or page errors`);
} catch (error) {
  const target = negativeTargets[regression];
  if (!target || !mutationApplied || negativePhase !== target.phase || errors.length !== 0
    || !(error instanceof assert.AssertionError) || error.code !== 'ERR_ASSERTION' || error.operator !== 'strictEqual'
    || error.message.split('\n')[0] !== target.message || error.actual !== target.actual || error.expected !== target.expected) {
    throw error;
  }
  console.log(`PASS negative control ${regression}: setup complete; exact target assertion detected (${target.phase})`);
} finally {
  await browser?.close();
  await server.close();
}
