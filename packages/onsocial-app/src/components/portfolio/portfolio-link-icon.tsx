import {
  BookmarkIcon,
  CameraIcon,
  DiscordFillIcon,
  GithubFillIcon,
  GlobeIcon,
  HomeIcon,
  InstagramFillIcon,
  LinkIcon,
  LinkedinFillIcon,
  NoteTextIcon,
  OnSocialMark,
  ShopIcon,
  TelegramFillIcon,
  TiktokFillIcon,
  VideoPlayerIcon,
  XFillIcon,
  YoutubeFillIcon,
} from '@onsocial/ui';
import {
  portfolioLinkKindFromHref,
  type PortfolioLinkKind,
} from '@/lib/profile-social-links';
import type { PortfolioWebsiteMark } from '@/lib/profile-websites';

interface PortfolioLinkIconProps {
  kind: PortfolioLinkKind;
  className?: string;
}

/** Mage glyphs for portfolio social / link marks. */
export function PortfolioLinkIcon({ kind, className }: PortfolioLinkIconProps) {
  if (kind === 'website')
    return <GlobeIcon className={className} aria-hidden />;
  if (kind === 'onsocial') {
    return (
      <OnSocialMark
        className={`${className ?? ''} portfolio-link-icon--onsocial`.trim()}
        aria-hidden
      />
    );
  }
  if (kind === 'x') return <XFillIcon className={className} aria-hidden />;
  if (kind === 'telegram') {
    return <TelegramFillIcon className={className} aria-hidden />;
  }
  if (kind === 'instagram') {
    return <InstagramFillIcon className={className} aria-hidden />;
  }
  if (kind === 'tiktok')
    return <TiktokFillIcon className={className} aria-hidden />;
  if (kind === 'linkedin') {
    return <LinkedinFillIcon className={className} aria-hidden />;
  }
  if (kind === 'youtube') {
    return <YoutubeFillIcon className={className} aria-hidden />;
  }
  if (kind === 'discord') {
    return <DiscordFillIcon className={className} aria-hidden />;
  }
  if (kind === 'github')
    return <GithubFillIcon className={className} aria-hidden />;
  return <LinkIcon className={className} aria-hidden />;
}

/** Chosen drawer mark. The face never uses this. */
export function PortfolioWebsiteMarkIcon({
  mark,
  className,
}: {
  mark: PortfolioWebsiteMark;
  className?: string;
}) {
  if (mark === 'globe') return <GlobeIcon className={className} aria-hidden />;
  if (mark === 'home') return <HomeIcon className={className} aria-hidden />;
  if (mark === 'shop') return <ShopIcon className={className} aria-hidden />;
  if (mark === 'camera')
    return <CameraIcon className={className} aria-hidden />;
  if (mark === 'note')
    return <NoteTextIcon className={className} aria-hidden />;
  if (mark === 'video') {
    return <VideoPlayerIcon className={className} aria-hidden />;
  }
  if (mark === 'bookmark') {
    return <BookmarkIcon className={className} aria-hidden />;
  }
  return <LinkIcon className={className} aria-hidden />;
}

/** Drawer and editor glyph. A chosen mark wins; otherwise the address decides. */
export function PortfolioWebsiteGlyph({
  href,
  mark,
  className,
}: {
  href: string;
  mark?: PortfolioWebsiteMark | '';
  className?: string;
}) {
  if (mark) {
    return <PortfolioWebsiteMarkIcon mark={mark} className={className} />;
  }
  return (
    <PortfolioLinkIcon
      kind={portfolioLinkKindFromHref(href)}
      className={className}
    />
  );
}
