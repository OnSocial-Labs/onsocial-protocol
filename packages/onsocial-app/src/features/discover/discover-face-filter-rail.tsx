'use client';

import { useState } from 'react';
import {
  discoverIndustryChoiceOptions,
  type DiscoverFaceFilter,
} from '@onsocial/sdk';
import { ChoiceDrawer, type ChoiceOption } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { SHEET_Z } from '@/lib/sheet-z';

const FACE_ITEMS: Array<{
  id: DiscoverFaceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'people', label: 'People' },
  { id: 'orgs', label: 'Orgs' },
  { id: 'hiring', label: 'Hiring' },
];

const INDUSTRY_CHOICES: ChoiceOption<string>[] =
  discoverIndustryChoiceOptions();

export function DiscoverFaceFilterRail() {
  const { face, setFace, industry, setIndustry } = useDiscoverPanel();
  const [industryOpen, setIndustryOpen] = useState(false);
  const showIndustry = face !== 'people';

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
      {showIndustry ? (
        <ChoiceDrawer
          open={industryOpen}
          onClose={() => setIndustryOpen(false)}
          label="Industry"
          copy="Optional. Same sectors as org profiles."
          value={industry}
          options={INDUSTRY_CHOICES}
          onChange={setIndustry}
          zIndex={SHEET_Z.confirm}
        />
      ) : null}
    </>
  );
}
