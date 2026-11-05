'use client';

import { useCallback, useState } from 'react';
import {
  DaoWorkspacePanel,
  type DaoWorkspaceTool,
} from '@/features/protocol/dao-workspace-panel';

/**
 * Headless host for Manage Propose / Stake / Settings / Info — opens those
 * drawers without the proposals mood page behind them.
 *
 * Parent `open` drives the session. We stay mounted through the exit
 * animation so `onClosed` can clear local mount — never unmount when the
 * session ends, or the tool drawer vanishes mid-slide.
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
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const handleClosed = useCallback(() => {
    setMounted(false);
  }, []);

  if (!mounted) return null;

  return (
    <DaoWorkspacePanel
      daoAccountId={daoAccountId}
      hideTools
      toolsHostOnly
      toolRequest={open ? toolRequest : null}
      onToolsHostClose={onClose}
      onToolsHostClosed={handleClosed}
    />
  );
}
