'use client';

import { useId } from 'react';

import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { Sheet } from '@/components/ui/sheet';
import { SocialSwapPanel } from '@/components/social-swap-panel';
import { compactModalBodyClass } from '@/components/ui/floating-panel';
import {
  PORTAL_SWAP_ENABLED,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';

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
  const titleId = useId();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      ariaLabelledby={titleId}
      dismissLabel="Close get SOCIAL dialog"
      panelClassName={!PORTAL_SWAP_ENABLED ? 'md:max-w-sm' : undefined}
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
    </Sheet>
  );
}
