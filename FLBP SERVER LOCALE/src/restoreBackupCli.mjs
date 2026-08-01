import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { loadConfig } from './config.mjs';
import { inspectBackupDatabase, latestBackupFile, restoreBackupDatabase } from './backupRestore.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  args.set(key.slice(2), process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[++index] : 'true');
}

const portIsListening = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const done = (value) => { socket.destroy(); resolve(value); };
  socket.setTimeout(1200, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
});

const main = async () => {
  const config = loadConfig();
  const backupFile = args.get('backup') || latestBackupFile(config.secondaryBackupDir);
  if (!backupFile) throw new Error('Nessun backup secondario trovato. Indicare --backup oppure configurare FLBP_SECONDARY_BACKUP_DIR.');
  const targetFile = path.resolve(args.get('target') || path.join(config.dataDir, 'flbp-local.sqlite'));
  const info = inspectBackupDatabase(backupFile, args.get('workspace') || config.workspaceId);
  console.log(JSON.stringify({ candidate: info, target: targetFile }, null, 2));

  if (args.get('confirm') !== 'RIPRISTINA') {
    throw new Error('Nessun file modificato. Ripetere con --confirm RIPRISTINA dopo aver fermato il server.');
  }
  if (await portIsListening(config.port)) {
    throw new Error(`FLBP Server risponde ancora sulla porta ${config.port}. Arrestarlo prima del ripristino.`);
  }

  const result = restoreBackupDatabase({
    backupFile,
    targetFile,
    workspaceId: args.get('workspace') || config.workspaceId,
    confirmation: args.get('confirm'),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.transition === 'restore-pending') {
    console.log('Avviare il server e usare "Conferma ripresa backup": le scritture resteranno bloccate finché Supabase non riconferma lo stesso epoch.');
  }
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
