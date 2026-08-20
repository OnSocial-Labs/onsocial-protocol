'use client';

import { useCallback, useState } from 'react';
import {
  DaoWorkspacePanel,
  type DaoWorkspaceTool,
} from '@/features/protocol/dao-workspace-panel';

/**
 * DAO proposals mood page — portfolio face mood, dock Propose when eligible.
 * Share via `/@id?proposal=&status=&q=` (portfolio opens this sheet).
 *
 * Parent `open` drives the sheet. We stay mounted through the exit animation
 * so `onClosed` can clear local mount — never unmount on back before that,
 * or overlay stays `'proposals'` and the chip looks dead.
 */
export function DaoProposalsSheet({
  open,
  daoAccountId,
  daoName,
  canPropose = false,
  toolRequest = null,
  onToolRequestHandled,
  onClose,
}: {
  open: boolean;
  daoAccountId: string;
  daoName?: string;
  canPropose?: boolean;
  toolRequest?: DaoWorkspaceTool;
  onToolRequestHandled?: () => void;
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
      canPropose={canPropose}
      toolRequest={toolRequest}
      onToolRequestHandled={onToolRequestHandled}
      sheet={{
        open,
        onRequestClose: onClose,
        onClosed: handleClosed,
        title: 'Proposals',
        subtitle: daoName?.trim() || daoAccountId,
        closeAriaLabel: 'Back from proposals',
      }}
    />
  );
}
