'use client';

import { useCallback } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';

/**
 * Shared writer helper — always uses write-capable `getClient()` (session or
 * wallet). Do not add hasSocialSession gates around `withClient`.
 */
export function useOnSocialWriter() {
  const { isConnected, isLoading } = useAppWallet();
  const { getClient } = useAppOnSocialClient();

  const withClient = useCallback(async () => {
    const { client, accountId } = await getClient();
    return {
      accountId,
      client,
    };
  }, [getClient]);

  return {
    isConnected,
    isLoading,
    withClient,
  };
}
