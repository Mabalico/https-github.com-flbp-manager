import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const onlineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suiteFile = path.join(onlineRoot, 'supabase/tests/admin_auth_hardening.sql');
const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const databaseUrl = readArg('--database-url');
const pgliteModule = readArg('--pglite');
if (!!databaseUrl === !!pgliteModule) {
  throw new Error('Choose --database-url <disposable loopback PostgreSQL URL> or --pglite <absolute module path>.');
}

if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only disposable loopback databases are allowed');
  assert.equal(url.search, '', 'Connection overrides in URL query parameters are not allowed');
  assert.equal(url.hash, '', 'URL fragments are not allowed');
  const result = spawnSync('psql', ['-X', '--set=ON_ERROR_STOP=1', '--dbname', databaseUrl, '--file', suiteFile], {
    encoding: 'utf8', windowsHide: true,
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exitCode = result.status ?? 1;
} else {
  assert.ok(path.isAbsolute(pgliteModule), 'Use an absolute local module path');
  const { PGlite } = await import(pathToFileURL(pgliteModule).href);
  const suite = await fs.readFile(suiteFile, 'utf8');
  const authFixture = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.role() returns text language sql stable as
      $$ select auth.jwt()->>'role' $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
  `;
  const gateDefinitions = (sql) => [...sql.matchAll(/create or replace function public\.flbp_is_admin\(\)[\s\S]*?\$\$;/gi)]
    .map((match) => match[0]);
  for (const edition of ['FLBP ONLINE', 'FLBP LOCALE']) {
    const editionRoot = path.resolve(onlineRoot, '..', edition);
    const readMigration = (name) => fs.readFile(path.join(editionRoot, 'supabase/migrations', name), 'utf8');
    const db = new PGlite();
    try {
      await db.exec(authFixture);
      for (const name of [
        '20251226000100_init_flbp.sql',
        '20251226000200_rls_policies.sql',
        '20251226000300_public_read_safe.sql',
        '20260323000300_admin_auth_roles.sql',
        '20260326000200_admin_snapshot_write_rpc.sql',
      ]) await db.exec(await readMigration(name));
      if (edition === 'FLBP ONLINE') {
        await db.exec(await readMigration('20260709000200_public_workspace_live.sql'));
        await db.exec(await readMigration('20260715000100_admin_write_lease.sql'));
        const previousGate = gateDefinitions(await readMigration('20260715000200_admin_gate_null_safe.sql'));
        assert.equal(previousGate.length, 1);
        await db.exec(previousGate[0]);
      }
      // Prove the suite rejects the vulnerable historical behavior, rather
      // than merely reporting a pass for the corrected implementation.
      let baselineRejected = false;
      try { await db.exec(suite); } catch (error) {
        baselineRejected = String(error.message).includes('Admin auth assertion failed:');
      }
      await db.exec('rollback;');
      assert.equal(baselineRejected, true, `${edition}: the vulnerable baseline must fail the assertions`);
      const migration = await readMigration('20260924000100_admin_auth_trusted_claims.sql');
      await db.exec(migration);
      await db.exec(migration); // Reapplying the additive hardening is safe.
      const results = await db.exec(suite);
      const passes = results.flatMap((result) => result.rows || [])
        .flatMap(Object.values).filter((value) => typeof value === 'string' && value.startsWith('PASS:'));
      assert.ok(passes.length >= 26, `${edition}: full authorization matrix must run`);
      console.log(`${edition}: vulnerable baseline rejected; migration applied twice; ${passes.length} SQL assertions passed.`);

      // The generated one-shot setup must finish with exactly the same gate.
      // Execute every embedded gate in sequence, then rerun the real SQL matrix.
      const setup = await fs.readFile(path.join(editionRoot, 'supabase/setup_all.sql'), 'utf8');
      const setupGates = gateDefinitions(setup);
      assert.ok(setupGates.length >= 2);
      for (const gate of setupGates) await db.exec(gate);
      const setupResults = await db.exec(suite);
      const setupPasses = setupResults.flatMap((result) => result.rows || [])
        .flatMap(Object.values).filter((value) => typeof value === 'string' && value.startsWith('PASS:'));
      assert.equal(setupPasses.length, passes.length);
      console.log(`${edition}: setup_all gate sequence passed the same ${setupPasses.length} SQL assertions.`);
    } finally {
      await db.close();
    }
  }
  console.log('No network connection, production database or application dependency was used by the PGlite test.');
}
