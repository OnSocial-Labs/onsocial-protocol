'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  OsSheetFooter,
  OsSheetAction,
  OsSheetActions,
  TokenIcon,
  standingIdentityAccountCopy,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
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
      setDiscovering(true);
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

  const items = useMemo<ActionDrawerItem[]>(() => {
    const tokenItems: ActionDrawerItem[] = tokens.map((token) => ({
      id: token.contractId,
      label: token.name,
      description: `${token.symbol} · ${token.contractId}${
        token.renounced ? ' · locked' : ''
      }`,
      leading: (
        <TokenIcon src={token.icon} label={token.symbol} size="md" />
      ),
      onSelect: () => setManageToken(token),
    }));

    return [
      ...tokenItems,
      {
        id: 'add-existing',
        label: 'Add existing',
        description: 'A token you already have',
        onSelect: () => setAddOpen(true),
      },
    ];
  }, [tokens]);

  const emptyHint =
    tokens.length === 0
      ? discovering
        ? 'Looking for creator tokens you already have.'
        : 'No creator tokens yet.'
      : undefined;

  return (
    <>
      <ActionDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Creator tokens"
        copy={standingIdentityAccountCopy(accountId)}
        closeAriaLabel="Close"
        listAriaLabel="Creator tokens"
        zIndex={SHEET_Z.facts}
        panelClassName="os-sheet-cap-standard"
        items={items}
        hint={emptyHint}
        {...(panelStyle ? { panelStyle } : {})}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={() => setCreateOpen(true)}
              >
                Create
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      />

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
