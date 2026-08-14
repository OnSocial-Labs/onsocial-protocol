'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  ProtocolMotionArrow,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import { formatProtocolDaoProposalForRawDisplay } from '@/features/protocol/protocol-proposal-raw-display';
import type { ProtocolApplication } from '@/features/protocol/types';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';

/**
 * Quiet on-chain details — method/policy ref + decoded raw proposal JSON.
 * Kept off the Vote drawer so decisions stay decision-focused.
 */
export function ProtocolOnChainSheet({
  open,
  onClose,
  application,
}: {
  open: boolean;
  onClose: () => void;
  application: ProtocolApplication | null;
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

  const view = useMemo(
    () =>
      application
        ? deriveProtocolProposalView({
            application,
            accountId: null,
            daoPolicy: null,
          })
        : null,
    [application]
  );

  const rawJson = useMemo(() => {
    if (!view?.proposal) return null;
    return formatProtocolDaoProposalForRawDisplay(
      view.proposal,
      view.proposalId
    );
  }, [view]);

  const actionLabel =
    view?.onChainActionKind === 'method'
      ? 'Contract method'
      : view?.onChainActionKind === 'policy'
        ? 'DAO permission'
        : null;

  const explorerHref = application?.governance_proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${application.governance_proposal.tx_hash}`
    : null;

  const title =
    view?.proposalId != null
      ? `Proposal #${view.proposalId}`
      : 'On-chain details';

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={title}
      {...(view?.headline ? { copy: view.headline } : {})}
      closeAriaLabel="Close on-chain details"
      backdropLabel="Close on-chain details"
      zIndex={58}
      initialDetent="peek"
      peekRatio={0.62}
      bodyClassName="protocol-on-chain-sheet-body guild-facts-sheet-body"
    >
      <div className="os-sheet-facts guild-facts">
        {view?.onChainAction ? (
          <SheetFactSection title="Action">
            <SheetFactRow
              label={actionLabel ?? 'On-chain'}
              value={
                <span className="protocol-on-chain-action-value">
                  {view.onChainAction}
                  {view.onChainAction === 'vote' ? (
                    <span className="protocol-on-chain-action-hint">
                      {' '}
                      signal
                    </span>
                  ) : null}
                </span>
              }
            />
          </SheetFactSection>
        ) : null}

        {rawJson ? (
          <>
            {view?.onChainAction ? <Divider variant="detail" /> : null}
            <SheetFactSection title="Raw proposal">
              <pre className="protocol-on-chain-raw">
                <code>{rawJson}</code>
              </pre>
            </SheetFactSection>
          </>
        ) : (
          <p className="protocol-compose-note">
            Live proposal details are not available yet.
          </p>
        )}

        {explorerHref ? (
          <>
            <Divider variant="detail" />
            <SheetFactSection title="Explorer">
              <SheetFactRow
                label="Transaction"
                value={
                  <a
                    href={explorerHref}
                    className="guild-facts-link group"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="guild-facts-link-label">
                      View on Nearblocks
                    </span>
                    <ProtocolMotionArrow className="guild-facts-link-arrow" />
                  </a>
                }
              />
            </SheetFactSection>
          </>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
