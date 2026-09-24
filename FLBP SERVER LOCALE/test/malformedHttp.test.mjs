import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const rawRequest = (port, target, host, version = 'HTTP/1.1') => new Promise((resolve, reject) => {
  const socket = net.connect(port, '127.0.0.1');
  let response = '';
  socket.setEncoding('utf8');
  socket.setTimeout(3_000, () => socket.destroy(new Error('HTTP response timed out')));
  socket.once('error', reject);
  socket.on('data', (chunk) => { response += chunk; });
  socket.once('end', () => resolve(response));
  socket.once('connect', () => {
    socket.write(`GET ${target} ${version}\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
  });
});

test('malformed Host and URL return 400 without terminating the real server process', { timeout: 15_000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-malformed-http-'));
  const serverModule = new URL('../src/server.mjs', import.meta.url).href;
  // A separate process proves that an unhandled rejection cannot silently pass
  // as a request-only failure. The empty temporary cwd never loads a real .env.
  const script = `
    import { createLocalServer } from ${JSON.stringify(serverModule)};
    const app = createLocalServer({
      host: '127.0.0.1', port: 0, dataDir: ${JSON.stringify(dataDir)},
      secondaryBackupDir: '', requireSecondaryBackup: false,
      adminToken: 'malformed-http-test-token-12345678901234567890',
      allowedOrigins: [], publicUrl: '', supabaseUrl: '', supabaseServiceRoleKey: '',
    });
    const address = await app.listen();
    process.send({ port: address.port });
    process.on('message', async (message) => {
      if (message === 'stop') { await app.close(); process.exit(0); }
    });
  `;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '--eval', script], {
    cwd: dataDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const closed = once(child, 'close');
  try {
    const { port } = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5_000);
      child.once('message', (message) => { clearTimeout(timer); resolve(message); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)); });
    });
    const malformed = [
      ['/health', '['],
      ['/health', 'localhost:invalid'],
      ['/health', 'user@localhost'],
      ['/health', 'localhost/path'],
      ['http://[::1/health', 'localhost'],
      ['//[', 'localhost'],
      ['/health', 'localhost', 'HTTP/1.X'],
    ];
    for (const [target, host, version] of malformed) {
      const response = await rawRequest(port, target, host, version);
      assert.match(response, /^HTTP\/1\.1 400 /, `${target}, Host ${host}: ${response}\n${output}`);
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200, output);
      assert.equal((await health.json()).ok, true);
      assert.equal(child.exitCode, null, output);
    }
    for (const host of [`localhost:${port}`, `[::1]:${port}`, 'flbp-sala.local:8787']) {
      assert.match(await rawRequest(port, '/health', host), /^HTTP\/1\.1 200 /);
    }
  } finally {
    if (child.exitCode == null && child.connected) child.send('stop');
    const killTimer = setTimeout(() => child.kill(), 3_000);
    await closed;
    clearTimeout(killTimer);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
