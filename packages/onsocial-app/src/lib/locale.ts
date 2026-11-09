/** Device language. English until the person chooses Polish. */
export const LOCALE_STORAGE_KEY = 'onsocial.locale';

export const LOCALE_EVENT = 'onsocial:localechange';

export const APP_LOCALES = ['en', 'pl'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string | null): value is AppLocale {
  return value === 'en' || value === 'pl';
}

export function readLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(stored)) return stored;
  } catch {
    // ignore persistence failures
  }
  return 'en';
}

export function applyLocale(next: AppLocale) {
  document.documentElement.lang = next;
  document.documentElement.classList.toggle('locale-pl', next === 'pl');
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // ignore persistence failures
  }
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

/** Blocking pre-hydration script — keep in sync with applyLocale. */
export const localeInitScript = `try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');if(l==='pl'){document.documentElement.lang='pl';document.documentElement.classList.add('locale-pl');}}catch(e){}`;
