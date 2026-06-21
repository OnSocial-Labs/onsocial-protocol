import { Gift } from 'lucide-react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  profileSocialCollectArrowClass,
  profileSocialCollectButtonClass,
  profileSocialCollectGiftClass,
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
} from '@/components/ui/profile-action-pill';
import { cn } from '@/lib/utils';

export function profileSocialCollectAriaLabel(amountLabel: string): string {
  return `Collect ${amountLabel} SOCIAL`;
}

export function ProfileSocialCollectPill({
  amountLabel,
  pending = false,
  ariaLabel,
  onClick,
  className,
}: {
  amountLabel: string;
  pending?: boolean;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(profileSocialCollectButtonClass(), className)}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <ProtocolMotionArrow className={profileSocialCollectArrowClass()} />
      <span className={profileSocialStandingToggleClass}>
        <span
          className={cn(
            profileSocialStandingToggleStateClass,
            'gap-1',
            pending && 'invisible'
          )}
          aria-hidden={pending}
        >
          <Gift
            className={profileSocialCollectGiftClass()}
            strokeWidth={2}
            aria-hidden
          />
          {amountLabel} SOCIAL
        </span>
        <span
          className={cn(
            profileSocialStandingToggleStateClass,
            'justify-center text-current opacity-70',
            !pending && 'invisible'
          )}
          aria-hidden={!pending}
        >
          <PulsingDots size="sm" />
        </span>
      </span>
    </button>
  );
}
