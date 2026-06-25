import { Github, Globe, Link2 } from 'lucide-react';
import {
  FaDiscord,
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import type { PortfolioLinkKind } from '@/lib/profile-social-links';

interface PortfolioLinkIconProps {
  kind: PortfolioLinkKind;
  className?: string;
}

/** Portal glyph set — sized up for OnPage portfolio touch targets. */
export function PortfolioLinkIcon({ kind, className }: PortfolioLinkIconProps) {
  if (kind === 'website') return <Globe className={className} aria-hidden />;
  if (kind === 'x') return <FaXTwitter className={className} aria-hidden />;
  if (kind === 'telegram') {
    return <RiTelegram2Line className={className} aria-hidden />;
  }
  if (kind === 'instagram') return <FaInstagram className={className} aria-hidden />;
  if (kind === 'tiktok') return <FaTiktok className={className} aria-hidden />;
  if (kind === 'linkedin') return <FaLinkedin className={className} aria-hidden />;
  if (kind === 'youtube') return <FaYoutube className={className} aria-hidden />;
  if (kind === 'discord') return <FaDiscord className={className} aria-hidden />;
  if (kind === 'github') return <Github className={className} aria-hidden />;
  return <Link2 className={className} aria-hidden />;
}
