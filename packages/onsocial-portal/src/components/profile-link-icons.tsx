import { Github, Globe } from 'lucide-react';
import {
  FaDiscord,
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import type {
  ProfileLinkDisplayItem,
  ProfileLinkKind,
} from '@/lib/profile-links';
import { cn } from '@/lib/utils';

/** Match endorsement / governance share rails (`gap-2.5`, `h-4 w-4`). */
export const profileLinkIconRowClass =
  'flex shrink-0 flex-wrap items-center gap-2.5';

export const profileLinkIconButtonClass =
  'inline-flex shrink-0 items-center justify-center text-muted-foreground/70 transition-all hover:scale-110 hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60';

export const profileLinkIconGlyphClass = 'h-4 w-4 shrink-0';

export const profileLinkHoverClass: Record<ProfileLinkKind, string> = {
  website: 'hover:text-[var(--portal-blue)]',
  x: 'hover:text-foreground',
  telegram: 'hover:text-[#26A5E4]',
  github: 'hover:text-[var(--portal-purple)]',
  instagram: 'hover:text-[#E4405F]',
  tiktok: 'hover:text-foreground',
  linkedin: 'hover:text-[#0A66C2]',
  youtube: 'hover:text-[#FF0000]',
  discord: 'hover:text-[#5865F2]',
};

export function ProfileLinkIcon({
  kind,
  className,
}: {
  kind: ProfileLinkKind;
  className?: string;
}) {
  if (kind === 'website') return <Globe className={className} />;
  if (kind === 'x') return <FaXTwitter className={className} />;
  if (kind === 'telegram') return <RiTelegram2Line className={className} />;
  if (kind === 'instagram') return <FaInstagram className={className} />;
  if (kind === 'tiktok') return <FaTiktok className={className} />;
  if (kind === 'linkedin') return <FaLinkedin className={className} />;
  if (kind === 'youtube') return <FaYoutube className={className} />;
  if (kind === 'discord') return <FaDiscord className={className} />;
  return <Github className={className} />;
}

export function profileLinkIconHoverClass(kind: ProfileLinkKind): string {
  return profileLinkHoverClass[kind];
}

export function ProfileLinkFieldIcon({
  kind,
  className,
}: {
  kind: ProfileLinkKind;
  className?: string;
}) {
  return (
    <ProfileLinkIcon
      kind={kind}
      className={cn('h-3.5 w-3.5 shrink-0', className)}
    />
  );
}

export function ProfileSocialLinkIcons({
  links,
  className,
}: {
  links: ProfileLinkDisplayItem[];
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <div className={cn(profileLinkIconRowClass, className)}>
      {links.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            profileLinkIconButtonClass,
            profileLinkHoverClass[item.kind]
          )}
          aria-label={`${item.label}: ${item.display}`}
        >
          <ProfileLinkIcon
            kind={item.kind}
            className={profileLinkIconGlyphClass}
          />
        </a>
      ))}
    </div>
  );
}
