'use client';

import type { Ref } from 'react';
import type { ProfileAboutAlign } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { ProfileAlignToolIcon } from '@/components/profile/profile-align-tool-icon';
import { cycleProfileEssayAlign } from '@/components/profile/profile-essay-align';

const ALIGN_LABEL: Record<ProfileAboutAlign, string> = {
  left: 'Align left',
  center: 'Align center',
  justify: 'Justify',
};

/**
 * Shared About / article format row. Markdown chrome portals into `chromeRef`.
 * Alignment is one dock-sized control so the row fits the phone. The shared
 * vertical divider sits in front of it, same as the write dock.
 */
export function ProfileEssayFormatToolbar({
  align,
  onAlignChange,
  disabled = false,
  chromeRef,
  alignGroupLabel = 'Text alignment',
  showAlign = true,
}: {
  align: ProfileAboutAlign;
  onAlignChange: (value: ProfileAboutAlign) => void;
  disabled?: boolean;
  chromeRef?: Ref<HTMLDivElement>;
  alignGroupLabel?: string;
  showAlign?: boolean;
}) {
  const selected = align !== 'left';
  return (
    <div className="profile-about-edit-format-toolbar" data-active="true">
      <div
        ref={chromeRef}
        className="profile-about-edit-format-tools"
        aria-label="Text formatting"
      />
      {showAlign ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className="profile-about-edit-format-divider"
          />
          <div
            className="profile-about-edit-align-tools"
            role="group"
            aria-label={alignGroupLabel}
          >
            <button
              type="button"
              className={`account-editor-bio-tool profile-about-edit-align-tool${
                selected ? ' is-active' : ''
              }`}
              aria-label={ALIGN_LABEL[align]}
              aria-pressed={selected}
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onAlignChange(cycleProfileEssayAlign(align))}
            >
              <ProfileAlignToolIcon option={align} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
