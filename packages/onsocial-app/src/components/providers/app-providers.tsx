'use client';

import { AppWalletProvider } from '@/contexts/app-wallet-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AppWalletProvider>{children}</AppWalletProvider>;
}
