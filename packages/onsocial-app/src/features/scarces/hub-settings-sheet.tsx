'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetCloseButton,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import type { HubManageSheetId } from '@/features/scarces/hub-manage-sheets';

interface HubSettingsSheetProps {
  open: boolean;
  hubName?: string;
  showPeople: boolean;
  onClose: () => void;
  onOpenSheet: (sheet: HubManageSheetId) => void;
}

/**
 * Settings hub for hub owners — look / access / people / transfer.
 * Toolbar gear opens this sheet instead of an inline manage dump.
 */
export function HubSettingsSheet({
  open,
  hubName,
  showPeople,
  onClose,
  onOpenSheet,
}: HubSettingsSheetProps) {
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

  const openSheet = (sheet: HubManageSheetId) => {
    onOpenSheet(sheet);
    requestClose();
  };

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
      backdropLabel="Close hub settings"
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
                    {hubName?.trim() || 'Hub tools and configuration'}
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
        aria-label="Hub settings"
      >
        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => openSheet('look')}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Edit look</span>
            <span className="os-surface-row-description">
              Logo, banner, name, categories
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>

        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => openSheet('access')}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Access & sales</span>
            <span className="os-surface-row-description">
              Commission and who can create drops
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>

        {showPeople ? (
          <button
            type="button"
            className="os-surface-row os-surface-row--navigate"
            onClick={() => openSheet('people')}
          >
            <span className="os-surface-row-copy">
              <span className="os-surface-row-label">People</span>
              <span className="os-surface-row-description">
                Moderators and approved creators
              </span>
            </span>
            <ProtocolMotionArrow className="account-card-action-arrow" />
          </button>
        ) : null}

        <button
          type="button"
          className="os-surface-row os-surface-row--navigate"
          onClick={() => openSheet('transfer')}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Transfer hub</span>
            <span className="os-surface-row-description">
              Hand ownership to another account
            </span>
          </span>
          <ProtocolMotionArrow className="account-card-action-arrow" />
        </button>
      </nav>
    </GlassSheet>
  );
}
