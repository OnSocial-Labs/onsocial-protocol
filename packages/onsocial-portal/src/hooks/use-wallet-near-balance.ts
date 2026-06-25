'use client';

import { useEffect, useState } from 'react';
import { getSpendableNearBalance, viewAccount } from '@/lib/near-rpc';

interface WalletNearBalanceState {
  loading: boolean;
  balanceYocto: bigint | null;
}

const initialState: WalletNearBalanceState = {
  loading: false,
  balanceYocto: null,
};

/** Spendable NEAR in the user's wallet (excludes locked + account storage reserve). */
export function useWalletNearBalance(
  accountId: string | null | undefined,
  enabled: boolean,
  refreshKey = 0
): WalletNearBalanceState {
  const activeAccountId = enabled && accountId ? accountId : null;
  const [state, setState] = useState<WalletNearBalanceState>(initialState);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const account = await viewAccount(activeAccountId);
        if (cancelled) return;

        setState({
          loading: false,
          balanceYocto: BigInt(getSpendableNearBalance(account)),
        });
        setLoadedAccountId(activeAccountId);
      } catch {
        if (cancelled) return;
        setState({ loading: false, balanceYocto: null });
        setLoadedAccountId(activeAccountId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, refreshKey]);

  if (!activeAccountId) {
    return initialState;
  }

  if (loadedAccountId !== activeAccountId && state.balanceYocto == null) {
    return { loading: true, balanceYocto: null };
  }

  return state;
}
