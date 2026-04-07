import fs from 'fs';
import path from 'path';
import vm from 'vm';
const dir = path.resolve('services/i18n');
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.ts')).sort();
const mojibakePattern = /�|Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|Ð[\u0080-\u00bf]|Ñ[\u0080-\u00bf]|Ù[\u0080-\u00bf]|Ø[\u0080-\u00bf]/;
const loadDictionary = (file) => {
  let source = fs.readFileSync(path.join(dir, file), 'utf8');
  source = source.replace(/^\uFEFF?import type \{ TranslationDictionary \} from '\.\.\/i18nService';\r?\n\r?\n/, '');
  source = source.replace(/^\uFEFF?export const dictionary: TranslationDictionary = /, 'module.exports = ');
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports });
  return mod.exports;
};
const base = loadDictionary('it.ts');
const english = loadDictionary('en.ts');
let hasIssues = false;
for (const file of files) {
  const dict = loadDictionary(file);
  const missing = Object.keys(base).filter((key) => !(key in dict));
  const extra = Object.keys(dict).filter((key) => !(key in base));
  const mojibake = Object.entries(dict).filter(([, value]) => mojibakePattern.test(String(value || '')));
  const sameAsItalian = file === 'it.ts'
    ? []
    : Object.keys(base).filter((key) => String(dict[key] || '') === String(base[key] || ''));
  const sameAsEnglish = file === 'en.ts'
    ? []
    : Object.keys(base).filter((key) => String(dict[key] || '') === String(english[key] || ''));
  if (missing.length || extra.length) {
    hasIssues = true;
    console.error(`${file}: missing=${missing.length} extra=${extra.length}`);
    if (missing.length) console.error(`  missing sample: ${missing.slice(0, 12).join(', ')}`);
    if (extra.length) console.error(`  extra sample: ${extra.slice(0, 12).join(', ')}`);
  }
  if (mojibake.length) {
    hasIssues = true;
    console.error(`${file}: mojibake=${mojibake.length}`);
    console.error(`  mojibake sample: ${mojibake.slice(0, 8).map(([key]) => key).join(', ')}`);
  }
  if (file !== 'it.ts' && sameAsItalian.length > Math.floor(Object.keys(base).length * 0.2)) {
    hasIssues = true;
    console.error(`${file}: too many untranslated strings identical to it.ts (${sameAsItalian.length})`);
    console.error(`  same-it sample: ${sameAsItalian.slice(0, 8).join(', ')}`);
  }
  if (!['it.ts', 'en.ts'].includes(file) && sameAsEnglish.length > Math.floor(Object.keys(base).length * 0.2)) {
    hasIssues = true;
    console.error(`${file}: too many untranslated strings identical to en.ts (${sameAsEnglish.length})`);
    console.error(`  same-en sample: ${sameAsEnglish.slice(0, 8).join(', ')}`);
  }
}
if (hasIssues) process.exit(1);
console.log(`i18n coverage OK: ${files.length} dictionaries aligned to it.ts (${Object.keys(base).length} keys).`);
