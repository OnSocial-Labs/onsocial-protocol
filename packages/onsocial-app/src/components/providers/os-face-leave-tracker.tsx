'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { applyOsFaceLeaveHop } from '@/lib/os-face-leave-store';

/** Record the current OS place so a face can dock-leave back here. */
export function OsFaceLeaveTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  applyOsFaceLeaveHop(search ? `${pathname}?${search}` : pathname);
  return null;
}
