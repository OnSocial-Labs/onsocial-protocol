'use client';

import { useEffect } from 'react';
import { PORTAL_RUNTIME_WARNINGS } from '@/lib/portal-config';

export function RuntimeConfigWarnings() {
  useEffect(() => {
    if (PORTAL_RUNTIME_WARNINGS.length === 0) return;

    for (const warning of PORTAL_RUNTIME_WARNINGS) {
      console.warn(`[portal-config] ${warning}`);
    }
  }, []);

  return null;
}
