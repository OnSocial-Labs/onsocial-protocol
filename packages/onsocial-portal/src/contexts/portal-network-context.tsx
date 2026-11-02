'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  portalNetworkCookie,
  portalNetworkFromEnv,
  portalNetworkProfile,
  type PortalNearNetwork,
  type PortalNetworkProfile,
} from '@/lib/portal-network';

interface PortalNetworkContextValue {
  network: PortalNearNetwork;
  profile: PortalNetworkProfile;
  appUrl: string;
  apiUrl: string;
  switching: boolean;
  chooseNetwork: (network: PortalNearNetwork) => void;
}

const PortalNetworkContext = createContext<PortalNetworkContextValue | null>(
  null
);

function fallbackNetwork(): PortalNetworkContextValue {
  const network = portalNetworkFromEnv();
  const profile = portalNetworkProfile(network);
  return {
    network,
    profile,
    appUrl: profile.appUrl,
    apiUrl: profile.apiUrl,
    switching: false,
    chooseNetwork: () => {},
  };
}

export function PortalNetworkProvider({
  network,
  children,
}: {
  network: PortalNearNetwork;
  children: ReactNode;
}) {
  const [switching, setSwitching] = useState(false);
  const profile = useMemo(() => portalNetworkProfile(network), [network]);

  const chooseNetwork = useCallback(
    (next: PortalNearNetwork) => {
      if (next === network || typeof document === 'undefined') return;
      setSwitching(true);
      document.cookie = portalNetworkCookie(next);
      window.location.reload();
    },
    [network]
  );

  const value = useMemo<PortalNetworkContextValue>(
    () => ({
      network,
      profile,
      appUrl: profile.appUrl,
      apiUrl: profile.apiUrl,
      switching,
      chooseNetwork,
    }),
    [chooseNetwork, network, profile, switching]
  );

  return (
    <PortalNetworkContext.Provider value={value}>
      {children}
    </PortalNetworkContext.Provider>
  );
}

export function usePortalNetwork(): PortalNetworkContextValue {
  return useContext(PortalNetworkContext) ?? fallbackNetwork();
}
