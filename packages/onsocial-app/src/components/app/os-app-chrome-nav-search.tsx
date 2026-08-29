'use client';

import { useState, type ComponentProps } from 'react';
import { OsAppChromeNavSearch as UiOsAppChromeNavSearch } from '@onsocial/ui';
import { useRegisterSearchChromeActive } from '@/contexts/dock-chrome-context';

type OsAppChromeNavSearchProps = ComponentProps<typeof UiOsAppChromeNavSearch>;

/**
 * App nav search — same expand recipe as UI, and hides the dock back while
 * the mobile typing view is open (one back arrow).
 */
export function OsAppChromeNavSearch({
  onActiveChange,
  ...props
}: OsAppChromeNavSearchProps) {
  const [searchActive, setSearchActive] = useState(false);
  useRegisterSearchChromeActive(searchActive);

  return (
    <UiOsAppChromeNavSearch
      {...props}
      onActiveChange={(active) => {
        setSearchActive(active);
        onActiveChange?.(active);
      }}
    />
  );
}
