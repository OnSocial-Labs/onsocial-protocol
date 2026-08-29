'use client';

import { usePathname } from 'next/navigation';
import { syncOsArrival } from '@/lib/os-arrival';

/** Record every in-app place so Home / Discover can offer leave when you arrived. */
export function OsArrivalSync() {
  const pathname = usePathname();
  syncOsArrival(pathname);
  return null;
}
