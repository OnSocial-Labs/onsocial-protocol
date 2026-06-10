'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import { buildPageMoodConfig } from '@/lib/moods/resolve';
import { fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useActivatePage(pageAccountId: string) {
  const router = useRouter();
  const { getSigningWallet } = useAppWallet();
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = useCallback(async () => {
    setError(null);
    setIsActivating(true);

    try {
      const { wallet, accountId: signingAccountId } =
        await getSigningWallet();

      if (signingAccountId !== pageAccountId) {
        throw new Error(
          `Connect as @${pageAccountId} to activate this page.`
        );
      }

      const os = createAppOnSocialClient(signingAccountId, wallet);
      const label = fallbackLabel(signingAccountId);
      const moodPatch = buildPageMoodConfig('default');

      await os.profiles.update({
        name: label,
        bio: `OnSocial page for @${signingAccountId}`,
      });

      await os.pages.setConfig({
        template: 'minimal',
        sections: ['profile', 'links', 'posts', 'badges'],
        tagline: `Welcome to my OnSocial page.`,
        mood: moodPatch.mood,
        theme: moodPatch.theme,
      });

      router.refresh();
    } catch (err) {
      if (isWalletUserCancellation(err)) {
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Could not activate your OnSocial page.'
      );
    } finally {
      setIsActivating(false);
    }
  }, [getSigningWallet, pageAccountId, router]);

  return {
    activate,
    error,
    isActivating,
  };
}
