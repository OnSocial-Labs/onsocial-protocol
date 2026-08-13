'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, ProtocolMotionArrow } from '@onsocial/ui';

interface GuildSettingsSheetProps {
  open: boolean;
  guildName?: string;
  onClose: () => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
  onOpenGroupStorage: () => void;
}

/**
 * Settings hub for guild owners/admins — Edit guild + Rooms + future tools.
 * Toolbar gear opens this sheet instead of deep-linking into the editor.
 */
export function GuildSettingsSheet({
  open,
  guildName,
  onClose,
  onEditGuild,
  onOpenRooms,
  onOpenGroupStorage,
}: GuildSettingsSheetProps) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Settings"
      copy={guildName?.trim() || 'Guild tools and configuration'}
      closeAriaLabel="Close"
      backdropLabel="Close guild settings"
      zIndex={57}
      initialDetent="peek"
      presentation="swap"
      headerClassName="guild-settings-sheet-header"
      panelClassName="guild-settings-sheet-panel"
      bodyClassName="guild-settings-sheet-body"
    >
      <nav
        className="os-surface-row-list guild-settings-sheet-list"
        aria-label="Guild settings"
      >
        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => {
            onEditGuild();
            requestClose();
          }}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Edit guild</span>
            <span className="os-surface-row-description">
              Banner, name, topics, access
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>

        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => {
            onOpenRooms();
            requestClose();
          }}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Rooms</span>
            <span className="os-surface-row-description">
              Rooms and feed tabs
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>

        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => {
            onOpenGroupStorage();
            requestClose();
          }}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Group storage</span>
            <span className="os-surface-row-description">
              Fund the pool and add storage for members
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>

        <button
          type="button"
          className="os-surface-row"
          disabled
          aria-disabled="true"
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Analytics</span>
            <span className="os-surface-row-description">
              Reach, posts, and member activity
            </span>
          </span>
          <span className="os-surface-row-badge">Soon</span>
        </button>
      </nav>
    </OsHugSheet>
  );
}
