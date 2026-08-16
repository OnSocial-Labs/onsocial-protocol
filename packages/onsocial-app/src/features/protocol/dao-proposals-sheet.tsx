'use client';

import { useCallback, useState } from 'react';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import {
  DaoWorkspacePanel,
  type DaoWorkspaceTool,
} from '@/features/protocol/dao-workspace-panel';

const PROPOSALS_Z = 74;

/**
 * DAO proposals overlay — Standing-style slide-over with the workspace feed.
 * Share via `/dao/[id]?proposal=&status=&q=` (portfolio opens this sheet).
 */
export function DaoProposalsSheet({
  open,
  daoAccountId,
  daoName,
  toolRequest = null,
  onToolRequestHandled,
  onClose,
}: {
  open: boolean;
  daoAccountId: string;
  daoName?: string;
  toolRequest?: DaoWorkspaceTool;
  onToolRequestHandled?: () => void;
  onClose: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Proposals"
      subtitle={daoName?.trim() || daoAccountId}
      closeAriaLabel="Back from proposals"
      zIndex={PROPOSALS_Z}
      className="dao-proposals-slide"
      contentClassName="dao-proposals-sheet"
    >
      {sheetOpen ? (
        <DaoWorkspacePanel
          daoAccountId={daoAccountId}
          hideTools
          toolRequest={toolRequest}
          onToolRequestHandled={onToolRequestHandled}
        />
      ) : null}
    </OsSlideOverScreen>
  );
}
