'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
} from '@onsocial/ui';
import { AppCreateTokenSheet } from '@/features/tokens/app-create-token-sheet';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  listUserCreatedTokens,
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
  const [listTick, setListTick] = useState(0);

  const sheetOpen = open && !closing;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setCreateOpen(false);
    }
  }

  const [tokens, setTokens] = useState<UserCreatedTokenRecord[]>([]);

  useEffect(() => {
    setTokens(listUserCreatedTokens(accountId));
  }, [accountId, listTick]);

  const requestClose = useCallback(() => {
    setCreateOpen(false);
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setCreateOpen(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Tokens"
        copy="Fungible tokens under your account"
        closeAriaLabel="Close tokens"
        backdropLabel="Close tokens"
        zIndex={SHEET_Z.facts}
        panelClassName="account-storage-panel os-sheet-cap-standard"
        bodyClassName="account-storage-body"
        {...(panelStyle ? { panelStyle } : {})}
      >
        <div className="app-tokens-sheet">
          {tokens.length === 0 ? (
            <p className="token-create-note">No tokens yet.</p>
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
                  href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${token.contractId}`}
                  external
                  trailing="external"
                />
              ))}
            </OsSurfaceRowList>
          )}

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
        onCreated={() => setListTick((current) => current + 1)}
      />
    </>
  );
}
