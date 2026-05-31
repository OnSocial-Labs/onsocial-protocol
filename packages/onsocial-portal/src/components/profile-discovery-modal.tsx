'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import {
  formatDiscoveryProfileTotal,
  ProfileDiscoveryPanel,
} from '@/features/profile/profile-discovery-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ProfileDiscoveryModalProps {
  open: boolean;
  viewerAccountId: string | null;
  hasSocialSession?: boolean;
  totalProfiles?: number | null;
  onOpenChange: (open: boolean) => void;
  onSelectAccount: (accountId: string) => void;
  onUpdateStanding?: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<unknown>;
  onEndorse?: (
    target: string,
    input: import('@/lib/endorsements').EndorsementSubmitInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
}

/** @deprecated Prefer the /discover page. Kept for any legacy modal entry points. */
export function ProfileDiscoveryModal({
  open,
  viewerAccountId,
  hasSocialSession = false,
  totalProfiles = null,
  onOpenChange,
  onSelectAccount,
  onUpdateStanding,
}: ProfileDiscoveryModalProps) {
  const reduceMotion = useReducedMotion();
  const profileTotal = totalProfiles;
  const discoveryMeta = formatDiscoveryProfileTotal(profileTotal);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483644] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close profile discovery"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 16,
              scale: 0.98,
              duration: 0.22,
              exitY: 10,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-discovery-title"
            className={cn(
              'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId="profile-discovery-title"
              title="Discover profiles"
              description={discoveryMeta}
              descriptionVariant="meta"
              actions={
                <ModalCloseButton
                  ariaLabel="Close profile discovery"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 md:px-5">
              <ProfileDiscoveryPanel
                active={open}
                viewerAccountId={viewerAccountId}
                hasSocialSession={hasSocialSession}
                totalProfiles={totalProfiles}
                containedScroll
                onSelectAccount={(accountId) => {
                  onOpenChange(false);
                  onSelectAccount(accountId);
                }}
                onUpdateStanding={onUpdateStanding}
                autoFocusSearch
                searchClassName="pb-4"
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
