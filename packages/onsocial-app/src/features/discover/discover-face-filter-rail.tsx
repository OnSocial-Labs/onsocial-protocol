'use client';

import { useMemo, useState } from 'react';
import {
  discoverIndustryChoiceOptions,
  type DiscoverFaceFilter,
} from '@onsocial/sdk';
import { ChoiceDrawer, type ChoiceOption } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { SHEET_Z } from '@/lib/sheet-z';

const FACE_ITEMS: Array<{ id: DiscoverFaceFilter | 'industry'; label: string }> =
  [
    { id: 'all', label: 'All' },
    { id: 'people', label: 'People' },
    { id: 'orgs', label: 'Orgs' },
    { id: 'hiring', label: 'Hiring' },
  ];

const INDUSTRY_CHOICES: ChoiceOption<string>[] = discoverIndustryChoiceOptions();

export function DiscoverFaceFilterRail() {
  const { face, setFace, industry, setIndustry } = useDiscoverPanel();
  const [industryOpen, setIndustryOpen] = useState(false);
  const showIndustry = face !== 'people';

  const items = useMemo(() => {
    const next = [...FACE_ITEMS];
    if (showIndustry) {
      next.push({ id: 'industry', label: industry || 'Industry' });
    }
    return next;
  }, [industry, showIndustry]);

  return (
    <>
      <OsChipRail
        variant="browse"
        ariaLabel="Filter profiles"
        items={items}
        value={face}
        onValueChange={(next) => {
          if (next === 'industry') {
            setIndustryOpen(true);
            return;
          }
          setFace(next);
        }}
      />
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
