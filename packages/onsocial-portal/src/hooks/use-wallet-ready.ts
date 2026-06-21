'use client';

import { useWallet } from '@/contexts/wallet-context';

/**
 * Wallet bootstrap helpers — use while `NearConnector.getConnectedWallet()`
 * is still resolving on mount/refresh. Do not treat loading as disconnected.
 */
export function useWalletReady() {
  const wallet = useWallet();

  return {
    ...wallet,
    isWalletBootstrapping: wallet.isLoading,
    isWalletReady: !wallet.isLoading,
    showConnectPrompt: !wallet.isLoading && !wallet.isConnected,
  };
}
