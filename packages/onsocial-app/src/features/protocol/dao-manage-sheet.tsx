'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';

export type DaoManageAction =
  | 'propose'
  | 'stake'
  | 'settings'
  | 'info'
  | 'edit';

/**
 * Portfolio Manage hub — Propose / Stake / Settings / Info / edit.
 * Members and Treasury stay on the face chips (not duplicated here).
 */
export function DaoManageSheet({
  open,
  daoName,
  canEdit,
  onClose,
  onAction,
}: {
  open: boolean;
  daoName?: string;
  canEdit: boolean;
  onClose: () => void;
  onAction: (action: DaoManageAction) => void;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

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
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
