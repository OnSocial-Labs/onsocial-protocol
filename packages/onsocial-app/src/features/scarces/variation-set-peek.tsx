'use client';

import { useEffect, useState } from 'react';
import { variationSampleSeats } from '@/features/scarces/collections-data';
import { formatGenerativeRarityLines } from '@/features/scarces/generative-set';
import {
  fetchGenerativeRarity,
  fetchVariationTraitLabels,
} from '@/features/scarces/variation-set-traits';

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
  const rarityKey = `${collectionId}\0${referenceTemplate ?? ''}\0${totalSupply}`;
  const [rarity, setRarity] = useState<{
    key: string;
    lines: string[];
    resolved: boolean;
  }>({ key: '', lines: [], resolved: false });
  const [labels, setLabels] = useState<{ key: string; items: string[] }>({
    key: '',
    items: [],
  });

  const canFetch = Boolean(referenceTemplate) && totalSupply >= 1;
  const rarityLines = rarity.key === rarityKey ? rarity.lines : [];
  const rarityResolved = rarity.key === rarityKey && rarity.resolved;
  const traitLabels = labels.key === rarityKey ? labels.items : [];

  useEffect(() => {
    if (!referenceTemplate || totalSupply < 1) return;
    const key = rarityKey;
    let cancelled = false;
    void fetchGenerativeRarity({
      referenceTemplate,
      collectionId,
    })
      .then((found) => {
        if (cancelled) return;
        setRarity({
          key,
          lines: found ? formatGenerativeRarityLines(found) : [],
          resolved: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRarity({ key, lines: [], resolved: true });
      });
    return () => {
      cancelled = true;
    };
  }, [rarityKey, referenceTemplate, collectionId, totalSupply]);

  useEffect(() => {
    if (
      !referenceTemplate ||
      totalSupply < 1 ||
      !rarityResolved ||
      rarityLines.length > 0
    ) {
      return;
    }
    const key = rarityKey;
    let cancelled = false;
    const seats = variationSampleSeats(totalSupply, 1, 6);
    void fetchVariationTraitLabels({
      referenceTemplate,
      collectionId,
      seats,
    }).then((items) => {
      if (!cancelled) setLabels({ key, items });
    });
    return () => {
      cancelled = true;
    };
  }, [
    rarityKey,
    collectionId,
    referenceTemplate,
    totalSupply,
    rarityResolved,
    rarityLines.length,
  ]);

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
      {rarityLines.length > 0 ? (
        <ul className="collection-set-peek-rarity">
          {rarityLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : canFetch && traitLabels.length > 0 ? (
        <p className="collection-set-peek-traits">{traitLabels.join(' · ')}</p>
      ) : null}
    </section>
  );
}
