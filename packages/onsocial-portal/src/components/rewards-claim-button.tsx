'use client';

import { Button } from '@/components/ui/button';
import {
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
  walletMenuActionButtonClass,
} from '@/components/ui/profile-action-pill';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { cn } from '@/lib/utils';

interface RewardsClaimButtonProps {
  canClaim: boolean;
  claiming: boolean;
  /** Modal CTA vs wallet menu inline pill (matches Edit). */
  appearance?: 'modal' | 'inline';
  /** Tighter pill sizing for the wallet dropdown row. */
  compact?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}

export function RewardsClaimButton({
  canClaim,
  claiming,
  appearance = 'modal',
  compact = false,
  ariaLabel,
  disabled = false,
  onClick,
}: RewardsClaimButtonProps) {
  const isDisabled = disabled || !canClaim || claiming;

  if (appearance === 'inline') {
    return (
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        disabled={isDisabled}
        aria-busy={claiming || undefined}
        aria-label={ariaLabel}
        className={cn(
          walletMenuActionButtonClass(canClaim ? 'claim-ready' : 'claim'),
          compact &&
            'px-2 py-px portal-type-micro md:px-2.5 md:py-0.5 md:portal-type-label'
        )}
      >
        <span className={profileSocialStandingToggleClass}>
          <span
            className={cn(
              profileSocialStandingToggleStateClass,
              'justify-center',
              claiming && 'invisible'
            )}
            aria-hidden={claiming}
          >
            Claim
          </span>
          <span
            className={cn(
              profileSocialStandingToggleStateClass,
              'justify-center text-current opacity-70',
              !claiming && 'invisible'
            )}
            aria-hidden={!claiming}
          >
            <PulsingDots size="sm" />
          </span>
        </span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="accent"
      size="sm"
      disabled={isDisabled}
      loading={claiming}
      onClick={() => {
        void onClick();
      }}
      aria-label={ariaLabel}
      className="min-w-[4rem] shrink-0 justify-center"
    >
      Claim
    </Button>
  );
}
