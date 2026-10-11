'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';
import {
  guildSettingsActions,
  type GuildSettingsActionId,
} from '@/features/guilds/guild-settings-actions';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildSettingsSheetProps {
  open: boolean;
  guildName?: string;
  viewer: { isOwner: boolean; isAdmin: boolean } | null;
  onClose: () => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
  onOpenGroupStorage: () => void;
}

/**
 * Settings hub for guild owners and admins.
 * Toolbar gear opens this sheet instead of deep-linking into the editor.
 */
export function GuildSettingsSheet({
  open,
  guildName,
  viewer,
  onClose,
  onEditGuild,
  onOpenRooms,
  onOpenGroupStorage,
}: GuildSettingsSheetProps) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const actions = guildSettingsActions(viewer);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const select = useCallback(
    (id: GuildSettingsActionId) => {
      if (id === 'edit') onEditGuild();
      if (id === 'rooms') onOpenRooms();
      if (id === 'storage') onOpenGroupStorage();
      requestClose();
    },
    [onEditGuild, onOpenGroupStorage, onOpenRooms, requestClose]
  );

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Settings"
      copy={guildName?.trim() || 'Guild tools and configuration'}
      closeAriaLabel="Close"
      backdropLabel="Close guild settings"
      zIndex={SHEET_Z.facts}
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel"
    >
      <OsSurfaceRowList
        className="guild-settings-sheet-list"
        aria-label="Guild settings"
      >
        {actions.map((action) => (
          <OsSurfaceRow
            key={action.id}
            label={action.label}
            description={action.description}
            onClick={() => select(action.id)}
          />
        ))}
      </OsSurfaceRowList>
    </OsHugSheet>
  );
}
