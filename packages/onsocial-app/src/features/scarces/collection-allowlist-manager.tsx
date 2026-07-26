'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface GuildOption {
  groupId: string;
  name: string;
}

interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

/** Parse `account[ allocation]` lines into contract allowlist entries. */
function parseEntries(text: string): AllowlistEntry[] {
  const seen = new Set<string>();
  const entries: AllowlistEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [account, allocationRaw] = trimmed.split(/[\s,]+/);
    const id = account?.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    const allocation = Math.max(1, Number.parseInt(allocationRaw ?? '1', 10) || 1);
    seen.add(id);
    entries.push({ account_id: id, allocation });
  }
  return entries;
}

/**
 * Phase 3 bridge — seed a drop's allowlist from a guild the creator owns.
 * The guild stays community; the collection stays commerce. No store join.
 */
export function CollectionAllowlistManager({
  collectionId,
  creatorId,
}: {
  collectionId: string;
  creatorId: string;
}) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [guilds, setGuilds] = useState<GuildOption[]>([]);
  const [entriesText, setEntriesText] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open || guilds.length > 0) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.groups
      .membershipsBy(creatorId, { limit: 50 })
      .then((page) => {
        if (cancelled) return;
        const owned = page.items
          .filter((row) => row.isOwner || row.isAdmin)
          .map((row) => ({
            groupId: row.groupId,
            name: row.groupName?.trim() || row.groupId,
          }));
        setGuilds(owned);
      })
      .catch(() => {
        if (!cancelled) setGuilds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, creatorId, guilds.length]);

  const seedFromGuild = useCallback(
    async (groupId: string) => {
      if (!groupId) return;
      setSeeding(true);
      setNote(null);
      try {
        const client = createReadOnlyOnSocialClient();
        const { items } = await client.query.groups.membersOf(groupId, {
          limit: 200,
        });
        const accounts = items
          .map((row) => row.memberId.trim())
          .filter(
            (id) => id && !accountIdsEqual(id, creatorId)
          );
        if (accounts.length === 0) {
          setNote('That guild has no other members yet.');
          return;
        }
        setEntriesText((current) => {
          const existing = new Set(
            parseEntries(current).map((entry) => entry.account_id)
          );
          const additions = accounts
            .filter((id) => !existing.has(id.toLowerCase()))
            .map((id) => `${id} 1`);
          return [current.trim(), ...additions]
            .filter(Boolean)
            .join('\n');
        });
      } catch {
        setNote('Could not load guild members.');
      } finally {
        setSeeding(false);
      }
    },
    [creatorId]
  );

  const handleSave = useCallback(async () => {
    const entries = parseEntries(entriesText);
    if (entries.length === 0) {
      setNote('Add at least one account to the allowlist.');
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.collections.setAllowlist(
        collectionId,
        entries
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.updatingAllowlist,
        successMessage: txToastSuccess.allowlistUpdated,
        failureMessage: txToastError.updateAllowlistFailed,
      });
      if (!confirmed) return;
      setOpen(false);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.updateAllowlistFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    entriesText,
    collectionId,
    getSigningWallet,
    trackTransaction,
    setTxResult,
  ]);

  if (!open) {
    return (
      <button
        type="button"
        className="collection-allowlist-toggle"
        onClick={() => setOpen(true)}
      >
        Manage allowlist
      </button>
    );
  }

  const entryCount = parseEntries(entriesText).length;

  return (
    <section className="collection-allowlist" aria-label="Allowlist manager">
      <div className="collection-allowlist-head">
        <h3 className="market-section-title">Allowlist</h3>
        <button
          type="button"
          className="collection-allowlist-close"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      </div>
      <p className="collection-mint-hint">
        Give specific accounts a mint allocation. Seed it from a guild you run —
        the guild stays a community, this stays the drop.
      </p>

      {guilds.length > 0 ? (
        <div className="collection-allowlist-guilds">
          {guilds.map((guild) => (
            <button
              key={guild.groupId}
              type="button"
              className="os-surface-chip"
              disabled={seeding || pending}
              onClick={() => void seedFromGuild(guild.groupId)}
            >
              Seed from {guild.name}
            </button>
          ))}
        </div>
      ) : null}

      <label className="guild-field" htmlFor="collection-allowlist-entries">
        <span>Accounts</span>
        <textarea
          id="collection-allowlist-entries"
          value={entriesText}
          onChange={(event) => setEntriesText(event.target.value)}
          placeholder={'alice.near 1\nbob.near 2'}
          rows={6}
          disabled={pending}
        />
        <small>One account per line, optional allocation after a space.</small>
      </label>

      {note ? <p className="collection-mint-hint">{note}</p> : null}

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={entryCount > 0 && !pending}
          disabled={entryCount === 0 || pending}
          onClick={() => {
            void handleSave();
          }}
        >
          {pending ? 'Saving…' : `Save allowlist (${entryCount})`}
        </OsSheetAction>
      </OsSheetActions>
    </section>
  );
}
