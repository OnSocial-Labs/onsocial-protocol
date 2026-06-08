'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useId } from 'react';

import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { SocialSwapPanel } from '@/components/social-swap-panel';
import {
  compactModalBodyClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  PORTAL_SWAP_ENABLED,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';
import { cn } from '@/lib/utils';

export function SocialSwapModal({
  open,
  onOpenChange,
  defaultTokenIn = 'near',
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTokenIn?: PortalSwapInputKind;
  onSuccess?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  useBodyScrollLock(open);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close get SOCIAL dialog"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 14,
              scale: 0.98,
              duration: 0.22,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              compactModalShellClass,
              portalElevatedShadowClass,
              !PORTAL_SWAP_ENABLED && 'max-w-sm'
            )}
          >
            <ModalHeader
              titleId={titleId}
              eyebrow={PORTAL_SWAP_ENABLED ? 'Token' : 'Season 0'}
              title={
                PORTAL_SWAP_ENABLED ? (
                  <>
                    Get <span className="portal-green-text">$</span>SOCIAL
                  </>
                ) : (
                  'How to get SOCIAL'
                )
              }
              description={
                PORTAL_SWAP_ENABLED
                  ? 'Bring NEAR or USDC — leave with SOCIAL on Rhea.'
                  : 'Stock up to join the rally.'
              }
              bordered
              actions={
                <ModalCloseButton
                  ariaLabel="Close get SOCIAL dialog"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div className={compactModalBodyClass}>
              <SocialSwapPanel
                defaultTokenIn={defaultTokenIn}
                onSuccess={() => {
                  onSuccess?.();
                  onOpenChange(false);
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
