'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DiscardConfirmSheet,
  OsHugSheet,
  OsOrderControls,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowItem,
  OsSurfaceRowList,
  useDiscardConfirm,
} from '@onsocial/ui';
import { GuildRoomEditorFields } from '@/features/guilds/guild-room-editor';
import {
  commitGuildSpaceEdits,
  librarySpacesNotInStructure,
  postPolicyLabel,
  reorderGuildSpace,
  type GuildSpace,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import {
  commitGuildRoomCreate,
  enableAllSuggestedSpaces,
  structureChannelSuggestions,
  type DiscoveredChannelUsage,
  type GuildRoomCreatePreset,
  type StructureChannelSuggestion,
} from '@/features/guilds/guild-structure-discovery';
import { OsChipAction } from '@/lib/os-chip-action';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildStructureSettingsSectionProps {
  structure: GuildStructureDocument;
  onChange: (structure: GuildStructureDocument) => void;
  disabled?: boolean;
  discoveredChannels?: DiscoveredChannelUsage[];
  /** Open room hug has unsaved name / share / tab edits. */
  onRoomEditorDirtyChange?: (dirty: boolean) => void;
}

function roomFeedBadge(space: GuildSpace): string {
  return space.enabled ? 'In feed' : 'Hidden';
}

export function GuildStructureSettingsSection({
  structure,
  onChange,
  disabled = false,
  discoveredChannels = [],
  onRoomEditorDirtyChange,
}: GuildStructureSettingsSectionProps) {
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPolicy, setDraftPolicy] =
    useState<GuildSpacePostPolicy>('members');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClosing, setEditClosing] = useState(false);
  const [createPreset, setCreatePreset] = useState<GuildRoomCreatePreset>({
    kind: 'blank',
  });

  const sortedSpaces = useMemo(
    () => [...structure.spaces].sort((a, b) => a.order - b.order),
    [structure.spaces]
  );
  const libraryAdds = useMemo(
    () => librarySpacesNotInStructure(structure),
    [structure]
  );
  const suggestions = useMemo(
    () => structureChannelSuggestions(structure, discoveredChannels),
    [discoveredChannels, structure]
  );
  const editingSpace = useMemo(
    () => sortedSpaces.find((space) => space.id === editingId) ?? null,
    [editingId, sortedSpaces]
  );

  const openCreateEditor = (seed: {
    title: string;
    postPolicy: GuildSpacePostPolicy;
    enabled: boolean;
    preset: GuildRoomCreatePreset;
  }) => {
    setDraftTitle(seed.title);
    setDraftPolicy(seed.postPolicy);
    setDraftEnabled(seed.enabled);
    setDraftError(null);
    setEditingId(null);
    setEditClosing(false);
    setCreatePreset(seed.preset);
    setCreating(true);
  };

  const openCreate = () => {
    openCreateEditor({
      title: '',
      postPolicy: 'members',
      enabled: true,
      preset: { kind: 'blank' },
    });
  };

  const openLibraryCreate = (space: GuildSpace) => {
    openCreateEditor({
      title: space.title,
      postPolicy: space.postPolicy,
      enabled: true,
      preset: { kind: 'library', libraryId: space.id },
    });
  };

  const openSuggestionCreate = (suggestion: StructureChannelSuggestion) => {
    const existing = structure.spaces.find(
      (space) => space.id === suggestion.channelId
    );
    openCreateEditor({
      title: suggestion.title,
      postPolicy: existing?.postPolicy ?? 'members',
      enabled: true,
      preset: { kind: 'suggestion', channelId: suggestion.channelId },
    });
  };

  const finishEdit = useCallback(() => {
    setEditClosing(true);
  }, []);

  const commitCreate = () => {
    const result = commitGuildRoomCreate(
      structure,
      {
        title: draftTitle,
        postPolicy: draftPolicy,
        enabled: draftEnabled,
      },
      createPreset
    );
    if (!result.ok) {
      setDraftError(result.error);
      return;
    }
    onChange(result.structure);
    finishEdit();
  };

  const commitEdit = () => {
    if (!editingSpace) return;
    const result = commitGuildSpaceEdits(structure, editingSpace.id, {
      title: draftTitle,
      postPolicy: draftPolicy,
      enabled: draftEnabled,
    });
    if (!result.ok) {
      setDraftError(result.error);
      return;
    }
    onChange(result.structure);
    finishEdit();
  };

  const editOpen = (creating || Boolean(editingSpace)) && !editClosing;
  const lockedOn = Boolean(
    editingSpace?.enabled && editingSpace.id === 'general'
  );
  const editDirty = Boolean(
    editingSpace &&
      (draftTitle.trim() !== editingSpace.title.trim() ||
        draftPolicy !== editingSpace.postPolicy ||
        draftEnabled !== editingSpace.enabled)
  );
  const editorDirty = creating ? Boolean(draftTitle.trim()) : editDirty;

  useEffect(() => {
    onRoomEditorDirtyChange?.(editOpen ? editorDirty : false);
  }, [editOpen, editorDirty, onRoomEditorDirtyChange]);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open: editOpen,
    dirty: editorDirty,
    onClose: finishEdit,
  });

  const requestCloseEdit = useCallback(() => {
    if (editClosing) return;
    if (requestCloseOrConfirm()) finishEdit();
  }, [editClosing, finishEdit, requestCloseOrConfirm]);

  return (
    <section className="guild-section guild-structure-settings">
      {suggestions.length > 0 ? (
        <div className="guild-structure-discovery">
          <p className="guild-structure-subhead">Existing posts found</p>
          <p className="guild-structure-discovery-copy">
            These channels already have content. Enable them to show dedicated
            tabs.
          </p>
          <div className="guild-structure-chip-row">
            {suggestions.map((suggestion) => (
              <OsChipAction
                key={suggestion.channelId}
                disabled={disabled}
                onClick={() => openSuggestionCreate(suggestion)}
              >
                + {suggestion.title} ({suggestion.postCount})
              </OsChipAction>
            ))}
            {suggestions.length > 1 ? (
              <OsChipAction
                disabled={disabled}
                onClick={() =>
                  onChange(enableAllSuggestedSpaces(structure, suggestions))
                }
              >
                Enable all
              </OsChipAction>
            ) : null}
          </div>
        </div>
      ) : null}

      <OsSurfaceRowList
        as="div"
        className="guild-structure-room-list"
        aria-label="Guild rooms"
      >
        {sortedSpaces.map((space, index) => (
          <OsSurfaceRowItem key={space.id}>
            <OsSurfaceRow
              label={space.title}
              description={postPolicyLabel(space.postPolicy)}
              badge={roomFeedBadge(space)}
              disabled={disabled}
              onClick={() => {
                setCreating(false);
                setEditClosing(false);
                setDraftTitle(space.title);
                setDraftPolicy(space.postPolicy);
                setDraftEnabled(space.enabled);
                setDraftError(null);
                setEditingId(space.id);
              }}
            />
            <OsOrderControls
              aria-label={`Reorder ${space.title}`}
              earlierLabel={`Move ${space.title} earlier`}
              laterLabel={`Move ${space.title} later`}
              earlierDisabled={disabled || index === 0}
              laterDisabled={
                disabled || index >= sortedSpaces.length - 1
              }
              onEarlier={() =>
                onChange(reorderGuildSpace(structure, space.id, 'up'))
              }
              onLater={() =>
                onChange(reorderGuildSpace(structure, space.id, 'down'))
              }
            />
          </OsSurfaceRowItem>
        ))}
      </OsSurfaceRowList>

      <OsSheetActions
        layout="row-compact"
        size="sm"
        borderless
        className="guild-structure-add-button"
      >
        <OsSheetAction
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={openCreate}
        >
          Add room
        </OsSheetAction>
      </OsSheetActions>

      {libraryAdds.length > 0 ? (
        <div className="guild-structure-add-library">
          <p className="guild-structure-subhead">Suggested rooms</p>
          <div className="guild-structure-chip-row">
            {libraryAdds.map((space) => (
              <OsChipAction
                key={space.id}
                disabled={disabled}
                onClick={() => openLibraryCreate(space)}
              >
                + {space.title}
              </OsChipAction>
            ))}
          </div>
        </div>
      ) : null}

      <OsHugSheet
        open={editOpen}
        onClose={requestCloseEdit}
        onClosed={() => {
          setEditClosing(false);
          setEditingId(null);
          setCreating(false);
          setCreatePreset({ kind: 'blank' });
          setDraftError(null);
          clearDiscardConfirm();
        }}
        label={creating ? 'Add room' : 'Room'}
        copy={creating ? 'New feed tab' : editingSpace?.title || 'Edit room'}
        closeAriaLabel={creating ? 'Close add room' : 'Close room'}
        backdropLabel={creating ? 'Close add room' : 'Close room'}
        zIndex={SHEET_Z.nested}
        headerClassName="guild-settings-sheet-header"
        panelClassName="guild-settings-sheet-panel os-sheet-cap-short"
      >
        {creating || editingSpace ? (
          <div className="guild-structure-room-edit">
            <GuildRoomEditorFields
              title={draftTitle}
              postPolicy={draftPolicy}
              enabled={draftEnabled}
              disabled={disabled}
              error={draftError}
              feedTabLocked={lockedOn}
              choiceZIndex={SHEET_Z.nestedConfirm}
              submitLabel={creating ? 'Add room' : 'Save'}
              submitReady={
                Boolean(draftTitle.trim()) &&
                !disabled &&
                (creating || editDirty)
              }
              onTitleChange={(title) => {
                setDraftTitle(title);
                setDraftError(null);
              }}
              onPolicyChange={(next) => {
                setDraftPolicy(next);
                setDraftError(null);
              }}
              onEnabledChange={(next) => {
                setDraftEnabled(next);
                setDraftError(null);
              }}
              onSubmit={creating ? commitCreate : commitEdit}
            />
          </div>
        ) : null}
      </OsHugSheet>

      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
        presentation="appear"
      />
    </section>
  );
}
