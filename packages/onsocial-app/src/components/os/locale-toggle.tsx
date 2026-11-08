'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  osLauncherThemeToggleClassName,
  osLauncherThemeToggleOptionClassName,
} from '@onsocial/ui';
import { applyLocale, type AppLocale } from '@/lib/locale';
import { useAppLocale } from '@/lib/use-app-locale';

export function LocaleToggle() {
  const t = useTranslations('shell');
  const locale = useAppLocale();
  const choose = useCallback((next: AppLocale) => {
    applyLocale(next);
  }, []);

  return (
    <div
      className={osLauncherThemeToggleClassName}
      role="group"
      aria-label={t('language.label')}
    >
      <button
        type="button"
        className={`${osLauncherThemeToggleOptionClassName}${locale === 'en' ? ' is-active' : ''}`}
        aria-pressed={locale === 'en'}
        onClick={() => choose('en')}
      >
        {t('language.en')}
      </button>
      <button
        type="button"
        className={`${osLauncherThemeToggleOptionClassName}${locale === 'pl' ? ' is-active' : ''}`}
        aria-pressed={locale === 'pl'}
        onClick={() => choose('pl')}
      >
        {t('language.pl')}
      </button>
    </div>
  );
}
