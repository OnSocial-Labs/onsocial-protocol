'use client';

import { SettingsIcon, UserPlusIcon } from '@onsocial/ui';
import type { CreatorAccess } from '@/features/scarces/apps-data';
import { hubUsesCreatorRoster } from '@/features/scarces/apps-data';
import { formatProfileCount } from '@/lib/profile-social-standings';

export interface HubHeroActionVisibility {
  showPublishRequest: boolean;
  showSettings: boolean;
}

/**
 * Hero icon row for a hub. Plus asks to publish. Gear opens settings.
 * Staff never see the plus — they can already publish. Open and Invite
 * hubs have no ask. The words live in the sheet.
 */
export function hubHeroActionVisibility(input: {
  creatorAccess: CreatorAccess;
  canCreate: boolean;
  isAuthority: boolean;
  isOwner: boolean;
}): HubHeroActionVisibility {
  return {
    showPublishRequest:
      input.creatorAccess === 'approval' &&
      !input.canCreate &&
      !input.isAuthority,
    showSettings:
      input.isAuthority &&
      (input.isOwner || hubUsesCreatorRoster(input.creatorAccess)),
  };
}

/** Same quiet icons as the guild hero, on the hub meta row. */
export function HubHeroActions({
  showPublishRequest,
  showSettings,
  requestCount = 0,
  onRequestPublish,
  onOpenSettings,
}: HubHeroActionVisibility & {
  /** Pending publish requests. Candy badge on the gear when this is above zero. */
  requestCount?: number;
  onRequestPublish: () => void;
  onOpenSettings: () => void;
}) {
  if (!showPublishRequest && !showSettings) return null;

  return (
    <div className="guild-hero-actions">
      {showPublishRequest ? (
        <button
          type="button"
          className="guild-hero-action-icon"
          aria-label="Request to publish"
          onClick={onRequestPublish}
        >
          <UserPlusIcon className="glass-sheet-close-icon" aria-hidden />
        </button>
      ) : null}
      {showSettings ? (
        <button
          type="button"
          className={`guild-hero-action-icon${
            requestCount > 0 ? ' has-badge' : ''
          }`}
          aria-label={
            requestCount > 0
              ? `Hub settings, ${requestCount} publish requests`
              : 'Hub settings'
          }
          onClick={onOpenSettings}
        >
          <SettingsIcon className="glass-sheet-close-icon" aria-hidden />
          {requestCount > 0 ? (
            <span className="guild-manage-menu-badge" aria-hidden>
              {formatProfileCount(requestCount)}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
