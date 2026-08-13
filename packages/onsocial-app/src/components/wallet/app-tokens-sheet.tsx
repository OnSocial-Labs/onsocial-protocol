'use client';

import { useMemo, type CSSProperties } from 'react';
import Link from 'next/link';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import { APP_TOKENS_CREATE_PATH } from '@/lib/app-routes';
import { listUserCreatedTokens } from '@/lib/user-created-tokens';

interface AppTokensSheetProps {
  open: boolean;
  accountId: string;
  pageMoodId?: string | null;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onClosed?: () => void;
}

export function AppTokensSheet({
  open,
  accountId,
  pageMoodId,
  panelStyle,
  onClose,
  onClosed,
}: AppTokensSheetProps) {
  const tokens = useMemo(
    () => (open ? listUserCreatedTokens(accountId) : []),
    [open, accountId]
  );

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      tone="os"
      sizing="hug"
      initialDetent="full"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy="app-tokens-sheet-title"
      backdropLabel="Close tokens"
      panelClassName={`account-storage-panel${pageMoodId ? ' account-storage-panel--page-mood' : ''}`}
      panelStyle={panelStyle}
      bodyClassName="account-storage-body"
      header={
        <>
          <div className="standing-sheet-header account-storage-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2
                    id="app-tokens-sheet-title"
                    className="standing-sheet-subject-name"
                  >
                    Your tokens
                  </h2>
                  <p className="account-drawer-handle">@{accountId}</p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={onClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="app-storage-sheet">
        <p className="account-wallet-caption">
          Tokens you created under your account. SOCIAL stays the protocol
          token.
        </p>

        {tokens.length === 0 ? (
          <p className="standing-panel-empty-copy">No tokens yet.</p>
        ) : (
          <ul className="os-surface-row-list">
            {tokens.map((token) => (
              <li key={token.contractId}>
                <a
                  className="os-surface-row os-surface-row--navigate"
                  href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${encodeURIComponent(token.contractId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="os-surface-row-copy">
                    <span className="os-surface-row-label">
                      {token.symbol} · {token.name}
                    </span>
                    <span className="os-surface-row-description">
                      {token.contractId}
                      {token.renounced ? ' · admin locked' : ''}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="app-storage-actions">
          <Link
            href={APP_TOKENS_CREATE_PATH}
            className="standing-panel-empty-action"
            onClick={onClose}
          >
            Create token
          </Link>
        </div>
      </div>
    </GlassSheet>
  );
}
