'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  type ActionDrawerItem,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import { GuildRoomEditorFields } from '@/features/guilds/guild-room-editor';
import {
  GUILD_STRUCTURE_TEMPLATES,
  appendCustomGuildSpace,
  cloneGuildStructure,
  librarySpacesNotInStructure,
  mergeStructureSpaces,
  postPolicyLabel,
  reorderGuildSpace,
  toggleGuildSpaceEnabled,
  updateGuildSpacePostPolicy,
  updateGuildSpaceTitle,
  type GuildSpace,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import {
  enableAllSuggestedSpaces,
  enableOrAddGuildSpace,
  structureChannelSuggestions,
  type DiscoveredChannelUsage,
} from '@/features/guilds/guild-structure-discovery';
import { OsChipAction } from '@/lib/os-chip-action';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildStructureSettingsSectionProps {
  structure: GuildStructureDocument;
  onChange: (structure: GuildStructureDocument) => void;
  disabled?: boolean;
  discoveredChannels?: DiscoveredChannelUsage[];
}

function roomFeedBadge(space: GuildSpace): string {
  return space.enabled ? 'In feed' : 'Hidden';
}

type RoomMenu =
  | { kind: 'arrange'; spaceId: string; title: string }
  | { kind: 'templates' }
  | null;

export function GuildStructureSettingsSection({
  structure,
  onChange,
  disabled = false,
  discoveredChannels = [],
}: GuildStructureSettingsSectionProps) {
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPolicy, setDraftPolicy] =
    useState<GuildSpacePostPolicy>('members');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClosing, setEditClosing] = useState(false);
  const [menu, setMenu] = useState<RoomMenu>(null);
  const [menuClosing, setMenuClosing] = useState(false);

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

  const addLibrarySpace = (template: GuildSpace) => {
    onChange(mergeStructureSpaces(structure, { ...template, enabled: true }));
  };

  const openCreate = () => {
    setDraftTitle('');
    setDraftPolicy('members');
    setDraftEnabled(true);
    setDraftError(null);
    setEditingId(null);
    setEditClosing(false);
    setCreating(true);
  };

  const applyTemplate = (templateId: string) => {
    const template = GUILD_STRUCTURE_TEMPLATES[templateId];
    if (!template) return;
    onChange(cloneGuildStructure(template.structure));
    setEditingId(null);
    setCreating(false);
  };

  const enableSuggestion = (channelId: string) => {
    onChange(enableOrAddGuildSpace(structure, channelId));
  };

  const closeMenu = useCallback(() => {
    if (menuClosing) return;
    setMenuClosing(true);
  }, [menuClosing]);

  const requestCloseEdit = useCallback(() => {
    if (editClosing) return;
    setEditClosing(true);
  }, [editClosing]);

  const commitCreate = () => {
    const result = appendCustomGuildSpace(structure, {
      title: draftTitle,
      postPolicy: draftPolicy,
      enabled: draftEnabled,
    });
    if (!result.ok) {
      setDraftError(result.error);
      return;
    }
    onChange(result.structure);
    requestCloseEdit();
  };

  const arrangeItems = useMemo<ActionDrawerItem[]>(() => {
    if (!menu || menu.kind !== 'arrange') return [];
    const index = sortedSpaces.findIndex((space) => space.id === menu.spaceId);
    return [
      {
        id: 'earlier',
        label: 'Move earlier',
        description: 'Higher in the room tabs',
        disabled: disabled || index <= 0,
        onSelect: () => {
          onChange(reorderGuildSpace(structure, menu.spaceId, 'up'));
          closeMenu();
        },
      },
      {
        id: 'later',
        label: 'Move later',
        description: 'Lower in the room tabs',
        disabled: disabled || index < 0 || index >= sortedSpaces.length - 1,
        onSelect: () => {
          onChange(reorderGuildSpace(structure, menu.spaceId, 'down'));
          closeMenu();
        },
      },
    ];
  }, [closeMenu, disabled, menu, onChange, sortedSpaces, structure]);

  const templateItems = useMemo<ActionDrawerItem[]>(
    () =>
      Object.entries(GUILD_STRUCTURE_TEMPLATES).map(([id, template]) => ({
        id,
        label: template.label,
        disabled,
        onSelect: () => {
          applyTemplate(id);
          closeMenu();
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- template catalog is static
    [closeMenu, disabled, onChange, structure]
  );

  const menuOpen = Boolean(menu) && !menuClosing;
  const editOpen = (creating || Boolean(editingSpace)) && !editClosing;
  const lockedOn = Boolean(
    editingSpace?.enabled && editingSpace.id === 'general'
  );
  const editorTitle = creating ? draftTitle : (editingSpace?.title ?? '');
  const editorPolicy = creating
    ? draftPolicy
    : (editingSpace?.postPolicy ?? 'members');
  const editorEnabled = creating
    ? draftEnabled
    : Boolean(editingSpace?.enabled);

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
                onClick={() => enableSuggestion(suggestion.channelId)}
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
        {sortedSpaces.map((space) => (
          <OsSurfaceRow
            key={space.id}
            label={space.title}
            description={postPolicyLabel(space.postPolicy)}
            badge={roomFeedBadge(space)}
            disabled={disabled}
            onClick={() => {
              setCreating(false);
              setEditClosing(false);
              setEditingId(space.id);
            }}
          />
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
                onClick={() => addLibrarySpace(space)}
              >
                + {space.title}
              </OsChipAction>
            ))}
          </div>
        </div>
      ) : null}

      <OsChipAction
        className="guild-structure-advanced-toggle"
        disabled={disabled}
        onClick={() => setMenu({ kind: 'templates' })}
      >
        Start from template
      </OsChipAction>

      <OsHugSheet
        open={editOpen}
        onClose={requestCloseEdit}
        onClosed={() => {
          setEditClosing(false);
          setEditingId(null);
          setCreating(false);
          setDraftError(null);
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
              title={editorTitle}
              postPolicy={editorPolicy}
              enabled={editorEnabled}
              disabled={disabled}
              error={creating ? draftError : null}
              autoFocus={creating}
              feedTabLocked={lockedOn}
              choiceZIndex={SHEET_Z.nestedConfirm}
              onTitleChange={(title) => {
                if (creating) {
                  setDraftTitle(title);
                  setDraftError(null);
                  return;
                }
                if (!editingSpace) return;
                onChange(
                  updateGuildSpaceTitle(structure, editingSpace.id, title)
                );
              }}
              onPolicyChange={(next) => {
                if (creating) {
                  setDraftPolicy(next);
                  return;
                }
                if (!editingSpace) return;
                onChange(
                  updateGuildSpacePostPolicy(structure, editingSpace.id, next)
                );
              }}
              onEnabledChange={(next) => {
                if (creating) {
                  setDraftEnabled(next);
                  return;
                }
                if (!editingSpace) return;
                onChange(
                  toggleGuildSpaceEnabled(structure, editingSpace.id, next)
                );
              }}
              onSubmit={creating ? commitCreate : undefined}
            />
            {editingSpace && sortedSpaces.length > 1 ? (
              <OsChipAction
                disabled={disabled}
                onClick={() =>
                  setMenu({
                    kind: 'arrange',
                    spaceId: editingSpace.id,
                    title: editingSpace.title,
                  })
                }
              >
                Arrange
              </OsChipAction>
            ) : null}
          </div>
        ) : null}
      </OsHugSheet>

      <ActionDrawer
        open={menuOpen}
        onClose={closeMenu}
        onClosed={() => {
          setMenuClosing(false);
          setMenu(null);
        }}
        label={
          menu?.kind === 'arrange'
            ? menu.title
            : menu?.kind === 'templates'
              ? 'Start from template'
              : 'Rooms'
        }
        copy={
          menu?.kind === 'arrange'
            ? 'Room tab order'
            : menu?.kind === 'templates'
              ? 'Replace the current rooms'
              : undefined
        }
        items={menu?.kind === 'arrange' ? arrangeItems : templateItems}
        zIndex={SHEET_Z.nestedConfirm}
      />
    </section>
  );
}
