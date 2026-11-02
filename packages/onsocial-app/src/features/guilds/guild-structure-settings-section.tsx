'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ChoiceDrawerField,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSurfaceRow,
  OsSurfaceRowList,
  osFieldBorderedClassName,
  type ActionDrawerItem,
  type ChoiceOption,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import {
  GUILD_POST_POLICY_FORM_HINT,
  GUILD_POST_POLICY_OPTIONS,
  GUILD_STRUCTURE_TEMPLATES,
  cloneGuildStructure,
  librarySpacesNotInStructure,
  mergeStructureSpaces,
  normalizeCustomSpaceInput,
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
  const [customTitle, setCustomTitle] = useState('');
  const [customPolicy, setCustomPolicy] =
    useState<GuildSpacePostPolicy>('members');
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

  const addCustomSpace = () => {
    const space = normalizeCustomSpaceInput({
      title: customTitle,
      kind: 'discussion',
      postPolicy: customPolicy,
      audience: 'members',
    });
    if (!space) return;
    if (structure.spaces.some((entry) => entry.id === space.id)) return;
    onChange(mergeStructureSpaces(structure, space));
    setCustomTitle('');
    setEditingId(space.id);
  };

  const applyTemplate = (templateId: string) => {
    const template = GUILD_STRUCTURE_TEMPLATES[templateId];
    if (!template) return;
    onChange(cloneGuildStructure(template.structure));
    setEditingId(null);
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
  const editOpen = Boolean(editingSpace) && !editClosing;
  const lockedOn = Boolean(
    editingSpace?.enabled && editingSpace.id === 'general'
  );

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
              setEditClosing(false);
              setEditingId(space.id);
            }}
          />
        ))}
      </OsSurfaceRowList>

      <div className="guild-structure-add">
        <label className="guild-field">
          <span>Name</span>
          <input
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
            placeholder="Shipping Room"
            disabled={disabled}
            maxLength={40}
            autoComplete="off"
            className={osFieldBorderedClassName}
          />
        </label>
        <div className="guild-field">
          <ChoiceDrawerField
            label="Who can share"
            value={customPolicy}
            options={SHARE_OPTIONS}
            disabled={disabled}
            persistSelected
            copy="Who may post in the new room"
            hint={GUILD_POST_POLICY_FORM_HINT[customPolicy]}
            zIndex={SHEET_Z.nested}
            onChange={setCustomPolicy}
          />
        </div>
        <OsSheetActions
          layout="row-compact"
          size="sm"
          borderless
          className="guild-structure-add-button"
        >
          <OsSheetAction
            type="button"
            variant="ghost"
            disabled={disabled || !customTitle.trim()}
            onClick={addCustomSpace}
          >
            Add room
          </OsSheetAction>
        </OsSheetActions>
      </div>

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
        }}
        label="Room"
        copy={editingSpace?.title || 'Edit room'}
        closeAriaLabel="Close room"
        backdropLabel="Close room"
        zIndex={SHEET_Z.nested}
        headerClassName="guild-settings-sheet-header"
        panelClassName="guild-settings-sheet-panel os-sheet-cap-short"
      >
        {editingSpace ? (
          <div className="guild-structure-room-edit">
            <label className="guild-field">
              <span>Name</span>
              <input
                value={editingSpace.title}
                disabled={disabled}
                maxLength={40}
                autoComplete="off"
                className={osFieldBorderedClassName}
                onChange={(event) =>
                  onChange(
                    updateGuildSpaceTitle(
                      structure,
                      editingSpace.id,
                      event.target.value
                    )
                  )
                }
              />
            </label>
            <div className="guild-field">
              <ChoiceDrawerField
                label="Who can share"
                value={editingSpace.postPolicy}
                options={SHARE_OPTIONS}
                disabled={disabled}
                persistSelected
                copy="Who may post in this room"
                zIndex={SHEET_Z.nestedConfirm}
                onChange={(next) =>
                  onChange(
                    updateGuildSpacePostPolicy(
                      structure,
                      editingSpace.id,
                      next
                    )
                  )
                }
              />
            </div>
            <div className="guild-field">
              <ChoiceDrawerField
                label="Feed tab"
                value={editingSpace.enabled ? 'on' : 'off'}
                options={FEED_TAB_OPTIONS.map((option) =>
                  option.value === 'off' && lockedOn
                    ? { ...option, disabled: true }
                    : option
                )}
                disabled={disabled || lockedOn}
                persistSelected
                copy="Whether this room shows in the feed"
                zIndex={SHEET_Z.nestedConfirm}
                onChange={(next) =>
                  onChange(
                    toggleGuildSpaceEnabled(
                      structure,
                      editingSpace.id,
                      next === 'on'
                    )
                  )
                }
              />
            </div>
            {sortedSpaces.length > 1 ? (
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
