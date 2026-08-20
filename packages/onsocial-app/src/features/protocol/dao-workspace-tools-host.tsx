'use client';

import {
  DaoWorkspacePanel,
  type DaoWorkspaceTool,
} from '@/features/protocol/dao-workspace-panel';

/**
 * Headless host for Manage Stake / Settings / Info — opens those drawers
 * without the proposals mood page behind them. Propose opens the proposals
 * page (dock) instead.
 */
export function DaoWorkspaceToolsHost({
  open,
  daoAccountId,
  toolRequest = null,
  onClose,
}: {
  open: boolean;
  daoAccountId: string;
  toolRequest?: DaoWorkspaceTool;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <DaoWorkspacePanel
      daoAccountId={daoAccountId}
      hideTools
      toolsHostOnly
      toolRequest={toolRequest}
      onToolsHostClose={onClose}
    />
  );
}
