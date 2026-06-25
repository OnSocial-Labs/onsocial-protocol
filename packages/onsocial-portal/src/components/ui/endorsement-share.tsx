'use client';

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Link2, Mail, Share2 } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import { cardDividerDetail } from '@/components/ui/card-divider';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  endorsementPartyName,
  humanizeEndorsementTopic,
} from '@/lib/endorsements';
import {
  getPortalEndorsementsUrl,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
import { cn } from '@/lib/utils';

export type EndorsementShareContext = {
  pageAccountId: string;
  mode?: PortalEndorsementsMode;
  issuer: string;
  target: string;
  topic?: string | null;
  issuerName?: string | null;
  targetName?: string | null;
  viewerAccountId?: string | null;
};

function buildEndorsementShareSummary(
  issuer: string,
  target: string,
  topic: string | null | undefined,
  issuerName?: string | null,
  targetName?: string | null,
  viewerAccountId?: string | null
): string {
  const issuerLabel = endorsementPartyName(issuer, issuerName, viewerAccountId);
  const targetLabel = endorsementPartyName(target, targetName, viewerAccountId);
  const topicLabel = humanizeEndorsementTopic(topic ?? undefined) || 'General';
  return `${issuerLabel} endorsed ${targetLabel} for ${topicLabel}`;
}

function stopRowActivation(event: MouseEvent) {
  event.stopPropagation();
}

const shareActionClass =
  'text-muted-foreground transition-all hover:scale-110 hover:text-foreground hover:brightness-125';

const shareIconButtonClass = cn(
  shareActionClass,
  // Keep the visible glyph compact while giving touch users a forgiving target.
  "relative inline-flex size-4 shrink-0 items-center justify-center p-0 leading-none before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-['']"
);

/** Shared SVG sizing for footer rail icons (share, support, etc.). */
export const endorsementFooterRailIconClass = 'size-4 shrink-0';

/** Space before share icons — heart sits just left of this gutter; count grows left. */
export const endorsementShareFooterLeadingClass = 'mr-4 shrink-0 sm:mr-7';

export { shareActionClass as endorsementShareActionClass };
export { shareIconButtonClass as endorsementShareIconButtonClass };

export function EndorsementFooterIconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(shareIconButtonClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** Matches governance proposal share — footer row, h-4 icons, room for more actions. */
export function ShareEndorsement({
  pageAccountId,
  mode = 'received',
  issuer,
  target,
  topic,
  issuerName,
  targetName,
  viewerAccountId = null,
  leading,
  laneAligned = false,
  embedded = false,
  className,
}: EndorsementShareContext & {
  /** Future actions on the same rail (e.g. support, react). */
  leading?: ReactNode;
  /** Width set by media lane — drop extra inset padding. */
  laneAligned?: boolean;
  /** Inline footer cell — no top rule, sits beside attribution. */
  embedded?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare] = useState(
    () => typeof navigator !== 'undefined' && !!navigator.share
  );

  const summary = buildEndorsementShareSummary(
    issuer,
    target,
    topic,
    issuerName,
    targetName,
    viewerAccountId
  );

  const getUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${getPortalEndorsementsUrl(pageAccountId, {
      mode,
      issuer,
      target,
      topic,
    })}`;
  }, [issuer, mode, pageAccountId, target, topic]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getUrl]);

  const shareText = `${summary} on OnSocial`;

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: `OnSocial endorsement: ${summary}`,
        text: shareText,
        url: getUrl(),
      });
    } catch {
      /* user cancelled */
    }
  }, [getUrl, shareText, summary]);

  const xText = `${summary} on @OnSocial`;
  const tgText = `New OnSocial endorsement: ${summary}`;
  const emailSubject = `OnSocial endorsement: ${summary}`;
  const emailBody = `Hey, check out this endorsement on OnSocial:\n\n${summary}\n\n${getUrl()}`;

  return (
    <div
      className={cn(
        embedded
          ? 'flex shrink-0 items-center justify-end gap-2.5'
          : 'mt-2 flex items-center justify-end gap-2.5 border-t pt-2.5',
        !embedded && cardDividerDetail,
        className
      )}
      onClick={stopRowActivation}
      onPointerDown={stopRowActivation}
    >
      {leading}
      {canNativeShare ? (
        <>
          <PortalHoverTooltip
            tooltip="Share endorsement"
            className="inline-flex shrink-0 items-center"
          >
            <EndorsementFooterIconButton
              onClick={handleNativeShare}
              aria-label="Share endorsement"
            >
              <Share2 className={endorsementFooterRailIconClass} />
            </EndorsementFooterIconButton>
          </PortalHoverTooltip>

          <PortalHoverTooltip
            tooltip="Copy link"
            className="inline-flex shrink-0 items-center"
          >
            <EndorsementFooterIconButton
              onClick={handleCopy}
              aria-label="Copy link"
            >
              <Link2
                className={cn(
                  endorsementFooterRailIconClass,
                  copied ? 'text-green-400' : ''
                )}
              />
            </EndorsementFooterIconButton>
          </PortalHoverTooltip>
        </>
      ) : (
        <>
          <PortalHoverTooltip
            tooltip="Share on X"
            className="inline-flex shrink-0 items-center"
          >
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(getUrl())}`}
              target="_blank"
              rel="noreferrer"
              className={shareIconButtonClass}
              aria-label="Share on X"
              onClick={stopRowActivation}
            >
              <FaXTwitter className={endorsementFooterRailIconClass} />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip
            tooltip="Share on Telegram"
            className="inline-flex shrink-0 items-center"
          >
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(getUrl())}&text=${encodeURIComponent(tgText)}`}
              target="_blank"
              rel="noreferrer"
              className={cn(shareIconButtonClass, 'hover:text-[#26A5E4]')}
              aria-label="Share on Telegram"
              onClick={stopRowActivation}
            >
              <RiTelegram2Line className={endorsementFooterRailIconClass} />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip
            tooltip="Share via email"
            className="inline-flex shrink-0 items-center"
          >
            <a
              href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
              target="_blank"
              rel="noreferrer"
              className={shareIconButtonClass}
              aria-label="Share via email"
              onClick={stopRowActivation}
            >
              <Mail className={endorsementFooterRailIconClass} />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip
            tooltip="Copy link"
            className="inline-flex shrink-0 items-center"
          >
            <EndorsementFooterIconButton
              onClick={handleCopy}
              aria-label="Copy link"
            >
              <Link2
                className={cn(
                  endorsementFooterRailIconClass,
                  copied ? 'text-green-400' : ''
                )}
              />
            </EndorsementFooterIconButton>
          </PortalHoverTooltip>
        </>
      )}
    </div>
  );
}
