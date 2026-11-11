'use client';

import type { Ref } from 'react';
import {
  PROFILE_ABOUT_ALIGN_OPTIONS,
  type ProfileAboutAlign,
} from '@onsocial/sdk';
import { ProfileAlignToolIcon } from '@/components/profile/profile-align-tool-icon';
import { pressProfileEssayAlign } from '@/components/profile/profile-essay-align';

const ALIGN_LABEL: Record<ProfileAboutAlign, string> = {
  left: 'Align left',
  center: 'Align center',
  justify: 'Justify',
};

/**
 * Shared About / article format row. Markdown chrome portals into `chromeRef`.
 * Alignment, when shown, sits after a hairline so the two groups stay distinct.
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
  return (
    <div className="profile-about-edit-format-toolbar" data-active="true">
      <div
        ref={chromeRef}
        className="profile-about-edit-format-tools"
        aria-label="Text formatting"
      />
      {showAlign ? (
        <>
          <span className="profile-about-edit-format-split" aria-hidden="true">
            <span className="profile-about-edit-format-divider" />
          </span>
          <div
            className="profile-about-edit-align-tools"
            role="group"
            aria-label={alignGroupLabel}
          >
            {PROFILE_ABOUT_ALIGN_OPTIONS.map((option) => {
              const selected = align === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={`account-editor-bio-tool profile-about-edit-align-tool${
                    selected ? ' is-active' : ''
                  }`}
                  aria-label={ALIGN_LABEL[option]}
                  aria-pressed={selected}
                  disabled={disabled}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() =>
                    onAlignChange(pressProfileEssayAlign(align, option))
                  }
                >
                  <ProfileAlignToolIcon option={option} />
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
