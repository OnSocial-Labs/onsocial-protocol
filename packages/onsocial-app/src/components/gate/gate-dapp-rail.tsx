'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { appPageHref, GATE_DAPPS } from '@/lib/app-links';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function nearestIndex(container: HTMLElement): number {
  const items = container.querySelectorAll<HTMLElement>('[data-dapp-item]');
  if (items.length === 0) {
    return 0;
  }

  const centerY = container.scrollTop + container.clientHeight / 2;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  items.forEach((item, index) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const distance = Math.abs(itemCenter - centerY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

export function GateDappRail() {
  const router = useRouter();
  const { getSigningWallet } = useAppWallet();
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openingOnPage, setOpeningOnPage] = useState(false);

  const syncActiveIndex = useCallback(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    setActiveIndex(nearestIndex(container));
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    syncActiveIndex();

    container.addEventListener('scroll', syncActiveIndex, { passive: true });
    return () => {
      container.removeEventListener('scroll', syncActiveIndex);
    };
  }, [syncActiveIndex]);

  const openOnPage = useCallback(async () => {
    if (openingOnPage) {
      return;
    }

    setOpeningOnPage(true);
    try {
      const { accountId } = await getSigningWallet();
      router.push(appPageHref(accountId));
    } catch (error) {
      if (!isWalletUserCancellation(error)) {
        console.error('Could not open OnPage', error);
      }
    } finally {
      setOpeningOnPage(false);
    }
  }, [getSigningWallet, openingOnPage, router]);

  return (
    <nav className="gate-dapp-rail" aria-label="OnSocial dApps">
      <ul ref={listRef} className="gate-dapp-list">
        {GATE_DAPPS.map((dapp, index) => {
          const distance = Math.abs(index - activeIndex);
          const opacity =
            distance === 0 ? 1 : distance === 1 ? 0.34 : distance === 2 ? 0.14 : 0.06;
          const isOnPage = dapp.kind === 'onpage';

          return (
            <li key={dapp.label} data-dapp-item className="gate-dapp-item">
              {isOnPage ? (
                <button
                  type="button"
                  className="gate-dapp-link"
                  style={{ opacity }}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  disabled={openingOnPage}
                  onClick={() => void openOnPage()}
                >
                  {openingOnPage && index === activeIndex
                    ? 'Opening…'
                    : dapp.label}
                </button>
              ) : (
                <a
                  href={dapp.href}
                  className="gate-dapp-link"
                  style={{ opacity }}
                  aria-current={index === activeIndex ? 'true' : undefined}
                >
                  {dapp.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
