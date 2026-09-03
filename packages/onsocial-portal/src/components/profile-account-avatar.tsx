'use client';

import { User } from 'lucide-react';
import type { ProfileKind } from '@onsocial/sdk';
import {
  portalAccountAvatarShape,
  portalAvatarRadiusClass,
} from '@/lib/profile-avatar-shape';
import { cn } from '@/lib/utils';

export function ProfileAccountAvatar({
  accountId,
  avatarUrl,
  kind,
  className,
}: {
  accountId: string;
  avatarUrl: string | null;
  kind?: ProfileKind | null;
  className?: string;
}) {
  const radius = portalAvatarRadiusClass(
    portalAccountAvatarShape(accountId, kind)
  );

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border/50 bg-muted/30 text-muted-foreground',
        radius,
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4" strokeWidth={2} />
      )}
    </div>
  );
}
