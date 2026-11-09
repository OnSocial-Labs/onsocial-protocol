'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../messages/en/shell.json';
import pl from '../../messages/pl/shell.json';
import { useAppLocale } from '@/lib/use-app-locale';

const messages = {
  en: { shell: en },
  pl: { shell: pl },
} as const;

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useAppLocale();

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
