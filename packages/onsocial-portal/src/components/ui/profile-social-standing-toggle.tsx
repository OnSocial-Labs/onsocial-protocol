import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  profileSocialStandingArrowClass,
  profileSocialStandingDotClass,
  profileSocialStandingIconSlotClass,
  profileSocialStandingStepBackArrowClass,
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
} from '@/components/ui/profile-action-pill';
import { cn } from '@/lib/utils';

interface ProfileSocialStandingToggleProps {
  active: boolean;
  hasSocialSession: boolean;
}

function ProfileSocialStandingSizingGhost() {
  return (
    <>
      <ProtocolMotionArrow className={profileSocialStandingArrowClass()} />
      Stand with
    </>
  );
}

export function ProfileSocialStandingToggle({
  active,
  hasSocialSession,
}: ProfileSocialStandingToggleProps) {
  return (
    <span className={profileSocialStandingToggleClass}>
      <span
        className={cn(profileSocialStandingToggleStateClass, 'invisible')}
        aria-hidden="true"
      >
        <ProfileSocialStandingSizingGhost />
      </span>

      {!active ? (
        <span className={profileSocialStandingToggleStateClass}>
          <ProtocolMotionArrow
            className={cn(profileSocialStandingArrowClass(), 'opacity-100')}
          />
          {hasSocialSession ? 'Stand with' : 'Authorize & stand'}
        </span>
      ) : (
        <>
          <span
            className={cn(
              profileSocialStandingToggleStateClass,
              'opacity-100 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0'
            )}
          >
            <span
              className={profileSocialStandingIconSlotClass}
              aria-hidden="true"
            >
              <span className={profileSocialStandingDotClass} />
            </span>
            Standing
          </span>
          <span
            className={cn(
              profileSocialStandingToggleStateClass,
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100'
            )}
          >
            <ProtocolMotionArrow
              direction="left"
              className={profileSocialStandingStepBackArrowClass}
            />
            Step back
          </span>
        </>
      )}
    </span>
  );
}

/** Keeps pill width/height — label stays in layout while dots overlay. */
export function CompactActionPillPending({ label }: { label: string }) {
  return (
    <span className={profileSocialStandingToggleClass}>
      <span
        className={cn(profileSocialStandingToggleStateClass, 'invisible')}
        aria-hidden="true"
      >
        {label}
      </span>
      <span
        className={cn(
          profileSocialStandingToggleStateClass,
          'justify-center text-current opacity-70'
        )}
      >
        <PulsingDots size="sm" />
      </span>
    </span>
  );
}

export function ProfileSocialStandingPending(
  _props: ProfileSocialStandingToggleProps
) {
  return (
    <span className={profileSocialStandingToggleClass}>
      <span
        className={cn(profileSocialStandingToggleStateClass, 'invisible')}
        aria-hidden="true"
      >
        <ProfileSocialStandingSizingGhost />
      </span>
      <span
        className={cn(
          profileSocialStandingToggleStateClass,
          'justify-center text-muted-foreground/55'
        )}
      >
        <PulsingDots size="sm" />
      </span>
    </span>
  );
}
