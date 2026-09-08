'use client';

import type { ProfileAboutAlign } from '@onsocial/sdk';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
} from '@onsocial/ui';

/** Mage align glyphs for About / Article essay tools. */
export function ProfileAlignToolIcon({
  option,
}: {
  option: ProfileAboutAlign;
}) {
  const className = 'profile-align-tool-icon';
  if (option === 'center') {
    return <AlignCenterIcon className={className} aria-hidden />;
  }
  if (option === 'justify') {
    return <AlignJustifyIcon className={className} aria-hidden />;
  }
  return <AlignLeftIcon className={className} aria-hidden />;
}
