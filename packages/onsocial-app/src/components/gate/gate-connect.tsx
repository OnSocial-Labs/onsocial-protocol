'use client';

import { useAppWallet } from '@/contexts/app-wallet-context';

export function GateConnect() {
  const { isConnected, isLoading, connect } = useAppWallet();

  if (isLoading || isConnected) {
    return null;
  }

  return (
    <div className="gate-connect">
      <button className="gate-connect-button" type="button" onClick={connect}>
        Connect
      </button>
    </div>
  );
}
