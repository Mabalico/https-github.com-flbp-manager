import fs from 'fs';
import path from 'path';
import vm from 'vm';
const dir = path.resolve('services/i18n');
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.ts')).sort();
const loadDictionary = (file) => {
  let source = fs.readFileSync(path.join(dir, file), 'utf8');
  source = source.replace(/^\uFEFF?import type \{ TranslationDictionary \} from '\.\.\/i18nService';\r?\n\r?\n/, '');
  source = source.replace(/^\uFEFF?export const dictionary: TranslationDictionary = /, 'module.exports = ');
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports });
  return mod.exports;
};
const base = loadDictionary('it.ts');
let hasIssues = false;
for (const file of files) {
  const dict = loadDictionary(file);
  const missing = Object.keys(base).filter((key) => !(key in dict));
  const extra = Object.keys(dict).filter((key) => !(key in base));
  if (missing.length || extra.length) {
    hasIssues = true;
    console.error(`${file}: missing=${missing.length} extra=${extra.length}`);
    if (missing.length) console.error(`  missing sample: ${missing.slice(0, 12).join(', ')}`);
    if (extra.length) console.error(`  extra sample: ${extra.slice(0, 12).join(', ')}`);
  }
}
if (hasIssues) process.exit(1);
console.log(`i18n coverage OK: ${files.length} dictionaries aligned to it.ts (${Object.keys(base).length} keys).`);
