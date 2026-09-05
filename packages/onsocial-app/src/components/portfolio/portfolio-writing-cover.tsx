'use client';

import { useMemo } from 'react';
import { previewTextCard } from '@onsocial/text-card';

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

export function PortfolioWritingCover({
  title,
  coverUrl,
  accountId,
  displayName,
  avatarUrl,
  postId,
  issuedAt,
}: {
  title: string;
  coverUrl?: string | null;
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  postId: string;
  issuedAt: number;
}) {
  const svg = useMemo(() => {
    if (coverUrl) return null;
    const { svg: markup } = previewTextCard({
      title,
      creator: {
        accountId,
        displayName: displayName?.trim() || accountId,
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      },
      theme: {
        bg: 'thought-night',
        markShape: 'rule',
        markColor: 'auto',
        titleAlign: 'left',
      },
      provenance: {
        issuedAt: issuedAt > 0 ? issuedAt : 0,
        postId,
      },
    });
    return inlineSvgMarkup(markup);
  }, [accountId, avatarUrl, coverUrl, displayName, issuedAt, postId, title]);

  if (coverUrl) {
    return (
      <img alt="" className="portfolio-writing-cover-photo" src={coverUrl} />
    );
  }

  if (!svg) return <div className="portfolio-writing-cover-fallback" />;

  return (
    <div
      className="portfolio-writing-cover-card"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
