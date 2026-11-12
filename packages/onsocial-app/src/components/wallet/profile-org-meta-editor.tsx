'use client';

/**
 * Org meta in Edit profile — one face-matching line:
 * industry · location · Offers · Hiring. Each segment opens a drawer.
 */

import { useEffect, useId, useState } from 'react';
import {
  PROFILE_INDUSTRY_MAX,
  hiringLineAriaLabel,
  hiringLineLabel,
  offerLineAriaLabel,
  offerLineLabel,
  isProfileIndustryWriteIn,
  matchProfileIndustryOption,
  normalizeProfileIndustryInput,
  profileIndustryChoiceOptions,
  profileIndustryDrawerValue,
  sanitizeProfileIndustryDraft,
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
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';
import { ProfileLocationControl } from '@/components/wallet/profile-location-control';
import { ProfileJobsEditor } from '@/components/profile/profile-jobs-editor';
import { ProfileOffersEditor } from '@/components/profile/profile-offers-editor';
import { focusFieldStill } from '@/lib/hold-drawer-still';
import { JOBS_CHANGED_EVENT, fetchOpenJobs } from '@/lib/profile-jobs';
import { OFFERS_CHANGED_EVENT, fetchAccountOffers } from '@/lib/profile-offers';
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
  showHiring = true,
  emptyIndustryLabel = 'Organization',
  industryHint = 'Optional. Skip to stay Organization.',
}: {
  accountId: string;
  industry: string;
  onIndustryChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  disabled?: boolean;
  showHiring?: boolean;
  emptyIndustryLabel?: string;
  industryHint?: string;
}) {
  const industryFormId = useId();

  const [industryOpen, setIndustryOpen] = useState(false);
  const [industryWriteOpen, setIndustryWriteOpen] = useState(false);
  const [industryDraft, setIndustryDraft] = useState(industry);
  const [hiringOpen, setHiringOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [jobCount, setJobCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);

  useEffect(() => {
    if (!showHiring) return;
    let cancelled = false;
    void fetchOpenJobs(accountId).then((jobs) => {
      if (!cancelled) setJobCount(jobs.length);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, showHiring]);

  useEffect(() => {
    if (!showHiring) return;
    let cancelled = false;
    void fetchAccountOffers(accountId).then((offers) => {
      if (!cancelled) setOfferCount(offers.length);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, showHiring]);

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
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchAccountOffers(accountId).then((offers) => {
        setOfferCount(offers.length);
      });
    };
    window.addEventListener(OFFERS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OFFERS_CHANGED_EVENT, onChange);
  }, [accountId]);

  const industryLabel = industry.trim() || emptyIndustryLabel;
  const hiringLabel = hiringLineLabel(jobCount);
  const offerLabel = offerLineLabel(offerCount);

  const handleIndustryChoice = (next: string) => {
    if (isProfileIndustryWriteIn(next)) {
      setIndustryDraft(matchProfileIndustryOption(industry) ? '' : industry);
      setIndustryWriteOpen(true);
      return;
    }
    onIndustryChange(next);
  };

  const commitIndustryWriteIn = () => {
    onIndustryChange(normalizeProfileIndustryInput(industryDraft));
    setIndustryWriteOpen(false);
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
          {showHiring ? <PortfolioOrgKindMark /> : null}
          <span
            className={
              industry.trim()
                ? undefined
                : 'account-editor-org-meta-placeholder'
            }
          >
            {industryLabel}
          </span>
        </button>
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
        <ProfileLocationControl
          location={location}
          onLocationChange={onLocationChange}
          disabled={disabled}
          emptyLabel="Location"
          buttonClassName="portfolio-org-meta-part account-editor-org-meta-part"
        />
        {showHiring ? (
          <>
            <span className="portfolio-org-meta-sep" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="portfolio-org-meta-offers"
              disabled={disabled}
              aria-haspopup="dialog"
              aria-expanded={offerOpen}
              aria-label={
                offerCount > 0
                  ? offerLineAriaLabel(offerCount)
                  : 'Manage offers'
              }
              onClick={() => setOfferOpen(true)}
            >
              {offerLabel}
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
          </>
        ) : null}
      </div>

      <ChoiceDrawer
        open={industryOpen}
        onClose={() => setIndustryOpen(false)}
        label="Industry"
        copy={industryHint}
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
              id={`${industryFormId}-input`}
              className={osFieldBorderedClassName}
              value={industryDraft}
              maxLength={PROFILE_INDUSTRY_MAX}
              autoComplete="organization-title"
              placeholder="Industry"
              disabled={disabled}
              onPointerDown={focusFieldStill}
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

      {showHiring ? (
        <ProfileJobsEditor
          accountId={accountId}
          disabled={disabled}
          sheetOnly
          open={hiringOpen}
          onOpenChange={setHiringOpen}
        />
      ) : null}
      {showHiring ? (
        <ProfileOffersEditor
          accountId={accountId}
          kind="org"
          disabled={disabled}
          sheetOnly
          open={offerOpen}
          onOpenChange={setOfferOpen}
        />
      ) : null}
    </>
  );
}
