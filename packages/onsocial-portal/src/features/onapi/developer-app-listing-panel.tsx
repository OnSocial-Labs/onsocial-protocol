'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { CommunityTilePreview } from '@/features/onapi/community-tile-preview';
import {
  listingDraftError,
  listingDraftsEqual,
  listingFromApp,
  type ListingDraft,
} from '@/features/onapi/listing';
import type { DeveloperAppInfo } from '@/features/onapi/api';

const fieldClassName =
  'portal-field-focus w-full rounded-2xl border border-border/40 bg-background/45 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50';

export function DeveloperAppListingPanel({
  app,
  saving,
  onSave,
  onCancel,
}: {
  app: DeveloperAppInfo;
  saving: boolean;
  onSave: (draft: ListingDraft) => void;
  onCancel: () => void;
}) {
  const initial = useMemo(() => listingFromApp(app), [app]);
  const [draft, setDraft] = useState<ListingDraft>(initial);
  const error = listingDraftError(draft);
  const unchanged = listingDraftsEqual(draft, initial);
  const canSave = !saving && !unchanged && !error;

  return (
    <div className="space-y-4 px-4 pb-4 md:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CommunityTilePreview name={draft.name} iconUrl={draft.iconUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block space-y-1">
            <span className="portal-type-caption text-muted-foreground">
              Board name
            </span>
            <input
              type="text"
              value={draft.name}
              maxLength={32}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Tracker"
              className={fieldClassName}
            />
          </label>
          <label className="block space-y-1">
            <span className="portal-type-caption text-muted-foreground">
              Website
            </span>
            <input
              type="url"
              value={draft.href}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, href: event.target.value }))
              }
              placeholder="https://your-dapp.example"
              className={fieldClassName}
            />
          </label>
          <label className="block space-y-1">
            <span className="portal-type-caption text-muted-foreground">
              Icon URL
            </span>
            <input
              type="url"
              value={draft.iconUrl}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, iconUrl: event.target.value }))
              }
              placeholder="https://your-dapp.example/icon.png"
              className={fieldClassName}
            />
          </label>
          <SurfacePanel
            radius="md"
            tone="inset"
            borderTone="subtle"
            padding="none"
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                List on Community
              </p>
              <p className="portal-type-caption text-muted-foreground">
                Public launcher page two. Your site stays on its own URL.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.listed}
              onClick={() =>
                setDraft((prev) => ({ ...prev, listed: !prev.listed }))
              }
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                draft.listed ? 'bg-[var(--portal-blue)]' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
                  draft.listed ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </SurfacePanel>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="portal-type-caption text-muted-foreground">
          Live preview of the Community tile. https only.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          onClick={() => onSave(draft)}
          loading={saving}
          disabled={!canSave}
        >
          Save listing
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
