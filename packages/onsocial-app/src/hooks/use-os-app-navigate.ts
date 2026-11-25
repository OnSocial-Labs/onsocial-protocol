'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  useAppWalletActions,
  WalletConnectedReviewError,
} from '@/contexts/app-wallet-context';
import {
  isPortfolioOverlayPath,
  overlayPath,
  portfolioPath,
} from '@/lib/overlay-routes';
import { osAppOpensWithWallet, type OsAppLink } from '@/lib/os-apps';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useOsAppNavigate(pageAccountId?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const { getSigningWallet } = useAppWalletActions();
  const [openingPage, setOpeningPage] = useState(false);

  const openPage = useCallback(async () => {
    if (openingPage) {
      return;
    }
    setOpeningPage(true);
    try {
      const { accountId } = await getSigningWallet();
      router.push(portfolioPath(accountId));
    } catch (error) {
      if (error instanceof WalletConnectedReviewError) {
        router.push(portfolioPath(error.accountId));
        return;
      }
      if (!isWalletUserCancellation(error)) {
        console.error('Could not open your page', error);
      }
    } finally {
      setOpeningPage(false);
    }
  }, [getSigningWallet, openingPage, router]);

  const navigate = useCallback(
    (app: OsAppLink): boolean => {
      if (app.soon) {
        return false;
      }
      if (osAppOpensWithWallet(app)) {
        void openPage();
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
    [openPage, pageAccountId, pathname, router]
  );

  return { navigate, openingPage };
}
