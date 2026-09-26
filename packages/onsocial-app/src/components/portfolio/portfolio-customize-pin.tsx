'use client';

import { useMemo, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { nearExplorerTxHref } from '@/lib/app-config';
import { SHEET_Z } from '@/lib/sheet-z';

const FIND_AFTER = 6;

export type CustomizePinChoice = {
  id: string;
  title: string;
  source: 'released' | 'collected';
  byline: string | null;
  /** Extra find text, usually the creator account. */
  search?: string | null;
  mediaUrl?: string | null;
  /** Album tracks. Present only when there is more than one. */
  tracks?: readonly { title: string }[];
};

/**
 * One current pin on Customize, then a sheet to highlight a choice and Save once.
 * Clear is the empty row in that sheet, confirmed with the same Save.
 */
export function PortfolioCustomizePin({
  label,
  sheetTitle,
  noneLabel,
  findLabel,
  pinnedId,
  pinnedStart = null,
  savedMessage,
  choices,
  ready,
  disabled,
  note,
  onSave,
}: {
  label: string;
  sheetTitle: string;
  noneLabel: string;
  findLabel: string;
  pinnedId: string | null;
  /** Opening track, counting from 0. Null starts at the first track. */
  pinnedStart?: number | null;
  savedMessage: string;
  choices: readonly CustomizePinChoice[];
  ready: boolean;
  disabled: boolean;
  note?: string | null;
  onSave: (id: string | null, start?: number | null) => Promise<string | null>;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(pinnedId);
  const [draftStart, setDraftStart] = useState(pinnedStart ?? 0);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const current = choices.find((entry) => entry.id === pinnedId) ?? null;
  const draft = choices.find((entry) => entry.id === draftId) ?? null;
  const trackCount = draft?.tracks?.length ?? 0;
  const savedStart = pinnedStart ?? 0;
  const start =
    trackCount > 1
      ? Math.min(Math.max(draftStart, 0), trackCount - 1)
      : draftId === pinnedId && !draft
        ? savedStart
        : 0;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...choices];
    return choices.filter((entry) => {
      if (draftId && entry.id === draftId) return true;
      if (entry.title.toLowerCase().includes(needle)) return true;
      return entry.search?.toLowerCase().includes(needle) ?? false;
    });
  }, [choices, draftId, query]);
  const released = visible.filter((entry) => entry.source === 'released');
  const collected = visible.filter((entry) => entry.source === 'collected');
  const showGroups =
    choices.some((entry) => entry.source === 'released') &&
    choices.some((entry) => entry.source === 'collected');
  const dirty =
    draftId !== pinnedId || (draftId !== null && start !== savedStart);

  if (!ready || (choices.length === 0 && !pinnedId)) return null;

  function openSheet() {
    setDraftId(pinnedId);
    setDraftStart(pinnedStart ?? 0);
    setQuery('');
    setOpen(true);
  }

  function pickAlbum(id: string) {
    if (id !== draftId) setDraftStart(0);
    setDraftId(id);
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const hash = await onSave(draftId, draftId && start > 0 ? start : null);
      if (hash === null) return;
      setTxResult({
        type: 'success',
        msg: savedMessage,
        explorerHref: nearExplorerTxHref(hash),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Divider variant="section" className="customize-sheet-divider" />
      <div className="customize-sheet-section">
        <p className="customize-sheet-label">{label}</p>
        <button
          type="button"
          className="market-listing-row customize-pin-row customize-pin-summary"
          disabled={disabled}
          onClick={openSheet}
        >
          {current ? <PinCover mediaUrl={current.mediaUrl} /> : null}
          <span className="market-listing-copy">
            <span
              className={
                current ? 'market-listing-title' : 'customize-pin-none-label'
              }
            >
              {current?.title ?? (pinnedId ? 'Saved' : noneLabel)}
            </span>
            {current?.byline ? (
              <span className="customize-song-by">{current.byline}</span>
            ) : null}
            {current && pinnedStart && current.tracks?.[pinnedStart] ? (
              <span className="customize-song-by">
                Starts with {current.tracks[pinnedStart].title}
              </span>
            ) : null}
          </span>
          <span className="os-surface-row-badge">Change</span>
        </button>
      </div>
      <OsHugSheet
        open={open}
        onClose={() => {
          if (saving) return;
          setOpen(false);
        }}
        label={sheetTitle}
        zIndex={SHEET_Z.nested}
        panelClassName="os-hug-sheet--with-footer os-sheet-cap-standard"
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={dirty && !saving}
                disabled={!dirty || saving || disabled}
                pending={saving}
                pendingLabel="Saving…"
                onClick={() => void handleSave()}
              >
                Save
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="customize-pin-sheet">
          {note ? <p className="customize-sheet-error">{note}</p> : null}
          {choices.length > FIND_AFTER ? (
            <input
              className="customize-song-find"
              type="search"
              value={query}
              placeholder="Find"
              aria-label={findLabel}
              disabled={disabled || saving}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <div className="customize-song-list">
            <button
              type="button"
              className={`customize-pin-none${draftId === null ? ' is-selected' : ''}`}
              disabled={disabled || saving}
              aria-pressed={draftId === null}
              onClick={() => {
                setDraftId(null);
                setDraftStart(0);
              }}
            >
              <span className="customize-pin-none-label">{noneLabel}</span>
            </button>
            {visible.length > 0 ? (
              <>
                <PinGroup
                  label="Released"
                  showLabel={showGroups && released.length > 0}
                  entries={released}
                  draftId={draftId}
                  draftStart={start}
                  disabled={disabled || saving}
                  onPick={pickAlbum}
                  onStart={setDraftStart}
                />
                <PinGroup
                  label="Collected"
                  showLabel={showGroups && collected.length > 0}
                  entries={collected}
                  draftId={draftId}
                  draftStart={start}
                  disabled={disabled || saving}
                  onPick={pickAlbum}
                  onStart={setDraftStart}
                />
              </>
            ) : (
              <p className="customize-song-empty">Nothing matches.</p>
            )}
          </div>
        </div>
      </OsHugSheet>
    </>
  );
}

function PinCover({ mediaUrl }: { mediaUrl?: string | null }) {
  return (
    <span className="market-listing-thumb" aria-hidden>
      {mediaUrl ? (
        <img src={mediaUrl} alt="" />
      ) : (
        <span className="market-listing-thumb-fallback" />
      )}
    </span>
  );
}

function PinGroup({
  label,
  showLabel,
  entries,
  draftId,
  draftStart,
  disabled,
  onPick,
  onStart,
}: {
  label: string;
  showLabel: boolean;
  entries: readonly CustomizePinChoice[];
  draftId: string | null;
  draftStart: number;
  disabled: boolean;
  onPick: (id: string) => void;
  onStart: (index: number) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <>
      {showLabel ? <p className="customize-song-group">{label}</p> : null}
      {entries.map((entry) => {
        const selected = entry.id === draftId;
        const tracks =
          selected && entry.tracks && entry.tracks.length > 1
            ? entry.tracks
            : null;
        return (
          <div className="customize-pin-album" key={entry.id}>
            <button
              type="button"
              className={`market-listing-row customize-pin-row${selected ? ' is-selected' : ''}`}
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onPick(entry.id)}
            >
              <PinCover mediaUrl={entry.mediaUrl} />
              <span className="market-listing-copy">
                <span className="market-listing-title">{entry.title}</span>
                {entry.byline ? (
                  <span className="customize-song-by">{entry.byline}</span>
                ) : null}
              </span>
            </button>
            {tracks ? (
              <div className="customize-pin-tracks">
                {tracks.map((track, index) => {
                  const trackSelected = index === draftStart;
                  return (
                    <button
                      key={`${entry.id}-${index}`}
                      type="button"
                      className={`customize-pin-track${trackSelected ? ' is-selected' : ''}`}
                      disabled={disabled}
                      aria-pressed={trackSelected}
                      onClick={() => onStart(index)}
                    >
                      <span className="customize-pin-track-index">
                        {index + 1}
                      </span>
                      <span className="customize-pin-track-title">
                        {track.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
