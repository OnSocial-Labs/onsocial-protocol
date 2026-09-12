'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  isPortfolioOverlayPath,
  overlayPath,
  portfolioPath,
} from '@/lib/overlay-routes';
import {
  osAppOpensWithWallet,
  osAppViewerSheetPath,
  type OsAppLink,
} from '@/lib/os-apps';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useOsAppNavigate(pageAccountId?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const { getSigningWallet } = useAppWallet();
  const [openingPage, setOpeningPage] = useState(false);

  const openWithWallet = useCallback(
    async (app: OsAppLink) => {
      if (openingPage) {
        return;
      }
      setOpeningPage(true);
      try {
        const { accountId } = await getSigningWallet();
        if (app.kind === 'open-page') {
          router.push(portfolioPath(accountId));
          return;
        }
        const sheetHref = osAppViewerSheetPath(app, accountId);
        if (sheetHref) {
          router.push(sheetHref);
        }
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          console.error(
            app.kind === 'sheet'
              ? 'Could not open boost'
              : 'Could not open your page',
            error
          );
        }
      } finally {
        setOpeningPage(false);
      }
    },
    [getSigningWallet, openingPage, router]
  );

  const navigate = useCallback(
    (app: OsAppLink): boolean => {
      if (app.soon) {
        return false;
      }
      if (osAppOpensWithWallet(app)) {
        void openWithWallet(app);
        return true;
      }
      if (app.kind === 'app' && app.href) {
        router.push(app.href);
        return true;
      }
      if (app.kind === 'overlay' && app.overlay && pageAccountId) {
        const href = overlayPath(pageAccountId, app.overlay);
        const openOverlay = isPortfolioOverlayPath(pathname)
          ? router.replace.bind(router)
          : router.push.bind(router);
        openOverlay(href, { scroll: false });
        return true;
      }
      return false;
    },
    [openWithWallet, pageAccountId, pathname, router]
  );

  return { navigate, openingPage };
}
