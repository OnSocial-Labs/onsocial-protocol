'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { themeInitScript } from '@/lib/theme-init';

/** Blocking theme script via SSR stream — avoids React 19 inline-script warnings. */
export function ThemeInitScript() {
  useServerInsertedHTML(() => (
    <script
      id="onsocial-theme-init"
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  ));

  return null;
}
