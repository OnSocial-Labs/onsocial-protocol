'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  cn,
  OsSheetAction,
  OsSheetActions,
  osSheetActionClassName,
} from '@onsocial/ui';
import {
  marketCreatorDropMetaBits,
  marketCreatorDropMintable,
  marketCreatorShopActionLabel,
} from '@/features/market/market-creator-view';
import { collectionPath } from '@/lib/app-routes';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Unlisted creator drop — same list row and action pill as Market listings. */
export function MarketCreatorDropRow({
  drop,
  onMint,
  showStatus = true,
}: {
  drop: ProfileStoreDrop;
  onMint?: (drop: ProfileStoreDrop) => void;
  showStatus?: boolean;
}) {
  const [brokenMediaUrl, setBrokenMediaUrl] = useState<string | null>(null);
  const showThumb = Boolean(drop.mediaUrl) && brokenMediaUrl !== drop.mediaUrl;
  const action = marketCreatorShopActionLabel(drop);
  const mintable = Boolean(onMint) && marketCreatorDropMintable(drop);
  const href = collectionPath(drop.collectionId);
  const meta = marketCreatorDropMetaBits(drop, { includeStatus: showStatus });

  return (
    <div
      className="market-listing-row market-creator-drop-row"
      role="listitem"
      data-market-creator-drop={drop.collectionId}
    >
      <Link
        href={href}
        scroll={false}
        className="collectibles-holding-row-main"
        title={`${drop.title} · ${action}`}
      >
        <div
          className={`market-listing-thumb${showThumb ? ' has-media' : ''}`}
          aria-hidden
        >
          {showThumb ? (
            <img
              src={drop.mediaUrl!}
              alt=""
              onError={() => setBrokenMediaUrl(drop.mediaUrl ?? null)}
            />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
        </div>
        <div className="market-listing-copy">
          <div className="market-listing-head">
            <p className="market-listing-title">{drop.title}</p>
          </div>
          {meta.length > 0 ? (
            <p className="market-listing-meta">{meta.join(' · ')}</p>
          ) : null}
        </div>
      </Link>
      <div className="market-listing-action-col collectibles-holding-action-col">
        <OsSheetActions
          layout="row-compact"
          tone="frosted-primary"
          size="sm"
          borderless
          className="market-listing-action collectibles-holding-action"
        >
          {mintable ? (
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              aria-label={`${action} ${drop.title}`}
              onClick={() => onMint?.(drop)}
            >
              {action}
            </OsSheetAction>
          ) : (
            <Link
              href={href}
              scroll={false}
              className={cn(
                osSheetActionClassName,
                'os-sheet-action--primary',
                'is-ready'
              )}
              aria-label={`${action} ${drop.title}`}
            >
              <span className="os-sheet-action__shell">
                <span className="os-sheet-action__label">{action}</span>
              </span>
            </Link>
          )}
        </OsSheetActions>
      </div>
    </div>
  );
}
