'use client';

/**
 * Org meta in Edit profile — one face-matching line:
 * industry · location · Hiring. Each segment opens a drawer/sheet.
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  PROFILE_INDUSTRY_MAX,
  PROFILE_LOCATION_MAX,
  hiringLineAriaLabel,
  hiringLineLabel,
  isProfileIndustryWriteIn,
  matchProfileIndustryOption,
  profileIndustryChoiceOptions,
  profileIndustryDrawerValue,
  profileOrgLineLabel,
  sanitizeProfileIndustryDraft,
  sanitizeProfileLocationDraft,
} from '@onsocial/sdk';
import {
  ChoiceDrawer,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';
import { ProfileJobsEditor } from '@/components/profile/profile-jobs-editor';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  JOBS_CHANGED_EVENT,
  fetchOpenJobs,
} from '@/lib/profile-jobs';
import { SHEET_Z } from '@/lib/sheet-z';

const PROFILE_INDUSTRY_CHOICES: ChoiceOption<string>[] =
  profileIndustryChoiceOptions();

export function ProfileOrgMetaEditor({
  accountId,
  industry,
  onIndustryChange,
  location,
  onLocationChange,
  disabled = false,
}: {
  accountId: string;
  industry: string;
  onIndustryChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  disabled?: boolean;
}) {
  const locationFormId = useId();
  const industryFormId = useId();
  const industryInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();

  const [industryOpen, setIndustryOpen] = useState(false);
  const [industryWriteOpen, setIndustryWriteOpen] = useState(false);
  const [industryDraft, setIndustryDraft] = useState(industry);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState(location);
  const [hiringOpen, setHiringOpen] = useState(false);
  const [jobCount, setJobCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchOpenJobs(accountId).then((jobs) => {
      if (!cancelled) setJobCount(jobs.length);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchOpenJobs(accountId).then((jobs) => setJobCount(jobs.length));
    };
    window.addEventListener(JOBS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, onChange);
  }, [accountId]);

  useEffect(() => {
    if (!industryWriteOpen) return;
    window.setTimeout(() => industryInputRef.current?.focus(), 0);
  }, [industryWriteOpen]);

  const industryLabel = profileOrgLineLabel(industry);
  const locationLabel = location.trim() || 'Location';
  const hiringLabel = hiringLineLabel(jobCount);

  const handleIndustryChoice = (next: string) => {
    if (isProfileIndustryWriteIn(next)) {
      setIndustryDraft(
        matchProfileIndustryOption(industry) ? '' : industry
      );
      setIndustryWriteOpen(true);
      return;
    }
    onIndustryChange(next);
  };

  const commitIndustryWriteIn = () => {
    const trimmed = industryDraft.trim().replace(/\s+/g, ' ');
    onIndustryChange(trimmed);
    setIndustryWriteOpen(false);
  };

  const openLocation = () => {
    setLocationDraft(location);
    setLocationOpen(true);
    window.setTimeout(() => locationInputRef.current?.focus(), 0);
  };

  const commitLocation = () => {
    onLocationChange(locationDraft.trim().replace(/\s+/g, ' '));
    setLocationOpen(false);
  };

  return (
    <>
      <div
        className="portfolio-location portfolio-org-meta account-editor-org-meta"
        data-profile-kind-line="org"
      >
        <button
          type="button"
          className="portfolio-org-meta-part account-editor-org-meta-part"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={industryOpen || industryWriteOpen}
          aria-label={`Industry, ${industryLabel}`}
          onClick={() => setIndustryOpen(true)}
        >
          <PortfolioOrgKindMark />
          <span
            className={
              industry.trim() ? undefined : 'account-editor-org-meta-placeholder'
            }
          >
            {industryLabel}
          </span>
        </button>
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
        <button
          type="button"
          className="portfolio-org-meta-part account-editor-org-meta-part"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={locationOpen}
          aria-label={`Location, ${locationLabel}`}
          onClick={openLocation}
        >
          <PortfolioLocationMark />
          <span
            className={
              location.trim()
                ? undefined
                : 'account-editor-org-meta-placeholder'
            }
          >
            {locationLabel}
          </span>
        </button>
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
        <button
          type="button"
          className="portfolio-org-meta-hiring"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={hiringOpen}
          aria-label={
            jobCount > 0 ? hiringLineAriaLabel(jobCount) : 'Manage hiring'
          }
          onClick={() => setHiringOpen(true)}
        >
          {hiringLabel}
        </button>
      </div>

      <ChoiceDrawer
        open={industryOpen}
        onClose={() => setIndustryOpen(false)}
        label="Industry"
        copy="Optional. Skip to stay Organization."
        value={profileIndustryDrawerValue(industry)}
        options={PROFILE_INDUSTRY_CHOICES}
        onChange={handleIndustryChoice}
        zIndex={SHEET_Z.confirm}
      />

      <OsHugSheet
        open={industryWriteOpen}
        onClose={() => setIndustryWriteOpen(false)}
        label="Industry"
        closeAriaLabel="Close industry"
        backdropLabel="Close industry"
        zIndex={SHEET_Z.confirm}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={industryDraft.trim().length > 0}
                disabled={disabled || industryDraft.trim().length === 0}
                onClick={commitIndustryWriteIn}
              >
                Done
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="account-editor-org-meta-field">
          <label className="guild-field" htmlFor={`${industryFormId}-input`}>
            <span>Industry</span>
            <input
              ref={industryInputRef}
              id={`${industryFormId}-input`}
              className={osFieldBorderedClassName}
              value={industryDraft}
              maxLength={PROFILE_INDUSTRY_MAX}
              autoComplete="organization-title"
              placeholder="Industry"
              disabled={disabled}
              onFocus={scrollFieldIntoView}
              onChange={(event) =>
                setIndustryDraft(
                  sanitizeProfileIndustryDraft(event.target.value)
                )
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (industryDraft.trim()) commitIndustryWriteIn();
              }}
            />
          </label>
        </div>
      </OsHugSheet>

      <OsHugSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
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
                onClick={commitLocation}
              >
                Done
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="account-editor-org-meta-field">
          <label className="guild-field" htmlFor={`${locationFormId}-input`}>
            <span>Based in</span>
            <input
              ref={locationInputRef}
              id={`${locationFormId}-input`}
              className={osFieldBorderedClassName}
              value={locationDraft}
              maxLength={PROFILE_LOCATION_MAX}
              autoComplete="address-level2"
              placeholder="Based in"
              disabled={disabled}
              onFocus={scrollFieldIntoView}
              onChange={(event) =>
                setLocationDraft(
                  sanitizeProfileLocationDraft(event.target.value)
                )
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                commitLocation();
              }}
            />
          </label>
        </div>
      </OsHugSheet>

      <ProfileJobsEditor
        accountId={accountId}
        disabled={disabled}
        sheetOnly
        open={hiringOpen}
        onOpenChange={setHiringOpen}
      />
    </>
  );
}
