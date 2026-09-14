'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GatePwaInstall } from '@/components/gate/gate-pwa-install';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { gateContinuePath } from '@/lib/overlay-routes';

export function GateConnect() {
  const router = useRouter();
  const { accountId, isConnected, isLoading, connect } = useAppWallet();

  useEffect(() => {
    if (!isLoading && isConnected && accountId) {
      router.replace(
        gateContinuePath(accountId, window.location.search)
      );
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
      <GatePwaInstall />
    </div>
  );
}
