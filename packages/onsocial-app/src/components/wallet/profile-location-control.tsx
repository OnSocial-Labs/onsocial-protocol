'use client';

/**
 * Location on Edit profile. The line shows the place; tapping it opens the
 * same Based-in drawer for a person and an organisation.
 */

import { useId, useState } from 'react';
import {
  PROFILE_LOCATION_MAX,
  normalizeProfileLocationInput,
  sanitizeProfileLocationDraft,
} from '@onsocial/sdk';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { focusFieldStill, holdDrawerStill } from '@/lib/hold-drawer-still';
import { SHEET_Z } from '@/lib/sheet-z';

export function ProfileLocationControl({
  location,
  onLocationChange,
  disabled = false,
  emptyLabel,
  buttonClassName,
}: {
  location: string;
  onLocationChange: (value: string) => void;
  disabled?: boolean;
  /** Closed line when nothing is set. Org says Location; a person says Based in. */
  emptyLabel: string;
  buttonClassName: string;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(location);
  const label = location.trim() || emptyLabel;

  const openDrawer = () => {
    setDraft(location);
    setOpen(true);
  };

  const commit = () => {
    onLocationChange(normalizeProfileLocationInput(draft));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Location, ${label}`}
        onClick={openDrawer}
      >
        <PortfolioLocationMark />
        <span
          className={
            location.trim() ? undefined : 'account-editor-org-meta-placeholder'
          }
        >
          {label}
        </span>
      </button>
      <OsHugSheet
        open={open}
        onClose={() => setOpen(false)}
        label="Location"
        closeAriaLabel="Close location"
        backdropLabel="Close location"
        zIndex={SHEET_Z.confirm}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                disabled={disabled}
                onClick={commit}
              >
                Done
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="account-editor-org-meta-field">
          <label className="guild-field" htmlFor={`${formId}-input`}>
            <span>Based in</span>
            <input
              id={`${formId}-input`}
              className={osFieldBorderedClassName}
              value={draft}
              maxLength={PROFILE_LOCATION_MAX}
              autoComplete="address-level2"
              placeholder="Based in"
              disabled={disabled}
              onPointerDown={focusFieldStill}
              onFocus={holdDrawerStill}
              onChange={(event) =>
                setDraft(sanitizeProfileLocationDraft(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                commit();
              }}
            />
          </label>
        </div>
      </OsHugSheet>
    </>
  );
}
