'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';

export type DaoManageAction =
  | 'propose'
  | 'stake'
  | 'settings'
  | 'info'
  | 'edit'
  | 'members'
  | 'treasury';

/**
 * Portfolio Manage hub — Propose / Stake / Settings / Info / lists / edit.
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
      headerClassName="dao-manage-sheet-header"
      panelClassName="dao-manage-sheet-panel"
      bodyClassName="dao-manage-sheet-body"
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
        <OsSurfaceRow
          label="Members"
          description="Group roles on this DAO"
          onClick={() => run('members')}
        />
        <OsSurfaceRow
          label="Treasury"
          description="Balances held by this DAO"
          onClick={() => run('treasury')}
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
