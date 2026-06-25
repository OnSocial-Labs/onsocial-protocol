'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { portfolioPath } from '@/lib/overlay-routes';

export function GateConnect() {
  const router = useRouter();
  const { accountId, isConnected, isLoading, connect } = useAppWallet();

  useEffect(() => {
    if (!isLoading && isConnected && accountId) {
      router.replace(portfolioPath(accountId));
    }
  }, [accountId, isConnected, isLoading, router]);

  if (isLoading) {
    return null;
  }

  if (isConnected && accountId) {
    return (
      <div className="gate-connect">
        <span className="gate-connect-booting">Opening your page…</span>
      </div>
    );
  }

  return (
    <div className="gate-connect">
      <button className="gate-connect-button" type="button" onClick={connect}>
        Let’s connect
      </button>
    </div>
  );
}
