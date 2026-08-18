'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';

export type DaoManageAction =
  | 'propose'
  | 'stake'
  | 'settings'
  | 'info'
  | 'edit'
  | 'claim-support'
  | 'propose-mood'
  | 'boost';

/**
 * Portfolio Manage hub — Propose / Stake / Settings / Info / edit / claim / mood / boost.
 * Members and Treasury stay on the face chips (not duplicated here).
 */
export function DaoManageSheet({
  open,
  daoName,
  canEdit,
  claimSupportLabel,
  claimSupportPending = false,
  onClose,
  onAction,
}: {
  open: boolean;
  daoName?: string;
  canEdit: boolean;
  /** When set, council can propose claiming the Support pot. */
  claimSupportLabel?: string | null;
  claimSupportPending?: boolean;
  onClose: () => void;
  onAction: (action: DaoManageAction) => void;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const showClaimSupport = Boolean(canEdit && claimSupportLabel);

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

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Manage"
      copy={daoName?.trim() || 'DAO tools'}
      closeAriaLabel="Close"
      backdropLabel="Close DAO manage"
      zIndex={57}
      initialDetent="peek"
    >
      <OsSurfaceRowList
        className="dao-manage-sheet-list"
        aria-label="DAO manage"
      >
        <OsSurfaceRow
          label="Propose"
          description="Create a governance proposal"
          onClick={() => run('propose')}
        />
        <OsSurfaceRow
          label="Stake"
          description="Deposit and delegate SOCIAL"
          onClick={() => run('stake')}
        />
        <OsSurfaceRow
          label="Settings"
          description="Change policy via proposal"
          onClick={() => run('settings')}
        />
        <OsSurfaceRow
          label="Info"
          description="Policy, bond, and treasury snapshot"
          onClick={() => run('info')}
        />
        {canEdit ? (
          <OsSurfaceRow
            label="Edit profile"
            description="Cover, crest, name, and about"
            onClick={() => run('edit')}
          />
        ) : null}
        {canEdit ? (
          <OsSurfaceRow
            label="Propose mood"
            description="Council Call to set the page look"
            onClick={() => run('propose-mood')}
          />
        ) : null}
        {canEdit ? (
          <OsSurfaceRow
            label="Boost"
            description="Lock treasury SOCIAL into Boost"
            onClick={() => run('boost')}
          />
        ) : null}
        {showClaimSupport ? (
          <OsSurfaceRow
            label={claimSupportPending ? 'Claiming…' : 'Claim support'}
            description={`Propose collecting ${claimSupportLabel} to the DAO wallet`}
            disabled={claimSupportPending}
            onClick={() => run('claim-support')}
          />
        ) : null}
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
