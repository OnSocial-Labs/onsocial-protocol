'use client';

import { Download } from 'lucide-react';
import { usePwa } from '@/components/providers/pwa-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PwaInstallButtonProps = {
  compact?: boolean;
  className?: string;
};

export function PwaInstallButton({
  compact = false,
  className,
}: PwaInstallButtonProps) {
  const { canInstall, isInstalled, install } = usePwa();

  if (isInstalled || !canInstall) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      onClick={() => {
        void install();
      }}
      className={cn(
        'border-border/45 bg-background/70 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.34)] hover:border-border/70 hover:bg-background/84',
        className
      )}
      aria-label="Install OnSocial Portal"
      title="Install OnSocial Portal"
    >
      <Download className="h-4 w-4" />
      {compact ? null : <span>Install</span>}
    </Button>
  );
}
