'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetCloseButton,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

interface GuildSettingsSheetProps {
  open: boolean;
  guildName?: string;
  onClose: () => void;
  onEditGuild: () => void;
  onOpenRooms: () => void;
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
}: GuildSettingsSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="peek"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close guild settings"
      panelClassName="guild-settings-sheet-panel"
      bodyClassName="guild-settings-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-settings-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Settings
                  </h2>
                  <p className="discover-sheet-subtitle">
                    {guildName?.trim() || 'Guild tools and configuration'}
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
              Banner, avatar, name, tags, access
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
          className="os-surface-row"
          disabled
          aria-disabled="true"
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Group storage</span>
            <span className="os-surface-row-description">
              Shared files and media quota
            </span>
          </span>
          <span className="os-surface-row-badge">Soon</span>
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
    </GlassSheet>
  );
}
