'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { gateReturnScript } from '@/lib/gate-return';
import { themeInitScript } from '@/lib/theme-init';

/** One blocking insertion. A second hook in the root layout splits the stream. */
export function ThemeInitScript() {
  useServerInsertedHTML(() => (
    <>
      <script
        id="onsocial-theme-init"
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
      />
      <script
        id="onsocial-gate-return"
        dangerouslySetInnerHTML={{ __html: gateReturnScript }}
      />
    </>
  ));

  return null;
}
