'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface NavVisibilityContextValue {
  navHidden: boolean;
  setNavHidden: (hidden: boolean) => void;
}

const NavVisibilityContext = createContext<NavVisibilityContextValue>({
  navHidden: false,
  setNavHidden: () => {},
});

export function NavVisibilityProvider({ children }: { children: ReactNode }) {
  const [navHidden, setNavHidden] = useState(false);

  const value = useMemo(
    () => ({ navHidden, setNavHidden }),
    [navHidden]
  );

  return (
    <NavVisibilityContext.Provider value={value}>
      {children}
    </NavVisibilityContext.Provider>
  );
}

export function useNavVisibility() {
  return useContext(NavVisibilityContext);
}
