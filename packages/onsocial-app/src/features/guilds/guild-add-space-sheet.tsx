'use client';

import { useState, type FormEvent } from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetActions,
  OsSheetPrimaryAction,
  PulsingDots,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  GUILD_POST_POLICY_OPTIONS,
  GUILD_SPACE_KIND_OPTIONS,
  cloneGuildStructure,
  mergeStructureSpaces,
  normalizeCustomSpaceInput,
  postPolicyHint,
  type GuildSpaceKind,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { persistGuildStructure } from '@/features/guilds/persist-guild-structure';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface GuildAddSpaceSheetProps {
  open: boolean;
  groupId: string;
  memberDriven: boolean;
  structure: GuildStructureDocument;
  onClose: () => void;
  onSaved?: () => void;
}

export function GuildAddSpaceSheet({
  open,
  groupId,
  memberDriven,
  structure,
  onClose,
  onSaved,
}: GuildAddSpaceSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GuildSpaceKind>('discussion');
  const [postPolicy, setPostPolicy] =
    useState<GuildSpacePostPolicy>('members');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (pending) return;
    setTitle('');
    setKind('discussion');
    setPostPolicy('members');
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const space = normalizeCustomSpaceInput({
      title,
      kind,
      postPolicy,
      audience: 'members',
    });
    if (!space) {
      setError('Enter a space name.');
      return;
    }
    if (structure.spaces.some((entry) => entry.id === space.id)) {
      setError('A space with this name already exists.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const nextStructure = mergeStructureSpaces(
        cloneGuildStructure(structure),
        space
      );
      const { client } = await getClient();
      const confirmed = await persistGuildStructure(
        client,
        groupId,
        memberDriven,
        nextStructure,
        async (input) => trackTransaction(input)
      );
      if (confirmed) {
        setTitle('');
        onSaved?.();
        onClose();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not add this space.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <GlassSheet
      open={open}
      onClose={handleClose}
      tone="os"
      initialDetent="peek"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy="guild-add-space-title"
      backdropLabel="Close add space"
      panelClassName="guild-manage-sheet-panel"
      bodyClassName="guild-manage-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-manage-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2
                    id="guild-add-space-title"
                    className="standing-sheet-subject-name"
                  >
                    Add space
                  </h2>
                  <p className="discover-sheet-subtitle">
                    Name a feed tab and a place to share in this guild.
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={handleClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <form className="guild-add-member-sheet" onSubmit={handleSubmit}>
        <label className="guild-field">
          <span>Name</span>
          <input
            className="guild-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ship room"
            disabled={pending}
            maxLength={40}
            autoFocus
          />
        </label>

        <label className="guild-field">
          <span>Type</span>
          <select
            className="guild-input"
            value={kind}
            disabled={pending}
            onChange={(event) => setKind(event.target.value as GuildSpaceKind)}
          >
            {GUILD_SPACE_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small>Controls how posts are grouped and filtered.</small>
        </label>

        <label className="guild-field">
          <span>Who can share here</span>
          <select
            className="guild-input"
            value={postPolicy}
            disabled={pending}
            onChange={(event) =>
              setPostPolicy(event.target.value as GuildSpacePostPolicy)
            }
          >
            {GUILD_POST_POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small className="guild-structure-policy-hint">
            {postPolicyHint(postPolicy)}
          </small>
        </label>

        {error ? (
          <p className="guild-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <OsSheetActions>
          <OsSheetPrimaryAction
            pending={pending}
            type="submit"
            disabled={!title.trim()}
          >
            {pending ? <PulsingDots size="sm" /> : 'Add space'}
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>
    </GlassSheet>
  );
}
