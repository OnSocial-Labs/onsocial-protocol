'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  aggregateChannelsFromPosts,
  type DiscoveredChannelUsage,
} from '@/features/guilds/guild-structure-discovery';
import { GuildStructureSettingsSection } from '@/features/guilds/guild-structure-settings-section';
import {
  cloneGuildStructure,
  guildStructureForMetadata,
  guildStructuresEqual,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface GuildRoomsSheetProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onSaved?: () => void;
}

/** Rooms / spaces admin — split out of identity edit into its own sheet. */
export function GuildRoomsSheet({
  open,
  groupId,
  onClose,
  onSaved,
}: GuildRoomsSheetProps) {
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();

  const [closing, setClosing] = useState(false);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'forbidden'
  >('idle');
  const [snapshot, setSnapshot] = useState<GuildConfigSnapshot | null>(null);
  const [memberDriven, setMemberDriven] = useState(false);
  const [structure, setStructure] = useState<GuildStructureDocument | null>(
    null
  );
  const [discoveredChannels, setDiscoveredChannels] = useState<
    DiscoveredChannelUsage[]
  >([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const client = createReadOnlyOnSocialClient();
      const rawConfig = await client.groups.getConfig(groupId);
      if (!rawConfig) {
        setLoadState('error');
        setError('Guild not found.');
        return;
      }
      const normalized = normalizeGuildConfig(groupId, rawConfig);
      setSnapshot(normalized);
      setMemberDriven(normalized.memberDriven);
      setStructure(cloneGuildStructure(normalized.structure));

      if (!accountId) {
        setLoadState('forbidden');
        return;
      }
      const [isOwner, isAdmin] = await Promise.all([
        client.groups.isOwner(groupId, accountId),
        client.groups.isAdmin(groupId, accountId),
      ]);
      setLoadState(isOwner || isAdmin ? 'ready' : 'forbidden');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load rooms.'
      );
    }
  }, [accountId, groupId]);

  useEffect(() => {
    if (!open || walletLoading) return;
    void load();
  }, [load, open, walletLoading]);

  useEffect(() => {
    if (!open) {
      setClosing(false);
      setLoadState('idle');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const channels = await client.query.groups.postChannelSample(groupId, {
          limit: 120,
        });
        if (!cancelled) {
          setDiscoveredChannels(
            aggregateChannelsFromPosts(channels.map((channel) => ({ channel })))
          );
        }
      } catch {
        if (!cancelled) setDiscoveredChannels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, loadState]);

  const isDirty = useMemo(() => {
    if (!snapshot || !structure) return false;
    return !guildStructuresEqual(structure, snapshot.structure);
  }, [snapshot, structure]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const handleSave = async () => {
    if (!snapshot || !structure || pending || !isDirty) return;
    setError(null);
    if (!isConnected) {
      await connect();
      return;
    }

    setPending(true);
    try {
      const { client } = await getClient();
      const metadataChanges = {
        x: {
          onsocial: {
            structure: guildStructureForMetadata(structure),
          },
        },
      };
      const response = memberDriven
        ? await client.groups.proposeMetadataUpdate(groupId, metadataChanges, {
            reason: 'Guild rooms update',
            autoVote: true,
          })
        : await client.groups.updateMetadata(groupId, metadataChanges);

      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: memberDriven
          ? txToastConfirming.proposingGuildUpdate
          : txToastConfirming.savingGuildSettings,
        successMessage: memberDriven
          ? txToastSuccess.guildUpdateProposed
          : txToastSuccess.guildSettingsSaved,
        failureMessage: txToastError.guildSettingsFailed,
      });

      if (confirmed) {
        onSaved?.();
        setClosing(true);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not save rooms.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Rooms"
      copy="Rooms and feed tabs for this guild"
      closeAriaLabel="Close"
      backdropLabel="Close guild rooms"
      zIndex={SHEET_Z.list}
      sizing="full"
      panelClassName="guild-rooms-sheet-panel"
      bodyClassName="guild-rooms-sheet-body"
      footer={
        loadState === 'ready' && structure ? (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            {!isConnected && !walletLoading ? (
              <OsSheetAction
                type="button"
                variant="ghost"
                onClick={() => void connect()}
              >
                Connect wallet
              </OsSheetAction>
            ) : null}
            <OsSheetAction
              type="button"
              ready={isDirty && isConnected}
              pending={pending}
              pendingLabel={memberDriven ? 'Proposing…' : 'Saving…'}
              disabled={!isDirty || pending || !isConnected}
              onClick={() => void handleSave()}
            >
              {memberDriven ? 'Propose rooms' : 'Save rooms'}
            </OsSheetAction>
          </OsSheetActions>
        ) : undefined
      }
    >
      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="guild-state-card">Loading rooms…</div>
      ) : null}
      {loadState === 'error' ? (
        <div className="guild-state-card is-error">
          <p>{error ?? 'Could not load rooms.'}</p>
          <button
            type="button"
            className="guild-secondary-button"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {loadState === 'forbidden' ? (
        <div className="guild-state-card">
          <p>Only owners and admins can manage rooms.</p>
        </div>
      ) : null}
      {loadState === 'ready' && structure ? (
        <>
          <GuildStructureSettingsSection
            structure={structure}
            onChange={setStructure}
            disabled={pending}
            discoveredChannels={discoveredChannels}
          />
          {error ? <p className="guild-form-error">{error}</p> : null}
        </>
      ) : null}
    </OsHugSheet>
  );
}
