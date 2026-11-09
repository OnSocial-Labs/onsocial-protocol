'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { localeInitScript } from '@/lib/locale';

/** Blocking locale script via SSR stream — same path as the theme script. */
export function LocaleInitScript() {
  useServerInsertedHTML(() => (
    <script
      id="onsocial-locale-init"
      dangerouslySetInnerHTML={{ __html: localeInitScript }}
    />
  ));

  return null;
}
