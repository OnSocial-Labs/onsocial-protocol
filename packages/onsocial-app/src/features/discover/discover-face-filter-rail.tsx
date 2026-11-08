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
import { SHEET_Z } from '@/lib/sheet-z';
import { useTranslations } from 'next-intl';
import { useDiscoverFaceLabel } from '@/features/discover/use-discover-leads';
import {
  useCraftLabel,
  useIndustryLabel,
  useTaxonomyChoices,
} from '@/lib/use-profile-taxonomy';

const FACE_ITEMS: Array<{
  id: DiscoverFaceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'orgs', label: 'Orgs' },
  { id: 'daos', label: 'DAOs' },
  { id: 'offers', label: 'Offers' },
  { id: 'hiring', label: 'Hiring' },
];

const INDUSTRY_CHOICES: ChoiceOption<string>[] =
  discoverIndustryChoiceOptions();

export function DiscoverFaceFilterRail() {
  const { face, setFace, industry, setIndustry, craft, setCraft } =
    useDiscoverPanel();
  const t = useTranslations('shell');
  const industryName = useIndustryLabel();
  const craftName = useCraftLabel();
  const industryChoices = useTaxonomyChoices(INDUSTRY_CHOICES);
  const faceLabel = useDiscoverFaceLabel();
  const faceItems = FACE_ITEMS.map((item) => ({
    id: item.id,
    label: faceLabel(item.id),
  }));
  const [industryOpen, setIndustryOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  const [popularCrafts, setPopularCrafts] = useState<DiscoverCraftCount[]>([]);
  const showIndustry = face !== 'people' && face !== 'offers';
  const showCraft = face === 'people';
  const craftLabel = craft ? craftName(craft) : '';
  const craftChoices = useTaxonomyChoices(
    useMemo(() => {
      const base = buildDiscoverCraftChoiceOptions(popularCrafts);
      if (!craft || base.some((option) => option.value === craft)) return base;
      // Deep-linked / rare custom still selected even before it hits Popular.
      return [
        ...base,
        {
          value: craft,
          label: craftName(craft),
          section: 'Popular',
        },
      ];
    }, [craft, craftName, popularCrafts])
  );

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
          ariaLabel={t('discover.filterProfiles')}
          items={faceItems}
          value={face}
          onValueChange={setFace}
        />
        {showCraft ? (
          <div
            className="discover-tab-bar discover-tab-bar--browse"
            role="group"
            aria-label={t('discover.craft')}
          >
            <div className="discover-tab-bar-scroller os-scrollbar-none">
              <button
                type="button"
                className={craft ? 'is-active' : undefined}
                aria-pressed={Boolean(craft)}
                aria-haspopup="dialog"
                aria-expanded={craftOpen}
                onClick={() => setCraftOpen(true)}
              >
                {craftLabel || t('discover.craft')}
              </button>
            </div>
          </div>
        ) : null}
        {showIndustry ? (
          <div
            className="discover-tab-bar discover-tab-bar--browse"
            role="group"
            aria-label={t('discover.industry')}
          >
            <div className="discover-tab-bar-scroller os-scrollbar-none">
              <button
                type="button"
                className={industry ? 'is-active' : undefined}
                aria-pressed={Boolean(industry)}
                aria-haspopup="dialog"
                aria-expanded={industryOpen}
                onClick={() => setIndustryOpen(true)}
              >
                {industry ? industryName(industry) : t('discover.industry')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {showCraft ? (
        <ChoiceDrawer
          open={craftOpen}
          onClose={() => setCraftOpen(false)}
          label={t('discover.craft')}
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
          label={t('discover.industry')}
          value={industry}
          options={industryChoices}
          onChange={setIndustry}
          zIndex={SHEET_Z.confirm}
        />
      ) : null}
    </>
  );
}
