'use client';

import { useEffect } from 'react';
import { installSingleMediaPlayback } from '@/lib/single-media-playback';

/** One playing post or clip at a time, including nested reply drawers. */
export function SingleMediaPlaybackHost() {
  useEffect(() => installSingleMediaPlayback(), []);
  return null;
}
