'use client';

import { Globe } from 'lucide-react';

export function CommunityTilePreview({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl: string;
}) {
  const label = name.trim() || 'App name';
  const showRemote = iconUrl.startsWith('https://');

  return (
    <div className="flex w-[4.5rem] flex-col items-center gap-1.5">
      <div className="flex h-[3.25rem] w-[3.25rem] items-center justify-center overflow-hidden rounded-[0.82rem] border border-border/40 bg-muted/20">
        {showRemote ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <Globe className="h-5 w-5 text-muted-foreground/60" aria-hidden />
        )}
      </div>
      <span className="w-full truncate text-center text-[0.7rem] font-medium text-foreground">
        {label}
      </span>
    </div>
  );
}
