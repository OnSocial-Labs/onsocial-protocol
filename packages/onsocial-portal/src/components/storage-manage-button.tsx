'use client';

import {
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
  walletMenuActionButtonClass,
} from '@/components/ui/profile-action-pill';
import { cn } from '@/lib/utils';

interface StorageManageButtonProps {
  highlighted?: boolean;
  ariaLabel?: string;
  onClick: () => void;
}

export function StorageManageButton({
  highlighted = false,
  ariaLabel = 'Manage storage',
  onClick,
}: StorageManageButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={walletMenuActionButtonClass(
        highlighted ? 'claim-ready' : 'claim'
      )}
      aria-label={ariaLabel}
    >
      <span className={profileSocialStandingToggleClass}>
        <span
          className={cn(
            profileSocialStandingToggleStateClass,
            'justify-center'
          )}
        >
          Manage
        </span>
      </span>
    </button>
  );
}
