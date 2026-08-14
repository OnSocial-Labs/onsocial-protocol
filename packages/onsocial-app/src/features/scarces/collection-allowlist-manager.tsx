'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
} from 'react';
import {
  Divider,
  MultiplyIcon,
  OsFieldRemove,
  OsHugSheet,
  ProfileAvatar,
  SearchField,
  UserPlusIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import type { AllowlistEntry } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { CollectionQtyStepper } from '@/components/ui/collection-qty-stepper';
import { StandingIdentity } from '@/components/ui/standing-identity';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  allowlistCapStepperMax,
  allowlistPasteHint,
  allowlistPastePlaceholder,
  clampAllowlistAllocation,
  isImplicitNearAccountId,
  parseAllowlistPaste,
} from '@/features/scarces/collection-allowlist-parse';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { accountIdsEqual } from '@/lib/account-match';
import { viewAccount } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import {
  PROFILE_SEARCH_MAX_QUERY_LENGTH,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export const ALLOWLIST_SAVE_MAX = 100;
const SEARCH_DEBOUNCE_MS = 220;
const REMOVE_CONFIRM_MS = 4_000;
const PASTE_PLACEHOLDER = allowlistPastePlaceholder();

export type { AllowlistEntry };

interface GuildOption {
  groupId: string;
  name: string;
}

interface MemberRow {
  memberId: string;
}

interface SelectedFace {
  accountId: string;
  name: string;
  avatarUrl: string | null;
}

function saveLabel(count: number, pending: boolean, draft: boolean): string {
  if (pending) return 'Saving…';
  if (count === 0) return 'Select accounts';
  if (draft) {
    if (count === 1) return 'Add 1 account';
    return `Add ${count} accounts`;
  }
  if (count === 1) return 'Save 1 account';
  return `Save ${count} accounts`;
}

function accountsFromExtraData(extraData: string | null): string[] {
  if (!extraData?.trim()) return [];
  try {
    const parsed = JSON.parse(extraData) as { accounts?: unknown };
    if (!Array.isArray(parsed.accounts)) return [];
    return parsed.accounts
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Same identity lines as Support / Sales drawers. */
function AllowlistAccountEditBody({
  face,
  capMax,
  confirmingRemove,
  onSetCap,
  onArmRemove,
}: {
  face: {
    accountId: string;
    allocation: number;
    name: string;
    avatarUrl: string | null;
  };
  capMax: number;
  confirmingRemove: boolean;
  onSetCap: (accountId: string, next: number) => void;
  onArmRemove: () => void;
}) {
  const handle = fallbackLabel(face.accountId);

  return (
    <div className="collection-allowlist-edit">
      <div
        className={`collection-allowlist-edit-row${
          confirmingRemove ? ' is-removing' : ''
        }`}
      >
        <div className="standing-row-main collection-allowlist-edit-main">
          <StandingIdentity
            accountId={face.accountId}
            profileName={face.name}
            avatarUrl={face.avatarUrl}
          />
        </div>

        <div className="standing-row-aside collection-allowlist-edit-aside">
          <CollectionQtyStepper
            className="collection-allowlist-edit-qty"
            value={face.allocation}
            min={1}
            max={capMax}
            disabled={confirmingRemove}
            aria-label="Mint cap"
            decreaseLabel="Decrease mint cap"
            increaseLabel="Increase mint cap"
            onChange={(next) => onSetCap(face.accountId, next)}
          />
          <OsFieldRemove
            variant="danger"
            ready
            aria-pressed={confirmingRemove}
            aria-label={
              confirmingRemove
                ? `Cancel remove @${handle}`
                : `Remove @${handle}`
            }
            onClick={onArmRemove}
          />
        </div>
      </div>
    </div>
  );
}

async function namedAccountsMissingOnNear(
  accountIds: string[]
): Promise<string[]> {
  const named = accountIds.filter((id) => !isImplicitNearAccountId(id));
  if (named.length === 0) return [];
  const missing: string[] = [];
  await Promise.all(
    named.map(async (id) => {
      try {
        const view = await viewAccount(id);
        if (!view) missing.push(id);
      } catch {
        missing.push(id);
      }
    })
  );
  return missing;
}

function CollectionAllowlistSheet({
  open,
  collectionId,
  creatorId,
  maxPerWallet,
  initialEntries = null,
  onApply,
  onClose,
  earlyAccessActive = true,
}: {
  open: boolean;
  /** Live collection id — omit in create-drop draft mode. */
  collectionId?: string | null;
  creatorId: string;
  maxPerWallet: number | null;
  /** Seed when the sheet opens (create-drop draft). */
  initialEntries?: AllowlistEntry[] | null;
  /**
   * Draft mode — Done applies entries to the parent instead of an on-chain save.
   */
  onApply?: (entries: AllowlistEntry[]) => void;
  onClose: () => void;
  /** Before Opens the list gates minting; after Opens it does not. */
  earlyAccessActive?: boolean;
}) {
  const pasteId = useId();
  const editTitleId = useId();
  const { accountId: viewerId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [guilds, setGuilds] = useState<GuildOption[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  /** accountId → mint cap (`0` = remove from chain allowlist). */
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [faces, setFaces] = useState<Record<string, SelectedFace>>({});
  const [query, setQuery] = useState('');
  const [searchProfiles, setSearchProfiles] = useState<DiscoverProfileSummary[]>(
    []
  );
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [guildOpen, setGuildOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [undoAllocations, setUndoAllocations] = useState<Record<
    string,
    number
  > | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const confirmRemoveTimerRef = useRef<number | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const initialEntriesRef = useRef(initialEntries);
  const sheetOpen = open && !closing;
  const isDraft = typeof onApply === 'function';

  useEffect(() => {
    initialEntriesRef.current = initialEntries;
  }, [initialEntries]);


  const clearConfirmRemove = useCallback(() => {
    if (confirmRemoveTimerRef.current != null) {
      window.clearTimeout(confirmRemoveTimerRef.current);
      confirmRemoveTimerRef.current = null;
    }
    setConfirmingRemove(false);
  }, []);

  const armConfirmRemove = useCallback(() => {
    if (confirmingRemove) {
      clearConfirmRemove();
      return;
    }
    setConfirmingRemove(true);
    if (confirmRemoveTimerRef.current != null) {
      window.clearTimeout(confirmRemoveTimerRef.current);
    }
    confirmRemoveTimerRef.current = window.setTimeout(() => {
      confirmRemoveTimerRef.current = null;
      setConfirmingRemove(false);
    }, REMOVE_CONFIRM_MS);
  }, [clearConfirmRemove, confirmingRemove]);

  const closeEditSheet = useCallback(() => {
    clearConfirmRemove();
    setEditingAccountId(null);
  }, [clearConfirmRemove]);

  useEffect(() => {
    return () => {
      if (confirmRemoveTimerRef.current != null) {
        window.clearTimeout(confirmRemoveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setClosing(false);
      setSelectedGuildId(null);
      setMembers([]);
      setAllocations({});
      setFaces({});
      setQuery('');
      setSearchProfiles([]);
      setSearchPending(false);
      setSearchError(null);
      setGuildOpen(false);
      setPasteOpen(false);
      setPasteText('');
      setPasteBusy(false);
      setUndoAllocations(null);
      setEditingAccountId(null);
      clearConfirmRemove();
      setNote(null);
      setMembersLoading(false);
      setRecentAccounts([]);
      return;
    }

    const seed = initialEntriesRef.current;
    if (seed && seed.length > 0) {
      const nextAlloc: Record<string, number> = {};
      const nextFaces: Record<string, SelectedFace> = {};
      for (const entry of seed) {
        const id = entry.account_id.trim();
        if (!id) continue;
        const allocation =
          Number.isSafeInteger(entry.allocation) && entry.allocation > 0
            ? entry.allocation
            : 1;
        nextAlloc[id] = allocation;
        nextFaces[id] = {
          accountId: id,
          name: fallbackLabel(id),
          avatarUrl: null,
        };
      }
      setAllocations(nextAlloc);
      setFaces(nextFaces);
    }
  }, [clearConfirmRemove, open]);

  useEffect(() => {
    clearConfirmRemove();
  }, [clearConfirmRemove, editingAccountId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();

    void client.query.groups
      .membershipsBy(creatorId, { limit: 50 })
      .then((page) => {
        if (cancelled) return;
        setGuilds(
          page.items
            .filter((row) => row.isOwner || row.isAdmin)
            .map((row) => ({
              groupId: row.groupId,
              name: row.groupName?.trim() || row.groupId,
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setGuilds([]);
      });

    const liveCollectionId = collectionId?.trim();
    if (!liveCollectionId) {
      setRecentAccounts([]);
      return () => {
        cancelled = true;
      };
    }

    void client.query.scarces
      .collection(liveCollectionId, { limit: 80 })
      .then((rows) => {
        if (cancelled) return;
        const live = new Set<string>();
        for (const row of [...rows].reverse()) {
          if (row.operation === 'allowlist_update') {
            for (const id of accountsFromExtraData(row.extraData)) {
              live.add(id.toLowerCase());
            }
          } else if (row.operation === 'allowlist_remove') {
            for (const id of accountsFromExtraData(row.extraData)) {
              live.delete(id.toLowerCase());
            }
          }
        }
        setRecentAccounts([...live].sort());
      })
      .catch(() => {
        if (!cancelled) setRecentAccounts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, creatorId, collectionId]);

  useEffect(() => {
    if (!open || !selectedGuildId) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    const client = createReadOnlyOnSocialClient();
    void client.query.groups
      .membersOf(selectedGuildId, { limit: 200 })
      .then((page) => {
        if (cancelled) return;
        setMembers(
          page.items
            .map((row) => ({ memberId: row.memberId.trim() }))
            .filter(
              (row) =>
                row.memberId && !accountIdsEqual(row.memberId, creatorId)
            )
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
          setNote('Could not load guild members.');
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedGuildId, creatorId]);

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const searchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!sheetOpen) return;
    if (!searchActive) {
      setSearchProfiles([]);
      setSearchPending(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void fetchDiscoverProfiles(
        normalizedQuery,
        viewerId ?? null,
        0,
        controller.signal
      )
        .then((response) => {
          setSearchProfiles(
            response.profiles.filter(
              (profile) => !accountIdsEqual(profile.accountId, creatorId)
            )
          );
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setSearchProfiles([]);
          setSearchError(
            cause instanceof Error ? cause.message : 'Search failed.'
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchPending(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [sheetOpen, searchActive, normalizedQuery, viewerId, creatorId]);

  const memberIds = useMemo(
    () => members.map((row) => row.memberId),
    [members]
  );
  const selectedIds = useMemo(() => Object.keys(allocations), [allocations]);
  const profileIds = useMemo(
    () => [...new Set([...memberIds, ...selectedIds, ...recentAccounts])],
    [memberIds, selectedIds, recentAccounts]
  );
  const profiles = usePostAuthorProfiles(profileIds);

  useEffect(() => {
    setFaces((current) => {
      let changed = false;
      const next = { ...current };
      for (const id of profileIds) {
        const profile = profiles[id];
        if (!profile) continue;
        const key = id.toLowerCase();
        const name = displayName(id, profile.displayName || undefined);
        const avatarUrl = profile.avatarUrl ?? null;
        const prev = next[key];
        if (
          prev &&
          prev.name === name &&
          (prev.avatarUrl ?? null) === avatarUrl
        ) {
          continue;
        }
        next[key] = { accountId: key, name, avatarUrl };
        changed = true;
      }
      return changed ? next : current;
    });
  }, [profileIds, profiles]);

  const requestClose = useCallback(() => {
    if (pending || pasteBusy) return;
    setClosing(true);
  }, [pending, pasteBusy]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const selectedCount = selectedIds.length;
  const isSelected = useCallback(
    (accountId: string) =>
      Object.prototype.hasOwnProperty.call(
        allocations,
        accountId.trim().toLowerCase()
      ),
    [allocations]
  );

  const rememberFace = useCallback((face: SelectedFace) => {
    const key = face.accountId.toLowerCase();
    setFaces((current) => ({
      ...current,
      [key]: { ...face, accountId: key },
    }));
  }, []);

  const upsertAccount = useCallback(
    (
      accountId: string,
      allocation: number,
      face?: { name?: string | null; avatarUrl?: string | null }
    ) => {
      const key = accountId.trim().toLowerCase();
      if (!key) return false;

      const already = Object.prototype.hasOwnProperty.call(allocations, key);
      if (!already && selectedCount >= ALLOWLIST_SAVE_MAX) {
        setNote(`Up to ${ALLOWLIST_SAVE_MAX} accounts per save.`);
        return false;
      }

      setAllocations((current) => {
        if (
          !Object.prototype.hasOwnProperty.call(current, key) &&
          Object.keys(current).length >= ALLOWLIST_SAVE_MAX
        ) {
          return current;
        }
        return {
          ...current,
          [key]: clampAllowlistAllocation(allocation, maxPerWallet),
        };
      });
      const profile = profiles[accountId] ?? profiles[key];
      if (face || profile) {
        rememberFace({
          accountId: key,
          name: displayName(
            accountId,
            face?.name ?? profile?.displayName ?? undefined
          ),
          avatarUrl: face?.avatarUrl ?? profile?.avatarUrl ?? null,
        });
      } else if (!faces[key]) {
        rememberFace({
          accountId: key,
          name: displayName(accountId),
          avatarUrl: null,
        });
      }
      setNote(null);
      setUndoAllocations(null);
      return true;
    },
    [allocations, faces, profiles, rememberFace, selectedCount, maxPerWallet]
  );

  const toggleAccount = useCallback(
    (
      accountId: string,
      face?: { name?: string | null; avatarUrl?: string | null }
    ) => {
      const key = accountId.trim().toLowerCase();
      if (!key) return;

      if (isSelected(key)) {
        setAllocations((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setEditingAccountId((current) => (current === key ? null : current));
        setNote(null);
        setUndoAllocations(null);
        return;
      }

      upsertAccount(key, 1, face);
    },
    [isSelected, upsertAccount]
  );

  const stageRemoveFromList = useCallback(
    (accountId: string) => {
      upsertAccount(accountId, 0);
      setNote(`Staged @${fallbackLabel(accountId)} for removal.`);
    },
    [upsertAccount]
  );

  const setCapValue = useCallback(
    (accountId: string, next: number) => {
      const key = accountId.trim().toLowerCase();
      clearConfirmRemove();
      setAllocations((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, key)) return current;
        return {
          ...current,
          [key]: clampAllowlistAllocation(next, maxPerWallet),
        };
      });
      setUndoAllocations(null);
    },
    [clearConfirmRemove, maxPerWallet]
  );

  const discardFromSave = useCallback(
    (accountId: string) => {
      const key = accountId.trim().toLowerCase();
      clearConfirmRemove();
      setAllocations((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setEditingAccountId(null);
      setUndoAllocations(null);
      setNote(null);
    },
    [clearConfirmRemove]
  );

  const confirmEditRemove = useCallback(() => {
    if (!editingAccountId) return;
    const onList = recentAccounts.some((id) =>
      accountIdsEqual(id, editingAccountId)
    );
    if (onList) {
      clearConfirmRemove();
      stageRemoveFromList(editingAccountId);
      setEditingAccountId(null);
      return;
    }
    discardFromSave(editingAccountId);
  }, [
    clearConfirmRemove,
    discardFromSave,
    editingAccountId,
    recentAccounts,
    stageRemoveFromList,
  ]);

  const selectAllVisible = useCallback(() => {
    setAllocations((current) => {
      const next = { ...current };
      for (const id of memberIds) {
        if (Object.keys(next).length >= ALLOWLIST_SAVE_MAX) break;
        const key = id.toLowerCase();
        if (next[key] == null) next[key] = 1;
      }
      if (
        memberIds.length > 0 &&
        Object.keys(next).length >= ALLOWLIST_SAVE_MAX
      ) {
        setNote(`Up to ${ALLOWLIST_SAVE_MAX} accounts per save.`);
      } else {
        setNote(null);
      }
      return next;
    });
    setUndoAllocations(null);
    for (const id of memberIds) {
      const profile = profiles[id];
      rememberFace({
        accountId: id.toLowerCase(),
        name: displayName(id, profile?.displayName || undefined),
        avatarUrl: profile?.avatarUrl ?? null,
      });
    }
  }, [memberIds, profiles, rememberFace]);

  const clearSelected = useCallback(() => {
    setAllocations({});
    setFaces({});
    setEditingAccountId(null);
    setUndoAllocations(null);
    setNote(null);
  }, []);

  const undoPaste = useCallback(() => {
    if (!undoAllocations) return;
    setAllocations(undoAllocations);
    setUndoAllocations(null);
    setNote('Paste undone.');
  }, [undoAllocations]);

  const commitPasteText = useCallback(
    async (raw: string) => {
      const parsed = parseAllowlistPaste(raw, maxPerWallet);
      if (
        parsed.entries.length === 0 &&
        parsed.invalid.length === 0 &&
        parsed.wrongNetwork.length === 0
      ) {
        setNote('Paste one account per line to add.');
        return;
      }

      setPasteBusy(true);
      try {
        const missing = await namedAccountsMissingOnNear(
          parsed.entries.map((entry) => entry.account_id)
        );
        const missingSet = new Set(missing);
        const accepted = parsed.entries.filter(
          (entry) => !missingSet.has(entry.account_id)
        );

        const snapshot = { ...allocations };
        const next = { ...allocations };
        let added = 0;
        let skippedCap = 0;
        const nextFaces: SelectedFace[] = [];

        for (const entry of accepted) {
          const exists = Object.prototype.hasOwnProperty.call(
            next,
            entry.account_id
          );
          if (!exists && Object.keys(next).length >= ALLOWLIST_SAVE_MAX) {
            skippedCap += 1;
            continue;
          }
          next[entry.account_id] = entry.allocation;
          added += 1;
          if (!faces[entry.account_id]) {
            const profile = profiles[entry.account_id];
            nextFaces.push({
              accountId: entry.account_id,
              name: displayName(
                entry.account_id,
                profile?.displayName || undefined
              ),
              avatarUrl: profile?.avatarUrl ?? null,
            });
          }
        }

        if (added > 0) {
          setUndoAllocations(snapshot);
          setAllocations(next);
          for (const face of nextFaces) {
            rememberFace(face);
          }
        }

        const parts: string[] = [];
        if (added > 0) {
          parts.push(
            added === 1 ? 'Added 1 account.' : `Added ${added} accounts.`
          );
        }
        if (parsed.wrongNetwork.length > 0) {
          parts.push(
            parsed.wrongNetwork.length === 1
              ? 'Blocked 1 wrong-network account.'
              : `Blocked ${parsed.wrongNetwork.length} wrong-network accounts.`
          );
        }
        if (missing.length > 0) {
          parts.push(
            missing.length === 1
              ? 'Skipped 1 account not found on NEAR.'
              : `Skipped ${missing.length} accounts not found on NEAR.`
          );
        }
        if (parsed.invalid.length > 0) {
          parts.push(
            parsed.invalid.length === 1
              ? 'Skipped 1 invalid line.'
              : `Skipped ${parsed.invalid.length} invalid lines.`
          );
        }
        if (skippedCap > 0) {
          parts.push(`Cap is ${ALLOWLIST_SAVE_MAX} per save.`);
        }
        if (parts.length === 0) {
          parts.push('Nothing new to add.');
        }

        setPasteText('');
        setNote(parts.join(' '));
      } finally {
        setPasteBusy(false);
      }
    },
    [allocations, faces, profiles, rememberFace, maxPerWallet]
  );

  const handlePasteClipboard = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const text = event.clipboardData.getData('text');
      if (!text.trim()) return;
      event.preventDefault();
      void commitPasteText(text);
    },
    [commitPasteText]
  );

  const handlePasteBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      const text = event.target.value;
      if (!text.trim() || pasteBusy) return;
      void commitPasteText(text);
    },
    [commitPasteText, pasteBusy]
  );

  const mergedEntries = useMemo((): AllowlistEntry[] => {
    return selectedIds
      .slice()
      .sort()
      .map((id) => ({
        account_id: id,
        allocation: allocations[id] ?? 1,
      }));
  }, [allocations, selectedIds]);

  const handleSave = useCallback(async () => {
    if (mergedEntries.length > ALLOWLIST_SAVE_MAX) {
      setNote(`Save up to ${ALLOWLIST_SAVE_MAX} accounts at a time.`);
      return;
    }

    if (isDraft) {
      onApply?.(mergedEntries);
      requestClose();
      return;
    }

    if (mergedEntries.length === 0) {
      setNote('Search, pick guild members, or paste accounts.');
      return;
    }

    const liveCollectionId = collectionId?.trim();
    if (!liveCollectionId) {
      setNote('Collection is missing.');
      return;
    }

    setPending(true);
    setNote(null);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.collections.setAllowlist(
        liveCollectionId,
        mergedEntries
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.updatingAllowlist,
        successMessage: txToastSuccess.allowlistUpdated,
        failureMessage: txToastError.updateAllowlistFailed,
      });
      if (!confirmed) return;
      requestClose();
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
    mergedEntries,
    isDraft,
    onApply,
    collectionId,
    getSigningWallet,
    trackTransaction,
    setTxResult,
    requestClose,
  ]);

  const selectedGuild = guilds.find((g) => g.groupId === selectedGuildId);
  const capMax = allowlistCapStepperMax(maxPerWallet);
  const canSave = isDraft
    ? !pasteBusy && mergedEntries.length <= ALLOWLIST_SAVE_MAX
    : mergedEntries.length > 0 &&
      mergedEntries.length <= ALLOWLIST_SAVE_MAX &&
      !pending &&
      !pasteBusy;
  const showSources = !searchActive;
  const onListVisible = useMemo(
    () => recentAccounts.filter((id) => !isSelected(id)),
    [recentAccounts, isSelected]
  );
  const selectedFaces = useMemo(
    () =>
      selectedIds.map((id) => {
        const face = faces[id];
        const profile = profiles[id];
        return {
          accountId: id,
          allocation: allocations[id] ?? 1,
          name:
            face?.name ||
            displayName(id, profile?.displayName || undefined),
          avatarUrl: face?.avatarUrl ?? profile?.avatarUrl ?? null,
        };
      }),
    [selectedIds, faces, profiles, allocations]
  );
  const editingFace =
    editingAccountId == null
      ? null
      : (selectedFaces.find((face) => face.accountId === editingAccountId) ??
        null);
  const visibleSearchProfiles = useMemo(
    () => searchProfiles.filter((profile) => !isSelected(profile.accountId)),
    [searchProfiles, isSelected]
  );

  return (
    <>
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Allowlist"
      copy={
        isDraft
          ? `${mergedEntries.length}/${ALLOWLIST_SAVE_MAX} · mint before Opens`
          : earlyAccessActive
            ? `${mergedEntries.length}/${ALLOWLIST_SAVE_MAX} · early access before Opens`
            : `${mergedEntries.length}/${ALLOWLIST_SAVE_MAX} · public mint is open`
      }
      closeAriaLabel="Close allowlist"
      backdropLabel="Close allowlist"
      zIndex={58}
      panelClassName="collection-allowlist-sheet-panel"
      bodyClassName="collection-allowlist-sheet-body"
      footer={
        <div className="guild-add-member-footer">
          {note ? (
            <p className="collection-allowlist-note" role="alert">
              {note}
              {undoAllocations ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="collection-allowlist-text-btn"
                    disabled={pending || pasteBusy}
                    onClick={undoPaste}
                  >
                    Undo
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canSave}
              disabled={!canSave}
              pending={!isDraft && pending}
              pendingLabel="Saving…"
              onClick={() => {
                void handleSave();
              }}
            >
              {saveLabel(mergedEntries.length, pending, isDraft)}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    >
      <div className="collection-allowlist-sheet guild-add-member-sheet">
        <SearchField
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setNote(null);
          }}
          placeholder="Search profiles"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear profile search"
          ariaLabel="Search profiles to allowlist"
          chrome="sheet"
          className="collection-allowlist-search"
          autoFocus
        />

        {selectedFaces.length > 0 ? (
          <div className="collection-allowlist-section">
            <div className="collection-allowlist-members-head">
              <p className="collection-allowlist-section-label">
                Selected · {selectedFaces.length}
              </p>
              <button
                type="button"
                className="collection-allowlist-text-btn"
                disabled={pending || pasteBusy}
                onClick={clearSelected}
              >
                Clear
              </button>
            </div>
            <ul className="collection-allowlist-selected">
              {selectedFaces.map((face) => {
                const removing = face.allocation <= 0;
                return (
                  <li
                    key={face.accountId}
                    className={`collection-allowlist-chip${
                      removing ? ' is-remove' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="collection-allowlist-chip-main"
                      disabled={pending || pasteBusy}
                      aria-label={
                        removing
                          ? `Edit removal of @${fallbackLabel(face.accountId)}`
                          : `Edit @${fallbackLabel(face.accountId)}, mint cap ${face.allocation}`
                      }
                      onClick={() => setEditingAccountId(face.accountId)}
                    >
                      <ProfileAvatar
                        src={face.avatarUrl}
                        fallbackInitial={face.name}
                        size="sm"
                        className="collection-allowlist-chip-avatar"
                      />
                      <span className="collection-allowlist-chip-label">
                        {removing ? 'Remove ' : ''}@
                        {fallbackLabel(face.accountId)}
                      </span>
                      {!removing ? (
                        <span className="collection-allowlist-chip-cap">
                          {face.allocation}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="collection-allowlist-chip-remove"
                      disabled={pending || pasteBusy}
                      aria-label={`Discard @${fallbackLabel(face.accountId)}`}
                      onClick={() => discardFromSave(face.accountId)}
                    >
                      <MultiplyIcon
                        aria-hidden
                        className="collection-allowlist-chip-remove-icon"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {searchActive ? (
          <div className="collection-allowlist-section">
            {searchPending && searchProfiles.length === 0 ? (
              <p className="guild-add-member-hint">Searching…</p>
            ) : null}
            {searchError ? (
              <p className="guild-form-error" role="alert">
                {searchError}
              </p>
            ) : null}
            {!searchPending &&
            searchProfiles.length === 0 &&
            !searchError ? (
              <p className="guild-add-member-hint">No profiles found.</p>
            ) : null}
            {!searchPending &&
            searchProfiles.length > 0 &&
            visibleSearchProfiles.length === 0 &&
            !searchError ? (
              <p className="guild-add-member-hint">
                Added — keep typing to find more.
              </p>
            ) : null}
            {visibleSearchProfiles.length > 0 ? (
              <div
                className="standing-list guild-add-member-results"
                role="listbox"
                aria-label="Search results"
                aria-multiselectable
              >
                {visibleSearchProfiles.map((profile, index) => {
                  return (
                    <div key={profile.accountId}>
                      {index > 0 ? <Divider variant="item" /> : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="guild-add-member-result"
                        disabled={pending || pasteBusy}
                        onClick={() =>
                          toggleAccount(profile.accountId, {
                            name: profile.name,
                            avatarUrl: profile.avatarUrl,
                          })
                        }
                      >
                        <StandingIdentity
                          accountId={profile.accountId}
                          profileName={profile.name}
                          avatarUrl={profile.avatarUrl}
                        />
                        <UserPlusIcon
                          aria-hidden
                          className="collection-allowlist-row-add"
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {showSources ? (
          <div className="collection-allowlist-sources">
            {onListVisible.length > 0 ? (
              <div className="collection-allowlist-section">
                <p className="collection-allowlist-section-label">
                  On list · {onListVisible.length}
                </p>
                <ul className="collection-allowlist-selected">
                  {onListVisible.map((accountId) => {
                    const profile = profiles[accountId];
                    const name = displayName(
                      accountId,
                      profile?.displayName || undefined
                    );
                    return (
                      <li key={accountId} className="collection-allowlist-chip">
                        <ProfileAvatar
                          src={profile?.avatarUrl ?? null}
                          fallbackInitial={name}
                          size="sm"
                          className="collection-allowlist-chip-avatar"
                        />
                        <span className="collection-allowlist-chip-label">
                          @{fallbackLabel(accountId)}
                        </span>
                        <button
                          type="button"
                          className="collection-allowlist-chip-remove"
                          disabled={pending || pasteBusy}
                          aria-label={`Stage remove @${fallbackLabel(accountId)}`}
                          onClick={() => stageRemoveFromList(accountId)}
                        >
                          <MultiplyIcon
                            aria-hidden
                            className="collection-allowlist-chip-remove-icon"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {guilds.length > 0 ? (
              <div className="collection-allowlist-section">
                <button
                  type="button"
                  className="collection-allowlist-text-btn"
                  disabled={pending || pasteBusy}
                  aria-expanded={guildOpen}
                  onClick={() => setGuildOpen((value) => !value)}
                >
                  {guildOpen ? 'Hide guilds' : 'From a guild'}
                </button>
                {guildOpen ? (
                  <>
                    <div className="collection-allowlist-guilds">
                      {guilds.map((guild) => (
                        <button
                          key={guild.groupId}
                          type="button"
                          className={`os-surface-chip${
                            selectedGuildId === guild.groupId
                              ? ' is-selected'
                              : ''
                          }`}
                          disabled={pending || pasteBusy}
                          onClick={() => {
                            setSelectedGuildId(guild.groupId);
                            setNote(null);
                          }}
                        >
                          {guild.name}
                        </button>
                      ))}
                    </div>
                    {selectedGuildId ? (
                      <div className="collection-allowlist-section">
                        <div className="collection-allowlist-members-head">
                          <p className="collection-allowlist-section-label">
                            {selectedGuild?.name ?? 'Members'}
                          </p>
                          {members.length > 0 ? (
                            <button
                              type="button"
                              className="collection-allowlist-text-btn"
                              disabled={pending || pasteBusy}
                              onClick={selectAllVisible}
                            >
                              All
                            </button>
                          ) : null}
                        </div>
                        {membersLoading ? (
                          <p className="guild-add-member-hint">
                            Loading members…
                          </p>
                        ) : members.length === 0 ? (
                          <p className="guild-add-member-hint">
                            No other members in this guild.
                          </p>
                        ) : members.every((row) => isSelected(row.memberId)) ? (
                          <p className="guild-add-member-hint">
                            All members added — remove from Selected to undo.
                          </p>
                        ) : (
                          <div
                            className="standing-list guild-add-member-results"
                            role="listbox"
                            aria-label="Guild members"
                            aria-multiselectable
                          >
                            {members
                              .filter((row) => !isSelected(row.memberId))
                              .map((row, index) => {
                                const profile = profiles[row.memberId];
                                return (
                                  <div key={row.memberId}>
                                    {index > 0 ? (
                                      <Divider variant="item" />
                                    ) : null}
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={false}
                                      className="guild-add-member-result"
                                      disabled={pending || pasteBusy}
                                      onClick={() =>
                                        toggleAccount(row.memberId, {
                                          name: profile?.displayName,
                                          avatarUrl: profile?.avatarUrl,
                                        })
                                      }
                                    >
                                      <StandingIdentity
                                        accountId={row.memberId}
                                        profileName={profile?.displayName}
                                        avatarUrl={profile?.avatarUrl}
                                      />
                                      <UserPlusIcon
                                        aria-hidden
                                        className="collection-allowlist-row-add"
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="collection-allowlist-section">
              <button
                type="button"
                className="collection-allowlist-text-btn"
                disabled={pending || pasteBusy}
                aria-expanded={pasteOpen}
                onClick={() => setPasteOpen((value) => !value)}
              >
                {pasteOpen ? 'Hide paste' : 'Paste accounts'}
              </button>
              {pasteOpen ? (
                <div className="collection-allowlist-field">
                  <label htmlFor={pasteId}>
                    <textarea
                      id={pasteId}
                      className={osFieldBorderedClassName}
                      value={pasteText}
                      onChange={(event) => setPasteText(event.target.value)}
                      onPaste={handlePasteClipboard}
                      onBlur={handlePasteBlur}
                      placeholder={PASTE_PLACEHOLDER}
                      rows={2}
                      disabled={pending || pasteBusy}
                    />
                  </label>
                  <small>{allowlistPasteHint(maxPerWallet)}</small>
                  {pasteBusy ? (
                    <p className="guild-add-member-hint">Checking accounts…</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </OsHugSheet>

    <OsHugSheet
      open={editingFace != null}
      onClose={closeEditSheet}
      label="Mint cap"
      {...(confirmingRemove ? { copy: 'Confirm removal' } : {})}
      closeAriaLabel="Close mint cap"
      backdropLabel="Close account edit"
      zIndex={60}
      titleId={editTitleId}
      panelClassName="collection-allowlist-edit-sheet-panel"
      bodyClassName="collection-allowlist-edit-sheet-body"
      footer={
        editingFace ? (
          <div className="guild-add-member-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant={confirmingRemove ? 'danger' : 'primary'}
                ready
                onClick={
                  confirmingRemove ? confirmEditRemove : closeEditSheet
                }
                onBlur={confirmingRemove ? clearConfirmRemove : undefined}
              >
                {confirmingRemove ? 'Remove?' : 'Done'}
              </OsSheetAction>
            </OsSheetActions>
          </div>
        ) : undefined
      }
    >
      {editingFace ? (
        <AllowlistAccountEditBody
          face={editingFace}
          capMax={capMax}
          confirmingRemove={confirmingRemove}
          onSetCap={setCapValue}
          onArmRemove={armConfirmRemove}
        />
      ) : null}
    </OsHugSheet>
    </>
  );
}

/**
 * Post-create allowlist — search profiles, pick guild members, or paste.
 * Export the sheet for create-drop draft mode (`onApply`).
 */
export { CollectionAllowlistSheet };

export function CollectionAllowlistManager({
  collectionId,
  creatorId,
  maxPerWallet = null,
}: {
  collectionId: string;
  creatorId: string;
  /** Drop max per wallet — allowlist caps cannot exceed this when set. */
  maxPerWallet?: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="collection-allowlist-toggle"
        onClick={() => setOpen(true)}
      >
        Allowlist
      </button>
      <CollectionAllowlistSheet
        open={open}
        collectionId={collectionId}
        creatorId={creatorId}
        maxPerWallet={maxPerWallet}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
