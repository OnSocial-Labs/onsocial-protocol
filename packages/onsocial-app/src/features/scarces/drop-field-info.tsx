'use client';

import { InformationCircleIcon } from '@onsocial/ui';
import { InfoDrawer } from '@onsocial/ui';

export type DropFieldInfoKey =
  | 'release'
  | 'format'
  | 'bookPdf'
  | 'artwork'
  | 'setSource'
  | 'dropId'
  | 'description'
  | 'series'
  | 'supplyPinned'
  | 'saleWindow'
  | 'eventWindow'
  | 'eventPlace'
  | 'transferable'
  | 'renewable'
  | 'accessEnds'
  | 'maxRedeems'
  | 'allowlist';

const DROP_FIELD_INFO: Record<
  DropFieldInfoKey,
  { title: string; summary: string; detail: string }
> = {
  release: {
    title: 'Release',
    summary: 'Single is one track; Album is a multi-track release under one cover.',
    detail:
      'Every edition shares the same release. Add tracks below after you pick the format.',
  },
  format: {
    title: 'Format',
    summary: 'Issue is one file; Book is ordered Markdown chapters holders read in sequence.',
    detail:
      'Issues: Markdown (.md) for the in-app reader, or a single PDF. Books: Markdown chapters only, plus an optional whole-book PDF for download. Name files 01-title.md — the file name becomes the chapter title.',
  },
  bookPdf: {
    title: 'Book PDF',
    summary: 'Optional whole-book PDF holders can download — separate from chapter reading.',
    detail:
      'Not shown in the chapter list. Use Markdown chapters for in-app reading; attach one PDF (≤20 MB) when you want a print-ready or ebook file for download.',
  },
  artwork: {
    title: 'Artwork',
    summary: 'One artwork shares the same image on every edition; a set gives each piece its own image.',
    detail:
      'For a generated set, bring transparent PNG or WebP layers that share one pixel size. Stack them in the studio, generate, then start the drop.',
  },
  setSource: {
    title: 'Set source',
    summary: 'Upload finished images, or generate a set from stacked PNG layers.',
    detail:
      'Generate layers opens the studio. Every trait image must be the same pixel size. No CID to paste — the set pins when generation finishes. Then add a title and start.',
  },
  dropId: {
    title: 'Drop ID',
    summary: 'Short unique tag for your public drop link.',
    detail: 'Filled from your title by default — edit only if you want a custom link.',
  },
  description: {
    title: 'Description',
    summary: 'Short public blurb on the drop page.',
    detail:
      'Keep it brief. Writing manuscripts and media upload in their own fields — this is the listing copy only.',
  },
  series: {
    title: 'Series',
    summary: 'Optional — group this drop with later drops under one series name.',
    detail: 'Each drop stays its own sealed listing; the series only keeps them together.',
  },
  supplyPinned: {
    title: 'Supply',
    summary: 'Must match the file count in your pinned folder.',
    detail: 'The first and last files are verified before the drop starts.',
  },
  saleWindow: {
    title: 'Sale window',
    summary: 'When collectors can mint — opens now by default, no end until sold out.',
    detail: 'Tap Opens or Closes to set a time. Clear with ✕. Allowlists need Opens set to mint early.',
  },
  eventWindow: {
    title: 'Event window',
    summary: 'When the event runs — separate from when tickets are for sale.',
    detail:
      'Event ends is required and also ends ticket access at the door. Starts is optional. Sale window is only when fans can buy.',
  },
  eventPlace: {
    title: 'Place',
    summary: 'Optional venue or event label — city, festival, or room name.',
    detail:
      'Public intentional tag (not GPS). Same style as post places — e.g. Lisbon or ETH Denver.',
  },
  transferable: {
    title: 'Transferable',
    summary: 'Whether collectors can move or resell their edition.',
    detail:
      'Yes allows transfer and resale. Soulbound keeps the edition with the buyer.',
  },
  renewable: {
    title: 'Allow date changes',
    summary: 'Whether you can push the end date later (rain day / postpone).',
    detail:
      'On by default for tickets. Choose No if the end must stay fixed after mint. For coupons and memberships, optional Access ends sets a shared expiry.',
  },
  accessEnds: {
    title: 'Access ends',
    summary: 'Optional shared end date on every edition.',
    detail:
      'Leave blank for no expiry. Tickets use Event ends instead — no second date to enter.',
  },
  maxRedeems: {
    title: 'Max redeems',
    summary: 'How many times each edition can be redeemed.',
    detail: 'Leave blank for no cap. Used for tickets, coupons, and similar redeem flows.',
  },
  allowlist: {
    title: 'Allowlist',
    summary: 'Optional early-mint list — accounts that can mint before public opens.',
    detail:
      'Needs Opens in Sale window, or clear the list. Otherwise the allowlist never gates minting.',
  },
};

export function DropFieldLabel({
  label,
  infoKey,
  onOpenInfo,
}: {
  label: string;
  infoKey: DropFieldInfoKey;
  onOpenInfo: (key: DropFieldInfoKey) => void;
}) {
  return (
    <span className="drop-field-label">
      <span className="drop-field-label-text">{label}</span>
      <button
        type="button"
        className="guild-hero-facts-button"
        aria-label={`About ${label}`}
        onClick={(event) => {
          event.preventDefault();
          onOpenInfo(infoKey);
        }}
      >
        <InformationCircleIcon
          className="guild-hero-facts-icon"
          aria-hidden
        />
      </button>
    </span>
  );
}

export function DropFieldInfoDrawer({
  infoKey,
  open,
  onClose,
}: {
  infoKey: DropFieldInfoKey | null;
  open: boolean;
  onClose: () => void;
}) {
  const content = infoKey ? DROP_FIELD_INFO[infoKey] : null;
  return (
    <InfoDrawer
      open={open && content != null}
      onClose={onClose}
      title={content?.title ?? ''}
      summary={content?.summary ?? ''}
      detail={content?.detail ?? ''}
    />
  );
}
