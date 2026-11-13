'use client';

import { useLayoutEffect } from 'react';
import { usePathname, useServerInsertedHTML } from 'next/navigation';
import { gateReturnScript } from '@/lib/gate-return';
import { gateViewportScript } from '@/lib/gate-viewport';
import {
  markPortfolioOwner,
  portfolioOwnerScript,
} from '@/lib/portfolio-owner-mark';
import { themeInitScript } from '@/lib/theme-init';

/** One blocking insertion. A second hook in the root layout splits the stream. */
export function ThemeInitScript() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    markPortfolioOwner(pathname);
  }, [pathname]);

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
      <script
        id="onsocial-portfolio-owner"
        dangerouslySetInnerHTML={{ __html: portfolioOwnerScript }}
      />
      <script
        id="onsocial-gate-viewport"
        dangerouslySetInnerHTML={{ __html: gateViewportScript }}
      />
    </>
  ));

  return null;
}
