import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExternalLinkChipProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function ExternalLinkChip({
  className,
  children,
  ...props
}: ExternalLinkChipProps) {
  return (
    <a
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground',
        className
      )}
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
