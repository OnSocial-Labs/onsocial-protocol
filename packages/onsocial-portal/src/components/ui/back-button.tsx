import { ProtocolMotionArrow } from '@onsocial/ui';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function BackButton({
  ariaLabel = 'Go back',
  className,
  disabled = false,
  onClick,
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      aria-label={ariaLabel}
    >
      <ProtocolMotionArrow direction="left" className="h-4 w-4 opacity-100" />
    </button>
  );
}
