import {
  DiscordFillIcon,
  GithubFillIcon,
  GlobeIcon,
  InstagramFillIcon,
  LinkIcon,
  LinkedinFillIcon,
  OnSocialMark,
  TelegramFillIcon,
  TiktokFillIcon,
  XFillIcon,
  YoutubeFillIcon,
} from '@onsocial/ui';
import type { PortfolioLinkKind } from '@/lib/profile-social-links';

interface PortfolioLinkIconProps {
  kind: PortfolioLinkKind;
  className?: string;
}

/** Mage glyphs for portfolio social / link marks. */
export function PortfolioLinkIcon({ kind, className }: PortfolioLinkIconProps) {
  if (kind === 'website') return <GlobeIcon className={className} aria-hidden />;
  if (kind === 'onsocial') {
    return <OnSocialMark className={className} aria-hidden />;
  }
  if (kind === 'x') return <XFillIcon className={className} aria-hidden />;
  if (kind === 'telegram') {
    return <TelegramFillIcon className={className} aria-hidden />;
  }
  if (kind === 'instagram') {
    return <InstagramFillIcon className={className} aria-hidden />;
  }
  if (kind === 'tiktok') return <TiktokFillIcon className={className} aria-hidden />;
  if (kind === 'linkedin') {
    return <LinkedinFillIcon className={className} aria-hidden />;
  }
  if (kind === 'youtube') {
    return <YoutubeFillIcon className={className} aria-hidden />;
  }
  if (kind === 'discord') {
    return <DiscordFillIcon className={className} aria-hidden />;
  }
  if (kind === 'github') return <GithubFillIcon className={className} aria-hidden />;
  return <LinkIcon className={className} aria-hidden />;
}
