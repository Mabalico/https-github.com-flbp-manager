import fs from 'fs';
import path from 'path';
import vm from 'vm';

const dir = path.resolve('services/i18n');
const header = `import type { TranslationDictionary } from '../i18nService';\n\nexport const dictionary: TranslationDictionary = `;
const boundary = '\n@@FLBP_BOUNDARY@@\n';
const maxChunkChars = 3200;
const targetLanguages = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  pt: 'pt',
  pl: 'pl',
  zh: 'zh-CN',
  ja: 'ja',
  ar: 'ar',
  ru: 'ru',
  tr: 'tr',
};

const protectPatterns = [
  /\{[^}]+\}/g,
  /gg\/mm\/aaaa/g,
  /Ctrl\+F5/g,
  /\bFLBP\b/g,
  /\bBeer Pong\b/g,
  /\bSupabase\b/g,
  /\bCloudflare\b/g,
  /\bPages\b/g,
  /\bGoogle\b/g,
  /\bFacebook\b/g,
  /\bApple\b/g,
  /\bAndroid\b/g,
  /\biOS\b/g,
  /\bMac(?:OS)?\b/g,
  /\bXcode\b/g,
  /\bTestFlight\b/g,
  /\bOCR\b/g,
  /\bTV\b/g,
  /\bMVP\b/g,
  /\bU25\b/g,
  /\bBYE\b/g,
  /\bJWT\b/g,
  /\bJSON\b/g,
  /\bCSV\b/g,
  /\bAPI\b/g,
  /\bRPC\b/g,
  /\bDB\b/g,
  /\bSQL\b/g,
  /\bSMTP\b/g,
  /\bSite URL\b/g,
  /\bRedirect URLs\b/g,
];

const loadDictionary = (file) => {
  let source = fs.readFileSync(path.join(dir, file), 'utf8');
  source = source.replace(/^\uFEFF?import type \{ TranslationDictionary \} from '\.\.\/i18nService';\r?\n\r?\n/, '');
  source = source.replace(/^\uFEFF?export const dictionary: TranslationDictionary = /, 'module.exports = ');
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports });
  return mod.exports;
};

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const protectText = (input) => {
  let safe = String(input ?? '');
  const replacements = [];
  let index = 0;

  for (const pattern of protectPatterns) {
    safe = safe.replace(pattern, (match) => {
      const token = `@@FLBP_TOKEN_${index++}@@`;
      replacements.push([token, match]);
      return token;
    });
  }

  return { safe, replacements };
};

const restoreText = (input, replacements) => {
  let restored = String(input ?? '');
  for (const [token, raw] of replacements) {
    restored = restored.replaceAll(token, raw);
  }
  return restored;
};

const extractTranslatedText = (payload) => {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error('Unexpected translation payload shape.');
  }
  return payload[0].map((part) => String(part?.[0] ?? '')).join('');
};

const translateJoined = async (joined, targetLanguage) => {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'it',
    tl: targetLanguage,
    dt: 't',
    q: joined,
  });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translation request failed (${response.status}).`);
  }
  return extractTranslatedText(await response.json());
};

const splitByBoundary = (translated) => {
  const tokenPattern = new RegExp(`\\s*${escapeForRegExp('@@FLBP_BOUNDARY@@')}\\s*`, 'g');
  return translated.split(tokenPattern);
};

const buildChunks = (entries) => {
  const chunks = [];
  let current = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = entry.protected.safe.length + boundary.length;
    if (current.length && currentSize + entrySize > maxChunkChars) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(entry);
    currentSize += entrySize;
  }

  if (current.length) chunks.push(current);
  return chunks;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const translateEntries = async (entries, targetLanguage) => {
  const out = {};
  const chunks = buildChunks(entries);

  for (const chunk of chunks) {
    const joined = chunk.map((entry) => entry.protected.safe).join(boundary);
    let translated;
    try {
      translated = await translateJoined(joined, targetLanguage);
    } catch (error) {
      if (chunk.length === 1) throw error;
      for (const entry of chunk) {
        const singleTranslated = await translateJoined(entry.protected.safe, targetLanguage);
        out[entry.key] = restoreText(singleTranslated, entry.protected.replacements);
        await sleep(80);
      }
      continue;
    }

    const parts = splitByBoundary(translated);
    if (parts.length !== chunk.length) {
      for (const entry of chunk) {
        const singleTranslated = await translateJoined(entry.protected.safe, targetLanguage);
        out[entry.key] = restoreText(singleTranslated, entry.protected.replacements);
        await sleep(80);
      }
      continue;
    }

    chunk.forEach((entry, index) => {
      out[entry.key] = restoreText(parts[index], entry.protected.replacements);
    });

    await sleep(120);
  }

  return out;
};

const writeDictionary = (code, dictionary) => {
  const outputPath = path.join(dir, `${code}.ts`);
  const ordered = Object.fromEntries(Object.entries(dictionary));
  fs.writeFileSync(outputPath, `${header}${JSON.stringify(ordered, null, 2)};\n`, 'utf8');
};

const base = loadDictionary('it.ts');
const keys = Object.keys(base);
const requested = process.argv.slice(2).filter(Boolean);
const languages = requested.length ? requested : Object.keys(targetLanguages);

for (const code of languages) {
  const targetLanguage = targetLanguages[code];
  if (!targetLanguage) {
    throw new Error(`Unsupported language code: ${code}`);
  }

  const entries = keys.map((key) => ({
    key,
    raw: base[key],
    protected: protectText(base[key]),
  }));
  const translated = await translateEntries(entries, targetLanguage);
  const dictionary = Object.fromEntries(keys.map((key) => [key, translated[key] ?? String(base[key] ?? '')]));
  writeDictionary(code, dictionary);
  console.log(`Regenerated ${code}.ts (${keys.length} keys).`);
}
