import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateOperationalConfig } from '../src/config.mjs';

const operationalConfig = (webDist) => ({
  adminToken: 'x'.repeat(32),
  supabaseUrl: '',
  supabaseServiceRoleKey: '',
  secondaryBackupDir: '',
  dataDir: path.resolve('data'),
  requireSecondaryBackup: false,
  publicUrl: '',
  webDist,
});

test('operational validation rejects the legacy FLBP LOCALE frontend', () => {
  const errors = validateOperationalConfig(operationalConfig(path.resolve('..', 'FLBP LOCALE', 'dist')));
  assert.ok(errors.some((message) => message.includes('FLBP LOCALE')));
});

test('operational validation accepts the canonical FLBP ONLINE frontend', () => {
  const errors = validateOperationalConfig(operationalConfig(path.resolve('..', 'FLBP ONLINE', 'dist')));
  assert.deepEqual(errors, []);
});
