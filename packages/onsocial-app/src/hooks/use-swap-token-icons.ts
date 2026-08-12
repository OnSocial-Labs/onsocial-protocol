'use client';

import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import type { AppSwapInputKind } from '@/lib/app-swap-config';

const NEAR_ICON = '/near.svg';

/** Local NEAR mark + SOCIAL metadata icon for Get SOCIAL amount fields. */
export function useSwapTokenIcons(enabled: boolean) {
  const socialIcon = useSocialTokenIcon(enabled);

  const inputIcon = (kind: AppSwapInputKind): string | null =>
    kind === 'near' ? NEAR_ICON : null;

  return {
    nearIcon: NEAR_ICON,
    socialIcon,
    usdcIcon: null as string | null,
    inputIcon,
  };
}
