'use client';

import { useCallback, useState } from 'react';
import {
  DaoWorkspacePanel,
  type DaoWorkspaceTool,
} from '@/features/protocol/dao-workspace-panel';

/**
 * DAO proposals overlay — Standing-style slide-over with the workspace feed.
 * Share via `/@id?proposal=&status=&q=` (portfolio opens this sheet).
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

  return sheetOpen ? (
    <DaoWorkspacePanel
      daoAccountId={daoAccountId}
      hideTools
      toolRequest={toolRequest}
      onToolRequestHandled={onToolRequestHandled}
      sheet={{
        open: sheetOpen,
        onRequestClose: requestClose,
        onClosed: handleClosed,
        title: 'Proposals',
        subtitle: daoName?.trim() || daoAccountId,
        closeAriaLabel: 'Back from proposals',
      }}
    />
  ) : null;
}
