'use client';

import {
  osIconActionClassName,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { OsAppIcon } from '@/lib/os-app-icons';

/** Section identity for top-level OS apps — launcher hops; no back arrow. */
export function OsAppScreenMark({
  appId,
  label,
}: {
  appId: string;
  label: string;
}) {
  return (
    <span
      className={`${osIconActionClassName} os-app-screen-mark`}
      role="img"
      aria-label={label}
    >
      <OsAppIcon
        appId={appId}
        className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
      />
    </span>
  );
}
