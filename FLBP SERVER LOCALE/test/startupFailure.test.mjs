import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a startup port collision exits so Task Scheduler can restart the server', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flbp-port-collision-'));
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', resolve);
  });
  const port = blocker.address().port;
  let output = '';
  let child;
  try {
    child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.mjs'], {
      cwd: serverRoot,
      env: {
        ...process.env,
        FLBP_HOST: '127.0.0.1',
        FLBP_PORT: String(port),
        FLBP_DATA_DIR: dataDir,
        FLBP_SECONDARY_BACKUP_DIR: '',
        FLBP_REQUIRE_SECONDARY_BACKUP: '0',
        FLBP_RUNTIME_LOG_FILE: path.join(dataDir, 'server.log'),
        FLBP_LOCAL_ADMIN_TOKEN: 'port-collision-test-token-12345678901234567890',
        SUPABASE_URL: '',
        SUPABASE_SECRET_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const exit = await Promise.race([
      new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Processo ancora vivo dopo collisione porta. Output: ${output}`)), 3_000);
        timer.unref();
      }),
    ]);
    assert.equal(exit.signal, null, output);
    assert.equal(exit.code, 1, output);
    assert.match(output, /EADDRINUSE/);
  } finally {
    if (child && child.exitCode == null) child.kill();
    await new Promise((resolve) => blocker.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
