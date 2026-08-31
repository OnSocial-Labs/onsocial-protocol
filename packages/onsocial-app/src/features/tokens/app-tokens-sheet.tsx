'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  TokenIcon,
} from '@onsocial/ui';
import { AppAddTokenSheet } from '@/features/tokens/app-add-token-sheet';
import { AppCreateTokenSheet } from '@/features/tokens/app-create-token-sheet';
import { AppManageTokenSheet } from '@/features/tokens/app-manage-token-sheet';
import { fetchDiscoveredCreatorTokens } from '@/lib/fetch-discovered-tokens';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  listUserCreatedTokens,
  reconcileUserCreatedTokens,
  rememberDiscoveredTokens,
  type UserCreatedTokenRecord,
} from '@/lib/user-created-tokens';

export function AppTokensSheet({
  open,
  accountId,
  panelStyle,
  onClose,
}: {
  open: boolean;
  accountId: string;
  panelStyle?: CSSProperties;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [manageToken, setManageToken] = useState<UserCreatedTokenRecord | null>(
    null
  );
  const [tokens, setTokens] = useState<UserCreatedTokenRecord[]>(() =>
    listUserCreatedTokens(accountId)
  );
  const [tokensAccountId, setTokensAccountId] = useState(accountId);

  const sheetOpen = open && !closing;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setCreateOpen(false);
      setAddOpen(false);
      setManageToken(null);
      setTokens(listUserCreatedTokens(accountId));
    }
  }
  if (tokensAccountId !== accountId) {
    setTokensAccountId(accountId);
    setTokens(listUserCreatedTokens(accountId));
  }

  // Self-heal the local ledger, then recover tokens they already created.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDiscovering(true);
    void reconcileUserCreatedTokens(accountId)
      .then(async (reconciled) => {
        if (!cancelled) setTokens(reconciled);
        const discovered = await fetchDiscoveredCreatorTokens(accountId).catch(
          () => []
        );
        if (cancelled) return;
        if (discovered.length === 0) {
          setTokens(listUserCreatedTokens(accountId));
          return;
        }
        setTokens(rememberDiscoveredTokens(accountId, discovered));
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  const requestClose = useCallback(() => {
    setCreateOpen(false);
    setAddOpen(false);
    setManageToken(null);
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setCreateOpen(false);
    setAddOpen(false);
    setManageToken(null);
    onClose();
  }, [onClose]);

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Tokens"
        copy={`@${accountId}`}
        closeAriaLabel="Close"
        backdropLabel="Close tokens"
        zIndex={SHEET_Z.facts}
        panelClassName="account-storage-panel os-sheet-cap-standard"
        bodyClassName="account-storage-body"
        {...(panelStyle ? { panelStyle } : {})}
      >
        <div className="app-storage-sheet">
          {tokens.length === 0 ? (
            <p className="app-storage-meta">
              {discovering
                ? 'Looking for tokens you already have.'
                : 'No tokens yet.'}
            </p>
          ) : (
            <OsSurfaceRowList
              className="app-tokens-list"
              aria-label="Your tokens"
            >
              {tokens.map((token: UserCreatedTokenRecord) => (
                <OsSurfaceRow
                  key={token.contractId}
                  label={token.name}
                  description={`${token.symbol} · ${token.contractId}${
                    token.renounced ? ' · locked' : ''
                  }`}
                  leading={
                    <TokenIcon
                      src={token.icon}
                      label={token.symbol}
                      size="md"
                    />
                  }
                  trailing="navigate"
                  onClick={() => setManageToken(token)}
                />
              ))}
            </OsSurfaceRowList>
          )}

          <OsSurfaceRowList aria-label="Add">
            <OsSurfaceRow
              label="Add existing"
              description="A token you already have"
              trailing="navigate"
              onClick={() => setAddOpen(true)}
            />
          </OsSurfaceRowList>

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready
              onClick={() => setCreateOpen(true)}
            >
              Create
            </OsSheetAction>
          </OsSheetActions>
        </div>
      </OsHugSheet>

      <AppCreateTokenSheet
        open={createOpen && open}
        panelStyle={panelStyle}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setTokens(listUserCreatedTokens(accountId))}
      />

      <AppAddTokenSheet
        open={addOpen && open}
        accountId={accountId}
        panelStyle={panelStyle}
        onClose={() => setAddOpen(false)}
        onAdded={() => setTokens(listUserCreatedTokens(accountId))}
      />

      <AppManageTokenSheet
        open={Boolean(manageToken) && open}
        token={manageToken}
        accountId={accountId}
        panelStyle={panelStyle}
        onClose={() => setManageToken(null)}
        onChanged={() => setTokens(listUserCreatedTokens(accountId))}
      />
    </>
  );
}
