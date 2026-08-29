'use client';

import { usePathname } from 'next/navigation';
import { rootLeaveHref, syncOsArrival } from '@/lib/os-arrival';

/** Dock leave on Home / Discover only after arriving from another in-app place. */
export function useOsRootLeaveHref(): string | null {
  const pathname = usePathname();
  return rootLeaveHref(pathname, syncOsArrival(pathname));
}
