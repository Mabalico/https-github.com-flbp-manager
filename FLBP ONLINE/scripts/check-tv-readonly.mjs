import fs from 'node:fs';
import path from 'node:path';

const interactiveSurfaceFiles = [
  'components/TvView.tsx',
  'components/TvSimpleView.tsx',
  'components/TvBracketView.tsx',
  'components/TvScorersView.tsx',
  'components/PublicTvShell.tsx',
];

const sourceRoot = process.cwd();
const failures = [];

const forbiddenPatterns = [
  { re: /<button\b/i, label: 'button element' },
  { re: /<a\b/i, label: 'anchor element' },
  { re: /\bonClick\s*=/, label: 'onClick handler' },
  { re: /\bonKeyDown\s*=/, label: 'onKeyDown handler' },
  { re: /\bonKeyUp\s*=/, label: 'onKeyUp handler' },
  { re: /\bonKeyPress\s*=/, label: 'onKeyPress handler' },
  { re: /\btabIndex\s*=/, label: 'tabIndex prop' },
  { re: /\brole\s*=\s*["']button["']/i, label: 'button role' },
  { re: /\bhref\s*=/, label: 'href prop' },
  { re: /cursor-pointer/, label: 'cursor-pointer class' },
];

for (const rel of interactiveSurfaceFiles) {
  const abs = path.join(sourceRoot, rel);
  const text = fs.readFileSync(abs, 'utf8');
  for (const { re, label } of forbiddenPatterns) {
    if (re.test(text)) {
      failures.push(`${rel}: found ${label}`);
    }
  }
}

const tvShellSource = fs.readFileSync(path.join(sourceRoot, 'components/PublicTvShell.tsx'), 'utf8');
if (!/cursor-none/.test(tvShellSource) || !/select-none/.test(tvShellSource)) {
  failures.push('components/PublicTvShell.tsx: expected cursor-none and select-none safeguards');
}

const appSource = fs.readFileSync(path.join(sourceRoot, 'App.tsx'), 'utf8');
if (!/if \(tvMode\)/.test(appSource) || !/UiErrorBoundary/.test(appSource) || !/TvViewLazy/.test(appSource)) {
  failures.push('App.tsx: TV entry is expected to stay wrapped by UiErrorBoundary + TvViewLazy');
}

if (failures.length > 0) {
  console.error('TV read-only check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('TV read-only check passed. No interactive handlers/elements detected in TV surface files.');
