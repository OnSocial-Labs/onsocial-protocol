'use client';

import { useCallback, useState } from 'react';
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
  GUILD_POST_POLICY_OPTIONS,
  appendCustomGuildSpace,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { persistGuildStructure } from '@/features/guilds/persist-guild-structure';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const FEED_TAB_OPTIONS: ChoiceOption<'on' | 'off'>[] = [
  {
    value: 'on',
    label: 'In feed',
    description: 'Shows as a room tab',
  },
  {
    value: 'off',
    label: 'Hidden',
    description: 'Kept in settings only',
  },
];

const SHARE_OPTIONS: ChoiceOption<GuildSpacePostPolicy>[] =
  GUILD_POST_POLICY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.hint,
  }));

export interface GuildRoomEditorFieldsProps {
  title: string;
  postPolicy: GuildSpacePostPolicy;
  enabled: boolean;
  disabled?: boolean;
  pending?: boolean;
  error?: string | null;
  autoFocus?: boolean;
  feedTabLocked?: boolean;
  choiceZIndex: number;
  onTitleChange: (title: string) => void;
  onPolicyChange: (next: GuildSpacePostPolicy) => void;
  onEnabledChange: (enabled: boolean) => void;
  /** Present while creating. Editing a room writes through the field callbacks. */
  onSubmit?: () => void;
}

/** Name, share rule, and feed-tab fields shared by settings and the feed plus. */
export function GuildRoomEditorFields({
  title,
  postPolicy,
  enabled,
  disabled = false,
  pending = false,
  error = null,
  autoFocus = false,
  feedTabLocked = false,
  choiceZIndex,
  onTitleChange,
  onPolicyChange,
  onEnabledChange,
  onSubmit,
}: GuildRoomEditorFieldsProps) {
  const scrollFieldIntoView = useMobileFieldFocusScroll<HTMLInputElement>();
  const busy = disabled || pending;

  return (
    <>
      <label className="guild-field">
        <span>Name</span>
        <input
          value={title}
          disabled={busy}
          maxLength={40}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Shipping Room"
          className={osFieldBorderedClassName}
          onFocus={scrollFieldIntoView}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      {error ? (
        <p className="guild-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="guild-field">
        <ChoiceDrawerField
          label="Who can share"
          value={postPolicy}
          options={SHARE_OPTIONS}
          disabled={busy}
          persistSelected
          copy="Who may post in this room"
          zIndex={choiceZIndex}
          onChange={onPolicyChange}
        />
      </div>
      <div className="guild-field">
        <ChoiceDrawerField
          label="Feed tab"
          value={enabled ? 'on' : 'off'}
          options={FEED_TAB_OPTIONS.map((option) =>
            option.value === 'off' && feedTabLocked
              ? { ...option, disabled: true }
              : option
          )}
          disabled={busy || feedTabLocked}
          persistSelected
          copy="Whether this room shows in the feed"
          zIndex={choiceZIndex}
          onChange={(next) => onEnabledChange(next === 'on')}
        />
      </div>
      {onSubmit ? (
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={Boolean(title.trim()) && !busy}
            pending={pending}
            pendingLabel="Adding…"
            disabled={busy || !title.trim()}
            onClick={onSubmit}
          >
            Add room
          </OsSheetAction>
        </OsSheetActions>
      ) : null}
    </>
  );
}

export interface GuildAddedSpaceResult {
  id: string;
  title: string;
  postPolicy: GuildSpacePostPolicy;
}

interface GuildFeedAddRoomSheetProps {
  open: boolean;
  groupId: string;
  memberDriven: boolean;
  structure: GuildStructureDocument;
  onClose: () => void;
  onSaved?: (space?: GuildAddedSpaceResult) => void;
}

/**
 * Feed-rail add room. Same editor as settings; confirming here is the save.
 */
export function GuildFeedAddRoomSheet({
  open,
  groupId,
  memberDriven,
  structure,
  onClose,
  onSaved,
}: GuildFeedAddRoomSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [title, setTitle] = useState('');
  const [postPolicy, setPostPolicy] = useState<GuildSpacePostPolicy>('members');
  const [enabled, setEnabled] = useState(true);
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
      setEnabled(true);
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

  const handleSubmit = async () => {
    const result = appendCustomGuildSpace(structure, {
      title,
      postPolicy,
      enabled,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const previousIds = new Set(structure.spaces.map((space) => space.id));
    const added = result.structure.spaces.find(
      (space) => !previousIds.has(space.id)
    );

    setPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      const confirmed = await persistGuildStructure(
        client,
        groupId,
        memberDriven,
        result.structure,
        async (input) => trackTransaction(input)
      );
      if (confirmed) {
        onSaved?.(
          added
            ? {
                id: added.id,
                title: added.title,
                postPolicy: added.postPolicy,
              }
            : undefined
        );
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

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      label="Add room"
      copy="New feed tab"
      closeAriaLabel="Close add room"
      backdropLabel="Close add room"
      zIndex={SHEET_Z.facts}
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel os-sheet-cap-short"
    >
      <div className="guild-structure-room-edit">
        <GuildRoomEditorFields
          title={title}
          postPolicy={postPolicy}
          enabled={enabled}
          pending={pending}
          error={error}
          autoFocus
          choiceZIndex={SHEET_Z.nested}
          onTitleChange={(next) => {
            setTitle(next);
            setError(null);
          }}
          onPolicyChange={setPostPolicy}
          onEnabledChange={setEnabled}
          onSubmit={() => void handleSubmit()}
        />
      </div>
    </OsHugSheet>
  );
}
