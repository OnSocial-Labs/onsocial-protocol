'use client';

import { PlusIcon } from '@onsocial/ui';
import type { GuildSpace } from '@/features/guilds/guild-structure';

export function GuildFeedFilterList({
  selectedFeedFilterId,
  onSelectFeedFilter,
  feedSpaces,
  canAddMember,
  onAddSpace,
  receded = false,
}: {
  selectedFeedFilterId: 'all' | string;
  onSelectFeedFilter: (id: 'all' | string) => void;
  feedSpaces: GuildSpace[];
  canAddMember: boolean;
  onAddSpace: () => void;
  /** Hide in-flow row once filters dock into the elevated header. */
  receded?: boolean;
}) {
  return (
    <div
      className={`guild-feed-filter-list${receded ? ' is-receded' : ''}`}
      aria-label="Guild rooms"
    >
      <button
        className={`guild-feed-filter-button${selectedFeedFilterId === 'all' ? ' is-active' : ''}`}
        type="button"
        onClick={() => onSelectFeedFilter('all')}
      >
        All
      </button>
      {feedSpaces.map((space) => (
        <button
          key={space.id}
          className={`guild-feed-filter-button${selectedFeedFilterId === space.id ? ' is-active' : ''}`}
          type="button"
          onClick={() => onSelectFeedFilter(space.id)}
        >
          {space.title}
        </button>
      ))}
      {canAddMember ? (
        <button
          className="guild-feed-filter-button guild-feed-filter-button--add"
          type="button"
          onClick={onAddSpace}
          aria-label="Add room"
          title="Add room"
        >
          <PlusIcon aria-hidden className="guild-feed-filter-add-icon" />
        </button>
      ) : null}
    </div>
  );
}
