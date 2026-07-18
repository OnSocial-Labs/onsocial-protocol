'use client';

import Link from 'next/link';
import {
  autolinkDisplayHost,
  splitRichText,
} from '@onsocial/sdk';
import { LinkIcon } from '@onsocial/ui';
import { getPortalProfileUrl } from '@/lib/portal-config';

function BioAutolink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="os-link"
      target="_blank"
      rel="noopener noreferrer"
      title={href}
    >
      <LinkIcon className="os-link-icon" aria-hidden />
      <span className="os-link-label">{autolinkDisplayHost(href)}</span>
    </a>
  );
}

/** Profile bio with # / $ / @ / http(s) chips (mentions → portal profiles). */
export function ProfileBioRichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  return (
    <p className={className}>
      {splitRichText(text).map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        if (segment.type === 'url') {
          return <BioAutolink key={`u-${index}`} href={segment.href} />;
        }
        if (segment.type === 'mention') {
          return (
            <Link
              key={`m-${index}`}
              href={getPortalProfileUrl(segment.accountId)}
              className="os-mention"
            >
              {segment.value}
            </Link>
          );
        }
        if (segment.type === 'ticker') {
          return (
            <span key={`tk-${index}`} className="os-ticker">
              {segment.value}
            </span>
          );
        }
        return (
          <span key={`h-${index}`} className="os-hashtag">
            {segment.value}
          </span>
        );
      })}
    </p>
  );
}
