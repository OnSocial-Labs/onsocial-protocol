'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  discoverIndustryChoiceOptions,
  type DiscoverFaceFilter,
} from '@onsocial/sdk';
import { ChoiceDrawer, type ChoiceOption } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  buildDiscoverCraftChoiceOptions,
  type DiscoverCraftCount,
} from '@/lib/profile-craft-suggestions';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';
import { SHEET_Z } from '@/lib/sheet-z';

const FACE_ITEMS: Array<{
  id: DiscoverFaceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'orgs', label: 'Orgs' },
  { id: 'daos', label: 'DAOs' },
  { id: 'hiring', label: 'Hiring' },
];

const INDUSTRY_CHOICES: ChoiceOption<string>[] =
  discoverIndustryChoiceOptions();

export function DiscoverFaceFilterRail() {
  const { face, setFace, industry, setIndustry, craft, setCraft } =
    useDiscoverPanel();
  const [industryOpen, setIndustryOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  const [popularCrafts, setPopularCrafts] = useState<DiscoverCraftCount[]>([]);
  const showIndustry = face !== 'people';
  const showCraft = face === 'people';
  const craftLabel = craft ? profileIdentityTopicLabel(craft) : '';
  const craftChoices = useMemo(() => {
    const base = buildDiscoverCraftChoiceOptions(popularCrafts);
    if (!craft || base.some((option) => option.value === craft)) return base;
    // Deep-linked / rare custom still selected even before it hits Popular.
    return [
      ...base,
      {
        value: craft,
        label: profileIdentityTopicLabel(craft),
        section: 'Popular',
      },
    ];
  }, [craft, popularCrafts]);

  useEffect(() => {
    if (!showCraft) return;
    let cancelled = false;
    void fetch('/api/discover/crafts')
      .then(async (response) => {
        if (!response.ok) return { crafts: [] as DiscoverCraftCount[] };
        return (await response.json()) as { crafts?: DiscoverCraftCount[] };
      })
      .then((body) => {
        if (cancelled) return;
        setPopularCrafts(
          Array.isArray(body.crafts)
            ? body.crafts.filter(
                (row) =>
                  typeof row?.tag === 'string' &&
                  Number.isFinite(row.profileCount)
              )
            : []
        );
      })
      .catch(() => {
        if (!cancelled) setPopularCrafts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCraft]);

  return (
    <>
      <div className="discover-face-filter-rail">
        <OsChipRail
          variant="browse"
          ariaLabel="Filter profiles"
          items={FACE_ITEMS}
          value={face}
          onValueChange={setFace}
        />
        {showCraft ? (
          <div
            className="discover-tab-bar discover-tab-bar--browse"
            role="group"
            aria-label="Craft"
          >
            <div className="discover-tab-bar-scroller">
              <button
                type="button"
                className={craft ? 'is-active' : undefined}
                aria-pressed={Boolean(craft)}
                aria-haspopup="dialog"
                aria-expanded={craftOpen}
                onClick={() => setCraftOpen(true)}
              >
                {craftLabel || 'Craft'}
              </button>
            </div>
          </div>
        ) : null}
        {showIndustry ? (
          <div
            className="discover-tab-bar discover-tab-bar--browse"
            role="group"
            aria-label="Industry"
          >
            <div className="discover-tab-bar-scroller">
              <button
                type="button"
                className={industry ? 'is-active' : undefined}
                aria-pressed={Boolean(industry)}
                aria-haspopup="dialog"
                aria-expanded={industryOpen}
                onClick={() => setIndustryOpen(true)}
              >
                {industry || 'Industry'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {showCraft ? (
        <ChoiceDrawer
          open={craftOpen}
          onClose={() => setCraftOpen(false)}
          label="Craft"
          value={craft}
          options={craftChoices}
          onChange={setCraft}
          zIndex={SHEET_Z.confirm}
        />
      ) : null}
      {showIndustry ? (
        <ChoiceDrawer
          open={industryOpen}
          onClose={() => setIndustryOpen(false)}
          label="Industry"
          value={industry}
          options={INDUSTRY_CHOICES}
          onChange={setIndustry}
          zIndex={SHEET_Z.confirm}
        />
      ) : null}
    </>
  );
}
