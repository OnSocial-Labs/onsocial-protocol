'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChoiceDrawer,
  osLauncherThemeToggleClassName,
  osLauncherThemeToggleOptionClassName,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';
import { applyLocale, APP_LOCALES, type AppLocale } from '@/lib/locale';
import { useAppLocale } from '@/lib/use-app-locale';

/**
 * One control for every device language. English is the default. A new
 * language is another row here once its shell file matches the catalog.
 */
export function LocaleToggle({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('shell');
  const locale = useAppLocale();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const openEpoch = useRef(0);
  const closeEpoch = useRef(0);
  const sheetOpen = open && !closing;
  const activeLabel = t(`language.${locale}`);
  const label = t('language.label');

  const requestOpen = useCallback(() => {
    openEpoch.current += 1;
    setClosing(false);
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const requestClose = useCallback(() => {
    closeEpoch.current = openEpoch.current;
    setClosing(true);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const handleClosed = useCallback(() => {
    const started = closeEpoch.current;
    setClosing(false);
    if (started !== openEpoch.current) return;
    setOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className={osLauncherThemeToggleClassName}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={`${label}, ${activeLabel}`}
        onClick={requestOpen}
      >
        <span className={`${osLauncherThemeToggleOptionClassName} is-active`}>
          {activeLabel}
        </span>
      </button>
      <ChoiceDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={label}
        value={locale}
        options={APP_LOCALES.map((code) => ({
          value: code,
          label: t(`language.${code}`),
        }))}
        onChange={(next: AppLocale) => applyLocale(next)}
        zIndex={SHEET_Z.nested}
      />
    </>
  );
}
