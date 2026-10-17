'use client';

import { useCallback, useState } from 'react';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { SHEET_Z } from '@/lib/sheet-z';

export type DaoManageAction =
  | 'propose'
  | 'stake'
  | 'settings'
  | 'info'
  | 'edit'
  | 'publish-social'
  | 'claim-support'
  | 'propose-mood'
  | 'boost';

/**
 * Stake row for one open of Manage.
 * Hidden until the path check settles. The first settled answer is kept for
 * the rest of that open, so a later fetch cannot pull the row.
 */
export function nextHeldStake(input: {
  open: boolean;
  wasOpen: boolean;
  held: boolean | null;
  stakePathReady: boolean;
  showStake: boolean;
}): boolean | null {
  if (!input.open) return null;
  if (!input.wasOpen) {
    return input.stakePathReady ? input.showStake : null;
  }
  if (input.held === null && input.stakePathReady) {
    return input.showStake;
  }
  return input.held;
}

/**
 * Portfolio Manage hub — Propose / Stake / Settings / Info / edit / publish /
 * claim / mood / boost.
 * Same ActionDrawer chrome as guild Manage. Members and Treasury stay on the
 * face chips (not duplicated here).
 */
export function DaoManageSheet({
  open,
  daoName,
  canEdit,
  canPropose = false,
  canProposeCall = false,
  showStake = false,
  stakePathReady = false,
  claimSupportLabel,
  councilAccessPending = false,
  onClose,
  onAction,
}: {
  open: boolean;
  daoName?: string;
  /** ChangeConfig — Edit profile (face branding). */
  canEdit: boolean;
  /** This DAO's policy says the viewer can add a proposal. Guests stay hidden. */
  canPropose?: boolean;
  /** FunctionCall — Publish OnSocial / mood / Boost / claim. */
  canProposeCall?: boolean;
  /** Confirmed SOCIAL stake path. Shown only after `stakePathReady`. */
  showStake?: boolean;
  /** Stake-path check has settled, including an RPC error. */
  stakePathReady?: boolean;
  /** When set, council can propose claiming the Support pot. */
  claimSupportLabel?: string | null;
  /** Connected viewer — council rows may still be resolving. */
  councilAccessPending?: boolean;
  onClose: () => void;
  onAction: (action: DaoManageAction) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [heldShowStake, setHeldShowStake] = useState<boolean | null>(null);
  const sheetOpen = open && !closing;
  const showClaimSupport = Boolean(canProposeCall && claimSupportLabel);
  const nextStake = nextHeldStake({
    open,
    wasOpen,
    held: heldShowStake,
    stakePathReady,
    showStake,
  });

  if (open !== wasOpen) {
    setWasOpen(open);
  }
  if (nextStake !== heldShowStake) {
    setHeldShowStake(nextStake);
  }

  const stakeInMenu = heldShowStake === true;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const run = (action: DaoManageAction) => {
    onAction(action);
    requestClose();
  };

  const items: ActionDrawerItem[] = [
    ...(canPropose
      ? [
          {
            id: 'propose',
            label: 'Propose',
            description: 'Create a governance proposal',
            onSelect: () => run('propose'),
          } satisfies ActionDrawerItem,
        ]
      : []),
    ...(stakeInMenu
      ? [
          {
            id: 'stake',
            label: 'Stake',
            description: 'Deposit and delegate SOCIAL',
            onSelect: () => run('stake'),
          } satisfies ActionDrawerItem,
        ]
      : []),
    {
      id: 'settings',
      label: 'Settings',
      description: 'Change policy via proposal',
      onSelect: () => run('settings'),
    },
    {
      id: 'info',
      label: 'Info',
      description: 'Policy, bond, and treasury snapshot',
      onSelect: () => run('info'),
    },
    ...(canEdit
      ? [
          {
            id: 'edit',
            label: 'Edit profile',
            description: 'Cover, crest, name, and purpose (config)',
            onSelect: () => run('edit'),
          } satisfies ActionDrawerItem,
        ]
      : []),
    ...(canProposeCall
      ? [
          {
            id: 'publish-social',
            label: 'Publish OnSocial profile',
            description: 'Face, About page, and profile keys',
            onSelect: () => run('publish-social'),
          },
          {
            id: 'propose-mood',
            label: 'Propose mood',
            description: 'Council Call to set the page look',
            onSelect: () => run('propose-mood'),
          },
          {
            id: 'boost',
            label: 'Boost',
            description: 'Lock treasury SOCIAL into Boost',
            onSelect: () => run('boost'),
          },
        ]
      : []),
    ...(showClaimSupport
      ? [
          {
            id: 'claim-support',
            label: 'Claim support',
            description: `Propose collecting ${claimSupportLabel} to the DAO wallet`,
            onSelect: () => run('claim-support'),
          } satisfies ActionDrawerItem,
        ]
      : []),
  ];

  return (
    <ActionDrawer
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Manage"
      copy={daoName?.trim() || 'DAO tools'}
      listAriaLabel="DAO manage"
      closeAriaLabel="Close"
      backdropLabel="Close DAO manage"
      zIndex={SHEET_Z.facts}
      panelClassName="os-sheet-cap-short"
      items={items}
      hint={councilAccessPending ? 'Checking council access…' : undefined}
    />
  );
}
