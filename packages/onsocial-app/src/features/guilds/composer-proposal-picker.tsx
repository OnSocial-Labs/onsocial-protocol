'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChoiceDrawer, type ChoiceOption } from '@onsocial/ui';
import type { Proposal } from '@onsocial/sdk';
import type { ComposerProposalDraft } from '@/features/guilds/guild-composer-sheet';
import {
  guildProposalPresentation,
  partitionGuildGovernanceProposals,
} from '@/features/guilds/guild-proposal-display';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const MAX_GUILDS = 8;
const PROPOSALS_PER_GUILD = 12;

/** Guild composer stays on that guild. Public loads memberships. */
export function proposalPickerScope(
  groupId?: string | null
): 'guild' | 'memberships' {
  return groupId?.trim() ? 'guild' : 'memberships';
}

type PickerProposal = ComposerProposalDraft & {
  pickerKey: string;
  description?: string;
};

function draftFromProposal(
  groupId: string,
  groupName: string | null,
  proposal: Proposal
): PickerProposal | null {
  const id = proposal.id?.trim();
  if (!id) return null;
  const presentation = guildProposalPresentation(proposal);
  return {
    pickerKey: `${groupId}:${id}`,
    groupId,
    proposalId: id,
    title: presentation.headline || proposal.title?.trim() || 'Proposal',
    kind: presentation.kind,
    status: proposal.status,
    ...(groupName?.trim() ? { groupName: groupName.trim() } : {}),
    description: [presentation.kind, groupName?.trim() || groupId]
      .filter(Boolean)
      .join(' · '),
  };
}

async function loadAttachableProposals(args: {
  accountId: string;
  groupId?: string | null;
  groupName?: string | null;
}): Promise<PickerProposal[]> {
  const client = createReadOnlyOnSocialClient();
  const byKey = new Map<string, PickerProposal>();

  const addRows = (
    groupId: string,
    groupName: string | null,
    rows: Proposal[]
  ) => {
    const { active } = partitionGuildGovernanceProposals(rows);
    for (const proposal of active) {
      const draft = draftFromProposal(groupId, groupName, proposal);
      if (draft) byKey.set(draft.pickerKey, draft);
    }
  };

  const scopedGroupId = args.groupId?.trim() || '';
  if (proposalPickerScope(scopedGroupId) === 'guild') {
    try {
      const rows = await client.groups.listProposals(scopedGroupId, {
        limit: 40,
      });
      addRows(scopedGroupId, args.groupName ?? null, rows);
    } catch {
      // Empty picker if this guild's proposals will not load.
    }
    return [...byKey.values()];
  }

  try {
    const page = await client.query.groups.membershipsBy(args.accountId, {
      limit: MAX_GUILDS,
    });
    const memberships = (page.items ?? []).slice(0, MAX_GUILDS);
    await Promise.all(
      memberships.map(async (row) => {
        const groupId = row.groupId?.trim();
        if (!groupId) return;
        try {
          const rows = await client.groups.listProposals(groupId, {
            limit: PROPOSALS_PER_GUILD,
          });
          addRows(groupId, row.groupName?.trim() || groupId, rows);
        } catch {
          // Skip a guild that will not return proposals.
        }
      })
    );
  } catch {
    // Memberships optional.
  }

  return [...byKey.values()];
}

/**
 * Nested drawer of open guild proposals the viewer can tag on a post.
 * Prefetches while the composer is open so the drawer opens with rows ready.
 */
export function ComposerProposalPicker({
  open,
  enabled,
  onClose,
  accountId,
  groupId,
  groupName,
  selectedProposalKey,
  onSelect,
  zIndex,
}: {
  open: boolean;
  enabled: boolean;
  onClose: () => void;
  accountId: string | null | undefined;
  groupId?: string | null;
  groupName?: string | null;
  selectedProposalKey?: string | null;
  onSelect: (proposal: ComposerProposalDraft) => void;
  zIndex: number;
}) {
  const [result, setResult] = useState<{
    accountId: string;
    scope: string;
    proposals: PickerProposal[];
  } | null>(null);
  const [errorFor, setErrorFor] = useState<{
    accountId: string;
    scope: string;
    message: string;
  } | null>(null);

  const scopeKey = `${accountId ?? ''}:${groupId?.trim() || '*'}`;

  useEffect(() => {
    if (!enabled || !accountId) return;
    let cancelled = false;
    void loadAttachableProposals({
      accountId,
      groupId,
      groupName,
    })
      .then((proposals) => {
        if (cancelled) return;
        setResult({ accountId, scope: scopeKey, proposals });
        setErrorFor(null);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorFor({
          accountId,
          scope: scopeKey,
          message: 'Could not load proposals.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, accountId, groupId, groupName, scopeKey]);

  const ready = Boolean(
    accountId && result?.accountId === accountId && result.scope === scopeKey
  );
  const errored = Boolean(
    accountId &&
      errorFor?.accountId === accountId &&
      errorFor.scope === scopeKey
  );
  const proposals = ready ? result!.proposals : [];
  const loading = Boolean(open && accountId) && !ready && !errored;

  const byKey = useMemo(() => {
    const map = new Map<string, PickerProposal>();
    for (const row of proposals) map.set(row.pickerKey, row);
    return map;
  }, [proposals]);

  const options = useMemo((): ChoiceOption<string>[] => {
    if (!open) return [];
    if (!accountId) {
      return [
        {
          value: '__signin__',
          label: 'Sign in to tag a proposal',
          disabled: true,
        },
      ];
    }
    if (loading) {
      return [{ value: '__loading__', label: 'Loading…', disabled: true }];
    }
    if (errored) {
      return [
        {
          value: '__error__',
          label: errorFor!.message,
          disabled: true,
        },
      ];
    }
    if (proposals.length === 0) {
      return [
        {
          value: '__empty__',
          label: 'Nothing to tag yet',
          description: groupId?.trim()
            ? 'This guild has no open proposals to tag.'
            : 'Open a guild proposal — then it shows up here to post.',
          disabled: true,
        },
      ];
    }
    return proposals.map((row) => ({
      value: row.pickerKey,
      label: row.title,
      ...(row.description ? { description: row.description } : {}),
    }));
  }, [open, accountId, groupId, loading, errored, errorFor, proposals]);

  return (
    <ChoiceDrawer
      open={open}
      onClose={onClose}
      label="Tag a proposal"
      copy="Open votes"
      value={selectedProposalKey?.trim() || ''}
      options={options}
      onChange={(id) => {
        if (id.startsWith('__')) return;
        const row = byKey.get(id);
        if (!row) return;
        const { description: _description, pickerKey: _key, ...draft } = row;
        onSelect(draft);
      }}
      zIndex={zIndex}
    />
  );
}
