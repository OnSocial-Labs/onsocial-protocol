'use client';

import Link from 'next/link';
import { getPortalProfileUrl } from '@/lib/portal-config';

const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;
const TICKER_IN_TEXT_RE = /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;

type Segment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'ticker'; value: string }
  | { type: 'mention'; value: string; accountId: string };

function splitBioRichText(text: string): Segment[] {
  type Hit = {
    index: number;
    length: number;
    segment: Exclude<Segment, { type: 'text' }>;
  };
  const hits: Hit[] = [];

  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    hits.push({
      index: match.index,
      length: match[0].length,
      segment: { type: 'hashtag', value: match[0] },
    });
  }

  TICKER_IN_TEXT_RE.lastIndex = 0;
  while ((match = TICKER_IN_TEXT_RE.exec(text)) !== null) {
    hits.push({
      index: match.index,
      length: match[0].length,
      segment: { type: 'ticker', value: match[0] },
    });
  }

  MENTION_IN_TEXT_RE.lastIndex = 0;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    hits.push({
      index: match.index,
      length: match[0].length,
      segment: {
        type: 'mention',
        value: match[0],
        accountId: match[1]!.toLowerCase(),
      },
    });
  }

  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.index < cursor) continue;
    if (hit.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, hit.index) });
    }
    segments.push(hit.segment);
    cursor = hit.index + hit.length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

/** Profile bio with # / $ / @ tokens (mentions link to portal profiles). */
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
      {splitBioRichText(text).map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        if (segment.type === 'mention') {
          return (
            <Link
              key={`m-${index}`}
              href={getPortalProfileUrl(segment.accountId)}
              className="os-mention underline-offset-2 hover:underline"
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
