import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalCloseButtonProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function ModalCloseButton({
  ariaLabel,
  className,
  disabled = false,
  onClick,
}: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      aria-label={ariaLabel}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
