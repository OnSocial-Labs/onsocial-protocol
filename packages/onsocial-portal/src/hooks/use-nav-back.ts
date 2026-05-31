'use client';

import { useLayoutEffect } from 'react';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';

/** Swap the navbar logo for a back button on secondary pages. */
export function useNavBack(label = 'Back'): void {
  const { setNavBack } = useMobilePageContext();

  useLayoutEffect(() => {
    setNavBack({ label });
    return () => setNavBack(null);
  }, [label, setNavBack]);
}
