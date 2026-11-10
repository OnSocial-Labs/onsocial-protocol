'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { osDockPillClassName } from '@onsocial/ui';
import { GatePwaInstall } from '@/components/gate/gate-pwa-install';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { gateContinuePath } from '@/lib/overlay-routes';

export function GateConnect() {
  const router = useRouter();
  const { accountId, isConnected, isLoading, connect } = useAppWallet();

  useEffect(() => {
    if (!isLoading && isConnected && accountId) {
      router.replace(gateContinuePath(accountId, window.location.search));
    }
  }, [accountId, isConnected, isLoading, router]);

  const ready = !isLoading;
  const booting = ready && isConnected && Boolean(accountId);

  return (
    <div className="gate-connect">
      {booting ? (
        <span className="gate-connect-booting">Opening your page…</span>
      ) : (
        <>
          <button
            className={`${osDockPillClassName} gate-connect-button`}
            type="button"
            onClick={() => {
              if (!ready) return;
              connect();
            }}
            aria-hidden={ready ? undefined : true}
            tabIndex={ready ? undefined : -1}
          >
            <span className="gate-connect-label">Let’s connect</span>
          </button>
          {ready ? <GatePwaInstall /> : null}
        </>
      )}
    </div>
  );
}
