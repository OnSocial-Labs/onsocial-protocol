'use client';

import { useEffect } from 'react';
import { startOsStableScroll } from './os-overlay-scroll-thumb.js';

let owners = 0;

/** One document watcher. Extra mounts share it. */
export function OsStableScrollHost() {
  useEffect(() => {
    owners += 1;
    if (owners > 1) {
      return () => {
        owners -= 1;
      };
    }
    let stop = () => {};
    const frame = window.requestAnimationFrame(() => {
      stop = startOsStableScroll();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      stop();
      owners -= 1;
    };
  }, []);
  return null;
}
