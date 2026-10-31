'use client';

import { osFloatingPanelCountClassName } from '@onsocial/ui';
import { formatProfileCount } from '@/lib/profile-social-standings';

export function GuildCountBadge({
  count,
  tone = 'standing',
}: {
  count: number;
  tone?: 'standing' | 'solidarity';
}) {
  return (
    <span
      className={`${osFloatingPanelCountClassName} os-floating-panel-count--${tone}${
        count === 0 ? ' is-zero' : ''
      }`}
    >
      {formatProfileCount(count)}
    </span>
  );
}
