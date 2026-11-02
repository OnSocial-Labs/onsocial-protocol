'use client';

import { useCallback, useState, type FormEvent } from 'react';
import {
  ChoiceDrawerField,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  GUILD_POST_POLICY_FORM_HINT,
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
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

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

const SHARE_OPTIONS: ChoiceOption<GuildSpacePostPolicy>[] =
  GUILD_POST_POLICY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.hint,
  }));

export function GuildAddSpaceSheet({
  open,
  groupId,
  memberDriven,
  structure,
  onClose,
  onSaved,
}: GuildAddSpaceSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
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
      setTxResult({
        type: 'error',
        msg: txToastError.guildSettingsFailed,
      });
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
      zIndex={SHEET_Z.facts}
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel os-sheet-cap-short"
      bodyClassName="guild-add-space-sheet-body"
    >
      <form
        className="guild-add-space-sheet-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="guild-field">
          <span>Name</span>
          <input
            className={osFieldBorderedClassName}
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

        <div className="guild-field">
          <ChoiceDrawerField
            label="Who can share"
            value={postPolicy}
            options={SHARE_OPTIONS}
            disabled={pending}
            persistSelected
            copy="Who may post in this room"
            hint={GUILD_POST_POLICY_FORM_HINT[postPolicy]}
            zIndex={SHEET_Z.nested}
            onChange={setPostPolicy}
          />
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
