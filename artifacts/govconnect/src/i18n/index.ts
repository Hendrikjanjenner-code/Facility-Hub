import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { nl, enGB, pt, es, it, tr } from 'date-fns/locale';
import type { Locale } from 'date-fns';

export const SUPPORTED_LANGUAGES = [
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'tr', label: 'Türkçe' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const DATE_FNS_LOCALES: Record<string, Locale> = {
  nl,
  en: enGB,
  pt,
  es,
  it,
  tr,
};

const INTL_LOCALES: Record<string, string> = {
  nl: 'nl-NL',
  en: 'en-GB',
  pt: 'pt-PT',
  es: 'es-ES',
  it: 'it-IT',
  tr: 'tr-TR',
};

/** date-fns locale for the active UI language. */
export function getDateFnsLocale(): Locale {
  return DATE_FNS_LOCALES[i18n.language] ?? nl;
}

/** BCP-47 locale string for Intl / toLocale*String calls. */
export function getIntlLocale(): string {
  return INTL_LOCALES[i18n.language] ?? 'nl-NL';
}

// Eagerly load every locale JSON: src/i18n/locales/<lng>/<namespace>.json
// Adding a new namespace file requires no registration here.
const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  resources[lng!] ??= {};
  resources[lng!]![ns!] = mod.default;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'nl',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'letshare4gov:language',
    },
  });

export default i18n;
