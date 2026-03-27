export type Language = 'it' | 'en' | 'fr' | 'de' | 'es' | 'pt' | 'pl' | 'zh' | 'ja' | 'ar' | 'ru' | 'tr';
export type TranslationDictionary = Record<string, string>;

export const DEFAULT_LANGUAGE: Language = 'it';
export const FALLBACK_LANGUAGE: Language = 'en';

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];

export { dictionary as itDictionary } from './i18n/it';
export { dictionary as enDictionary } from './i18n/en';

import { dictionary as itDictionary } from './i18n/it';
import { dictionary as enDictionary } from './i18n/en';

export const translations: Partial<Record<Language, TranslationDictionary>> = {
  it: itDictionary,
  en: enDictionary,
};

export const getTranslationValue = (
  dictionaries: Partial<Record<Language, TranslationDictionary>>,
  language: Language,
  key: string,
) => {
  const primary = dictionaries[language]?.[key];
  const fallback = dictionaries[FALLBACK_LANGUAGE]?.[key];
  const base = dictionaries[DEFAULT_LANGUAGE]?.[key];

  if (language !== DEFAULT_LANGUAGE && primary && base && primary === base && fallback && fallback !== base) {
    return fallback;
  }

  return primary || fallback || base || key;
};

export const loadTranslationDictionary = async (language: Language): Promise<TranslationDictionary> => {
  switch (language) {
    case 'it':
      return itDictionary;
    case 'en':
      return enDictionary;
    case 'fr':
      return (await import('./i18n/fr')).dictionary;
    case 'de':
      return (await import('./i18n/de')).dictionary;
    case 'es':
      return (await import('./i18n/es')).dictionary;
    case 'pt':
      return (await import('./i18n/pt')).dictionary;
    case 'pl':
      return (await import('./i18n/pl')).dictionary;
    case 'zh':
      return (await import('./i18n/zh')).dictionary;
    case 'ja':
      return (await import('./i18n/ja')).dictionary;
    case 'ar':
      return (await import('./i18n/ar')).dictionary;
    case 'ru':
      return (await import('./i18n/ru')).dictionary;
    case 'tr':
      return (await import('./i18n/tr')).dictionary;
    default:
      return itDictionary;
  }
};
