#!/usr/bin/env node

/**
 * Fix executable permissions for node_modules binaries after extracting from a ZIP.
 *
 * Why: Some ZIP extractors drop the executable bit on Unix-like systems, causing
 * "Permission denied" errors for tools like vite/esbuild.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const chmodSafe = (p) => {
  try {
    fs.chmodSync(p, 0o755);
    return true;
  } catch {
    return false;
  }
};

const changed = new Set();

const tryChmod = (p) => {
  if (!fs.existsSync(p)) return;
  if (chmodSafe(p)) changed.add(p);
};

// 1) node_modules/.bin/*
const binDir = path.join(root, 'node_modules', '.bin');
if (fs.existsSync(binDir)) {
  for (const name of fs.readdirSync(binDir)) {
    const p = path.join(binDir, name);
    try {
      const stat = fs.lstatSync(p);
      if (stat.isFile() || stat.isSymbolicLink()) tryChmod(p);
    } catch {
      // ignore
    }
  }
}

// 2) esbuild native bins
const esbuildRoot = path.join(root, 'node_modules', '@esbuild');
if (fs.existsSync(esbuildRoot)) {
  for (const dir of fs.readdirSync(esbuildRoot)) {
    const p = path.join(esbuildRoot, dir, 'bin', 'esbuild');
    tryChmod(p);
  }
}

const list = [...changed];
console.log(`[fix:perms] Updated executable bit on ${list.length} path(s).`);
for (const p of list.slice(0, 12)) {
  console.log(' - ' + path.relative(root, p));
}
if (list.length > 12) {
  console.log(` - ... +${list.length - 12} more`);
}
