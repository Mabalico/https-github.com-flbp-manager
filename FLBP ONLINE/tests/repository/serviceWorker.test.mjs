import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Runs the real public/sw.js with an in-memory cache and a controllable network.
const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://sw-fixture.invalid';

const createWorker = ({ cached = {}, network = 'fast' } = {}) => {
  const handlers = {};
  const timers = [];
  const store = new Map(Object.entries(cached));
  const keyOf = target => {
    const url = new URL(typeof target === 'string' ? target : target.url, ORIGIN);
    return url.pathname + url.search;
  };
  class FakeResponse {
    constructor(body) { this.body = body; this.ok = true; }
    clone() { return this; }
  }
  const context = {
    URL,
    AbortController,
    Response: FakeResponse,
    Request: class { constructor(url) { this.url = new URL(url, ORIGIN).href; } },
    setTimeout: (callback, delay) => timers.push({ callback, delay, active: true }),
    clearTimeout: id => { if (id) timers[id - 1].active = false; },
    caches: {
      open: async () => ({ match: async key => store.get(keyOf(key)), put: async (key, value) => { store.set(keyOf(key), value); } }),
      keys: async () => [],
    },
    self: {
      registration: { scope: ORIGIN + '/' },
      location: { origin: ORIGIN },
      clients: { claim() {} },
      skipWaiting() {},
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
    fetch: (_request, options = {}) => new Promise((resolve, reject) => {
      if (network === 'fast') return resolve(new FakeResponse('network'));
      if (network === 'offline') return reject(new TypeError('offline'));
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      context.finishSlowNetwork = () => resolve(new FakeResponse('network'));
      return undefined;
    }),
  };
  vm.runInNewContext(source, context);
  return {
    store,
    timers,
    finishSlowNetwork: () => context.finishSlowNetwork(),
    open: path => {
      let response;
      handlers.fetch({
        request: { method: 'GET', url: ORIGIN + path, mode: 'navigate', headers: { get: () => 'text/html' } },
        respondWith: value => { response = value; },
      });
      return response;
    },
  };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const bodyOf = response => (typeof response === 'string' ? response : response.body);

test('a slow first visit keeps waiting for the page instead of showing Offline', async () => {
  const worker = createWorker({ network: 'slow' });
  const response = worker.open('/?view=hof');
  await settle();
  assert.equal(worker.timers.length, 0, 'nothing can be shown instead, so no deadline is set');
  worker.finishSlowNetwork();
  assert.equal(bodyOf(await response), 'network');
  assert.ok(worker.store.has('/index.html'), 'the page becomes the fallback of the next visits');
});

test('a slow network falls back after three seconds to the last page', async () => {
  const worker = createWorker({ network: 'slow', cached: { '/index.html': 'cached index' } });
  const response = worker.open('/?view=hof');
  await settle();
  assert.equal(worker.timers[0].delay, 3000);
  worker.timers[0].callback();
  assert.equal(bodyOf(await response), 'cached index');
});

test('the exact page is preferred to the generic index', async () => {
  const worker = createWorker({ network: 'offline', cached: { '/index.html': 'cached index', '/?view=hof': 'cached page' } });
  assert.equal(bodyOf(await worker.open('/?view=hof')), 'cached page');
});

test('a fast network wins over the cache and clears the deadline', async () => {
  const worker = createWorker({ cached: { '/index.html': 'cached index' } });
  assert.equal(bodyOf(await worker.open('/?view=home')), 'network');
  assert.ok(worker.timers.every(timer => !timer.active));
});

test('without a network and without a cached page the Offline notice is shown', async () => {
  const worker = createWorker({ network: 'offline' });
  assert.match(bodyOf(await worker.open('/?view=home')), /Offline/);
});
