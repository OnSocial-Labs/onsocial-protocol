'use client';

import { useEffect, useState } from 'react';
import { variationSampleSeats } from '@/features/scarces/collections-data';
import { fetchVariationTraitLabels } from '@/features/scarces/variation-set-peek';

export function VariationSetPeek({
  collectionId,
  totalSupply,
  samples,
  randomAssignment,
  referenceTemplate,
}: {
  collectionId: string;
  totalSupply: number;
  samples: string[];
  randomAssignment: boolean;
  referenceTemplate?: string | null;
}) {
  const [traitLabels, setTraitLabels] = useState<string[]>([]);
  const canFetchTraits = Boolean(referenceTemplate) && totalSupply >= 1;

  useEffect(() => {
    if (!referenceTemplate || totalSupply < 1) return;
    let cancelled = false;
    const seats = variationSampleSeats(totalSupply, 1, 6);
    void fetchVariationTraitLabels({
      referenceTemplate,
      collectionId,
      seats,
    }).then((labels) => {
      if (!cancelled) setTraitLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, referenceTemplate, totalSupply]);

  const shownTraitLabels = canFetchTraits ? traitLabels : [];

  if (samples.length === 0 && totalSupply < 2) return null;

  const countLabel = totalSupply.toLocaleString();
  const lead = randomAssignment
    ? `You’ll get one random piece from this sealed set of ${countLabel}.`
    : `${countLabel} unique pieces — minted in order.`;

  return (
    <section className="collection-set-peek" aria-label="The set">
      {samples.length > 0 ? (
        <div className="gen-preview-grid" aria-label="Sample pieces">
          {samples.map((src, index) => (
            <img key={`${src}-${index}`} src={src} alt="" />
          ))}
        </div>
      ) : null}
      <p className="collection-set-peek-lead">{lead}</p>
      {shownTraitLabels.length > 0 ? (
        <p className="collection-set-peek-traits">
          {shownTraitLabels.join(' · ')}
        </p>
      ) : null}
    </section>
  );
}
