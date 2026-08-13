'use client';

import { useCallback, useId, useState, type FormEvent } from 'react';
import { OsHugSheet, osFieldSoftClassName } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  GUILD_POST_POLICY_OPTIONS,
  cloneGuildStructure,
  mergeStructureSpaces,
  normalizeCustomSpaceInput,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { persistGuildStructure } from '@/features/guilds/persist-guild-structure';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const POLICY_CHIP_LABEL: Record<GuildSpacePostPolicy, string> = {
  members: 'Everyone',
  moderators: 'Team',
  admins: 'Leaders',
  allowlist: 'Selected',
};

const POLICY_HINT: Record<GuildSpacePostPolicy, string> = {
  members: 'Any member can share.',
  moderators: 'Mods, admins, and owner.',
  admins: 'Admins and owner only.',
  allowlist: 'Choose members next. Leaders can always share.',
};

export interface GuildAddedSpaceResult {
  id: string;
  title: string;
  postPolicy: GuildSpacePostPolicy;
}

interface GuildAddSpaceSheetProps {
  open: boolean;
  groupId: string;
  memberDriven: boolean;
  structure: GuildStructureDocument;
  onClose: () => void;
  onSaved?: (space?: GuildAddedSpaceResult) => void;
}

export function GuildAddSpaceSheet({
  open,
  groupId,
  memberDriven,
  structure,
  onClose,
  onSaved,
}: GuildAddSpaceSheetProps) {
  const shareLabelId = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [title, setTitle] = useState('');
  const [postPolicy, setPostPolicy] = useState<GuildSpacePostPolicy>('members');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle('');
      setPostPolicy('members');
      setError(null);
      setPending(false);
      setClosing(false);
    }
  }

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const space = normalizeCustomSpaceInput({
      title,
      kind: 'discussion',
      postPolicy,
      audience: 'members',
    });
    if (!space) {
      setError('Enter a room name.');
      return;
    }
    if (structure.spaces.some((entry) => entry.id === space.id)) {
      setError('A room with this name already exists.');
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
        onSaved?.({
          id: space.id,
          title: space.title,
          postPolicy: space.postPolicy,
        });
        setClosing(true);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not add this room.'
      );
    } finally {
      setPending(false);
    }
  };

  const canSubmit = Boolean(title.trim()) && !pending;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      label="Add room"
      copy="New feed tab in this guild."
      closeAriaLabel="Close"
      backdropLabel="Close add room"
      zIndex={57}
      initialDetent="peek"
      presentation="swap"
      headerClassName="guild-add-space-sheet-header"
      panelClassName="guild-add-space-sheet-panel"
      bodyClassName="guild-add-space-sheet-body"
    >
      <form
        className="guild-add-space-sheet-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="guild-add-space-field">
          <span className="guild-add-space-label">Name</span>
          <input
            className={`${osFieldSoftClassName} guild-add-space-input`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Shipping Room"
            disabled={pending}
            maxLength={40}
            autoFocus
            autoComplete="off"
            onFocus={scrollFieldIntoView}
          />
        </label>

        <div className="guild-add-space-field">
          <span className="guild-add-space-label" id={shareLabelId}>
            Who can share
          </span>
          <div
            className="guild-add-space-segments"
            role="radiogroup"
            aria-labelledby={shareLabelId}
          >
            {GUILD_POST_POLICY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={postPolicy === option.value}
                className={
                  postPolicy === option.value
                    ? 'guild-add-space-segment is-active'
                    : 'guild-add-space-segment'
                }
                disabled={pending}
                onClick={() => setPostPolicy(option.value)}
              >
                {POLICY_CHIP_LABEL[option.value]}
              </button>
            ))}
          </div>
          <p className="guild-add-space-hint" aria-live="polite">
            {POLICY_HINT[postPolicy]}
          </p>
        </div>

        {error ? (
          <p className="guild-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            variant="primary"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Adding…"
            disabled={!canSubmit}
          >
            Add room
          </OsSheetAction>
        </OsSheetActions>
      </form>
    </OsHugSheet>
  );
}
