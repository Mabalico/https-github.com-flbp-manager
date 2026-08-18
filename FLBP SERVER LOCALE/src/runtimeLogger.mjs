import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const formatArgument = (value) => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  return util.inspect(value, { depth: 5, breakLength: 160, compact: true });
};

const rotateLogs = (logFile, maxBytes, retainedFiles) => {
  try {
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size < maxBytes) return;
    const oldest = `${logFile}.${retainedFiles}`;
    if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${logFile}.${index}`;
      const destination = `${logFile}.${index + 1}`;
      if (fs.existsSync(source)) fs.renameSync(source, destination);
    }
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    // Logging must never become a new reason for stopping the tournament server.
  }
};

export const installRuntimeLogging = ({
  logFile,
  maxBytes = 5 * 1024 * 1024,
  retainedFiles = 5,
} = {}) => {
  if (!logFile) throw new Error('Percorso del log runtime mancante.');
  const resolved = path.resolve(logFile);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const append = (level, args) => {
    try {
      rotateLogs(resolved, maxBytes, retainedFiles);
      const message = args.map(formatArgument).join(' ');
      fs.appendFileSync(resolved, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf8');
    } catch {
      // The original console still receives the message when available.
    }
  };

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args) => {
    append('INFO', args);
    original.log(...args);
  };
  console.warn = (...args) => {
    append('WARN', args);
    original.warn(...args);
  };
  console.error = (...args) => {
    append('ERROR', args);
    original.error(...args);
  };

  const fatal = (kind, error) => {
    append('FATAL', [kind, error]);
    try {
      original.error(kind, error);
    } finally {
      process.exit(1);
    }
  };
  process.on('uncaughtException', (error) => fatal('uncaughtException', error));
  process.on('unhandledRejection', (error) => fatal('unhandledRejection', error));
  append('INFO', [`Processo avviato (pid ${process.pid}).`]);

  return { logFile: resolved };
};
