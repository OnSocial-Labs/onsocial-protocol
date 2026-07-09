'use client';

import { useMemo, useState } from 'react';
import {
  GUILD_POST_POLICY_OPTIONS,
  GUILD_SPACE_KIND_OPTIONS,
  GUILD_STRUCTURE_TEMPLATES,
  cloneGuildStructure,
  librarySpacesNotInStructure,
  mergeStructureSpaces,
  normalizeCustomSpaceInput,
  postPolicyHint,
  postPolicyLabel,
  reorderGuildSpace,
  toggleGuildSpaceEnabled,
  updateGuildSpaceTitle,
  type GuildSpace,
  type GuildSpaceAudience,
  type GuildSpaceKind,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import {
  enableAllSuggestedSpaces,
  enableOrAddGuildSpace,
  structureChannelSuggestions,
  type DiscoveredChannelUsage,
} from '@/features/guilds/guild-structure-discovery';

interface GuildStructureSettingsSectionProps {
  structure: GuildStructureDocument;
  onChange: (structure: GuildStructureDocument) => void;
  disabled?: boolean;
  discoveredChannels?: DiscoveredChannelUsage[];
}

function spaceKindLabel(kind: GuildSpaceKind): string {
  return (
    GUILD_SPACE_KIND_OPTIONS.find((option) => option.value === kind)?.label ??
    kind
  );
}

export function GuildStructureSettingsSection({
  structure,
  onChange,
  disabled = false,
  discoveredChannels = [],
}: GuildStructureSettingsSectionProps) {
  const [customTitle, setCustomTitle] = useState('');
  const [customKind, setCustomKind] = useState<GuildSpaceKind>('discussion');
  const [customPolicy, setCustomPolicy] =
    useState<GuildSpacePostPolicy>('members');
  const [customAudience, setCustomAudience] =
    useState<GuildSpaceAudience>('members');
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const addLibrarySpace = (template: GuildSpace) => {
    onChange(mergeStructureSpaces(structure, { ...template, enabled: true }));
  };

  const addCustomSpace = () => {
    const space = normalizeCustomSpaceInput({
      title: customTitle,
      kind: customKind,
      postPolicy: customPolicy,
      audience: customAudience,
    });
    if (!space) return;
    if (structure.spaces.some((entry) => entry.id === space.id)) return;
    onChange(mergeStructureSpaces(structure, space));
    setCustomTitle('');
  };

  const applyTemplate = (templateId: string) => {
    const template = GUILD_STRUCTURE_TEMPLATES[templateId];
    if (!template) return;
    onChange(cloneGuildStructure(template.structure));
  };

  const enableSuggestion = (channelId: string) => {
    onChange(enableOrAddGuildSpace(structure, channelId));
  };

  return (
    <section className="guild-section guild-structure-settings">
      <div className="guild-section-head">
        <p className="guild-eyebrow">Rooms</p>
        <h2>Guild rooms</h2>
        <p>
          Name the places people share in. Each room becomes a feed tab and a
          spot in the composer.
        </p>
      </div>

      {suggestions.length > 0 ? (
        <div className="guild-structure-discovery">
          <p className="guild-structure-subhead">Existing posts found</p>
          <p className="guild-structure-discovery-copy">
            These channels already have content. Enable them to show dedicated
            tabs.
          </p>
          <div className="guild-structure-chip-row">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.channelId}
                type="button"
                className="guild-secondary-button guild-structure-discovery-chip"
                disabled={disabled}
                onClick={() => enableSuggestion(suggestion.channelId)}
              >
                + {suggestion.title} ({suggestion.postCount})
              </button>
            ))}
            {suggestions.length > 1 ? (
              <button
                type="button"
                className="guild-secondary-button"
                disabled={disabled}
                onClick={() =>
                  onChange(enableAllSuggestedSpaces(structure, suggestions))
                }
              >
                Enable all
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="guild-structure-add-custom guild-structure-add-primary">
        <p className="guild-structure-subhead">Add space</p>
        <div className="guild-structure-custom-grid">
          <label className="guild-field">
            <span>Name</span>
            <input
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="Ship room"
              disabled={disabled}
              maxLength={40}
            />
          </label>
          <label className="guild-field">
            <span>Type</span>
            <select
              value={customKind}
              disabled={disabled}
              onChange={(event) =>
                setCustomKind(event.target.value as GuildSpaceKind)
              }
            >
              {GUILD_SPACE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="guild-field">
            <span>Who can share here</span>
            <select
              value={customPolicy}
              disabled={disabled}
              onChange={(event) =>
                setCustomPolicy(event.target.value as GuildSpacePostPolicy)
              }
            >
              {GUILD_POST_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="guild-structure-policy-hint">
              {postPolicyHint(customPolicy)}
            </small>
          </label>
          <label className="guild-field">
            <span>Who sees this</span>
            <select
              value={customAudience}
              disabled={disabled}
              onChange={(event) =>
                setCustomAudience(event.target.value as GuildSpaceAudience)
              }
            >
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="guild-primary-button guild-structure-add-button"
          disabled={disabled || !customTitle.trim()}
          onClick={addCustomSpace}
        >
          Add space
        </button>
      </div>

      <div className="guild-structure-space-list">
        {sortedSpaces.map((space) => (
          <article key={space.id} className="guild-structure-space-row">
            <div className="guild-structure-space-copy">
              <label className="guild-structure-space-title-field">
                <span className="sr-only">Space name</span>
                <input
                  className="guild-structure-space-title-input"
                  value={space.title}
                  disabled={disabled}
                  maxLength={40}
                  onChange={(event) =>
                    onChange(
                      updateGuildSpaceTitle(
                        structure,
                        space.id,
                        event.target.value
                      )
                    )
                  }
                />
              </label>
              <span>
                {postPolicyLabel(space.postPolicy)} · {spaceKindLabel(space.kind)}
              </span>
              <span className="guild-structure-space-hint">
                {postPolicyHint(space.postPolicy)}
              </span>
            </div>
            <div className="guild-structure-space-actions">
              <button
                type="button"
                className="guild-secondary-button guild-structure-icon-button"
                disabled={disabled}
                aria-label={`Move ${space.title} up`}
                onClick={() =>
                  onChange(reorderGuildSpace(structure, space.id, 'up'))
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="guild-secondary-button guild-structure-icon-button"
                disabled={disabled}
                aria-label={`Move ${space.title} down`}
                onClick={() =>
                  onChange(reorderGuildSpace(structure, space.id, 'down'))
                }
              >
                ↓
              </button>
              <label className="guild-structure-toggle">
                <input
                  type="checkbox"
                  checked={space.enabled}
                  disabled={disabled || (space.enabled && space.id === 'general')}
                  onChange={(event) =>
                    onChange(
                      toggleGuildSpaceEnabled(
                        structure,
                        space.id,
                        event.target.checked
                      )
                    )
                  }
                />
                <span>{space.enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
          </article>
        ))}
      </div>

      {libraryAdds.length > 0 ? (
        <div className="guild-structure-add-library">
          <p className="guild-structure-subhead">Suggested spaces</p>
          <div className="guild-structure-chip-row">
            {libraryAdds.map((space) => (
              <button
                key={space.id}
                type="button"
                className="guild-secondary-button"
                disabled={disabled}
                onClick={() => addLibrarySpace(space)}
              >
                + {space.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="guild-structure-advanced">
        <button
          type="button"
          className="guild-secondary-button guild-structure-advanced-toggle"
          disabled={disabled}
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? 'Hide templates' : 'Start from template'}
        </button>
        {showAdvanced ? (
          <label className="guild-field" htmlFor="guild-structure-template">
            <span>Template</span>
            <select
              id="guild-structure-template"
              defaultValue=""
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                applyTemplate(value);
                event.target.value = '';
              }}
            >
              <option value="">Choose template…</option>
              {Object.entries(GUILD_STRUCTURE_TEMPLATES).map(([id, template]) => (
                <option key={id} value={id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}
