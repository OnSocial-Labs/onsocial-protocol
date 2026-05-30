'use client';

import { Button } from '@/components/ui/button';
import { profileActionButtonClass } from '@/components/ui/profile-action-pill';
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
          profileActionButtonClass(canClaim ? 'green' : 'slate'),
          compact
            ? 'h-[1.35rem] min-w-[2.85rem] shrink-0 justify-center px-1.5 text-[9px] tracking-[0.12em] md:min-w-[3rem]'
            : 'h-[1.5rem] min-w-[3.1rem] shrink-0 justify-center px-1.5 text-[9px] tracking-[0.14em] md:h-[1.75rem] md:min-w-[3.5rem] md:px-2 md:text-[10px]'
        )}
      >
        {claiming ? '…' : 'Claim'}
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
