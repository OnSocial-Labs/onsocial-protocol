'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChoiceDrawer,
  type ChoiceOption,
} from '@/components/ui/choice-drawer';
import type { ComposerDropDraft } from '@/features/guilds/guild-composer-sheet';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  resolveScarceMediaUrl,
  fetchOwnedScarcesPage,
} from '@/features/market/market-listings';

type PickerDrop = ComposerDropDraft & {
  description?: string;
  /** Stable choice value — tokenId for listed seats, else collectionId. */
  pickerKey: string;
};

function DropThumb({ mediaUrl, title }: { mediaUrl?: string; title: string }) {
  if (mediaUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="guild-composer-drop-picker-thumb"
        src={mediaUrl}
        alt=""
      />
    );
  }
  return (
    <span
      className="guild-composer-drop-picker-thumb is-fallback"
      aria-hidden
      title={title}
    />
  );
}

/**
 * Drops you can announce on a post: live primary mint, or editions you’ve
 * listed for sale / auction (including post-minted `s:` tokens).
 */
async function loadAttachableDrops(accountId: string): Promise<PickerDrop[]> {
  const byKey = new Map<string, PickerDrop>();
  const client = createReadOnlyOnSocialClient();

  try {
    const rows = await client.query.scarces.collectionsCurrent({
      creatorId: accountId,
      mintingOnly: true,
      orderBy: 'new',
      limit: 40,
    });
    for (const row of rows) {
      if (row.banned || row.cancelled) continue;
      const collectionId = row.collectionId?.trim();
      if (!collectionId) continue;
      const mediaUrl = row.media?.trim()
        ? resolveScarceMediaUrl(row.media)
        : null;
      const remaining =
        typeof row.remaining === 'number' ? row.remaining : null;
      byKey.set(collectionId, {
        pickerKey: collectionId,
        collectionId,
        title: row.title?.trim() || collectionId,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(row.mediumKind?.trim()
          ? { mediumKind: row.mediumKind.trim() }
          : row.kind?.trim()
            ? { mediumKind: row.kind.trim() }
            : {}),
        description:
          remaining != null ? `${remaining} left · Minting` : 'Minting',
      });
    }
  } catch {
    // Fall through to listed inventory.
  }

  try {
    const page = await fetchOwnedScarcesPage(accountId, { pageSize: 40 });
    for (const item of page.items) {
      if (item.listingKind == null) continue;
      const tokenId = item.tokenId?.trim();
      if (!tokenId) continue;
      const collectionId = item.collectionId?.trim() || '';
      // Listed seats key by token so Drop + post-minted resales both appear.
      byKey.set(tokenId, {
        pickerKey: tokenId,
        ...(collectionId ? { collectionId } : {}),
        tokenId,
        title: item.title?.trim() || collectionId || tokenId,
        ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
        ...(item.mediumKind ? { mediumKind: item.mediumKind } : {}),
        ...(item.sourcePostPath
          ? { sourcePostPath: item.sourcePostPath }
          : {}),
        description:
          item.listingKind === 'auction' ? 'Resale · Auction' : 'Resale',
      });
    }
  } catch {
    // Listed inventory optional.
  }

  return [...byKey.values()];
}

/**
 * Nested drawer of attachable Drops — live mint + your listed editions.
 * Prefetches while the composer is open so the drawer opens with rows ready.
 */
export function ComposerDropPicker({
  open,
  enabled,
  onClose,
  accountId,
  selectedDropKey,
  onSelect,
  zIndex,
}: {
  open: boolean;
  enabled: boolean;
  onClose: () => void;
  accountId: string | null | undefined;
  /** Selected collectionId or tokenId. */
  selectedDropKey?: string | null;
  onSelect: (drop: ComposerDropDraft) => void;
  zIndex: number;
}) {
  const [result, setResult] = useState<{
    accountId: string;
    drops: PickerDrop[];
  } | null>(null);
  const [errorFor, setErrorFor] = useState<{
    accountId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !accountId) return;
    let cancelled = false;
    void loadAttachableDrops(accountId)
      .then((drops) => {
        if (cancelled) return;
        setResult({ accountId, drops });
        setErrorFor(null);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorFor({
          accountId,
          message: 'Could not load your Drops.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, accountId]);

  const ready = Boolean(accountId && result?.accountId === accountId);
  const errored = Boolean(accountId && errorFor?.accountId === accountId);
  const drops = ready ? result!.drops : [];
  const loading = Boolean(open && accountId) && !ready && !errored;

  const byKey = useMemo(() => {
    const map = new Map<string, PickerDrop>();
    for (const drop of drops) map.set(drop.pickerKey, drop);
    return map;
  }, [drops]);

  const options = useMemo((): ChoiceOption<string>[] => {
    if (!open) return [];
    if (!accountId) {
      return [
        {
          value: '__signin__',
          label: 'Sign in to attach a Drop',
          disabled: true,
        },
      ];
    }
    if (loading) {
      return [
        {
          value: '__loading__',
          label: 'Loading…',
          disabled: true,
        },
      ];
    }
    if (errored) {
      return [
        {
          value: '__error__',
          label: errorFor!.message,
          disabled: true,
        },
      ];
    }
    if (drops.length === 0) {
      return [
        {
          value: '__empty__',
          label: 'Nothing to post yet',
          description:
            'List a Drop for sale or open a mint — then it shows up here.',
          disabled: true,
        },
      ];
    }
    return drops.map((drop) => ({
      value: drop.pickerKey,
      label: drop.title,
      ...(drop.description ? { description: drop.description } : {}),
      leading: (
        <DropThumb mediaUrl={drop.mediaUrl ?? undefined} title={drop.title} />
      ),
    }));
  }, [open, accountId, loading, errored, errorFor, drops]);

  return (
    <ChoiceDrawer
      open={open}
      onClose={onClose}
      label="Post a Drop"
      copy="Live & listed"
      value={selectedDropKey?.trim() || ''}
      options={options}
      onChange={(id) => {
        if (id.startsWith('__')) return;
        const drop = byKey.get(id);
        if (!drop) return;
        const { description: _description, pickerKey: _key, ...draft } = drop;
        onSelect(draft);
      }}
      zIndex={zIndex}
    />
  );
}
