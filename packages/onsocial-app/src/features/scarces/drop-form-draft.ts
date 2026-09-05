/**
 * Persist non-file create-drop fields across refresh so creators don’t lose
 * title, pricing, and Advanced settings. Files stay out of storage — pin
 * drafts (`drop-pin-draft`) hold CIDs after prepare.
 */

import type { AllowlistEntry } from '@onsocial/sdk';
import type { DropTemplateId } from '@/features/scarces/drop-templates';
import type { MusicReleaseFormat } from '@/features/scarces/drop-audio';
import type { WritingReleaseFormat } from '@/features/scarces/drop-writing';
import type { RoyaltySplitShare } from '@/features/scarces/scarce-royalty';
import { DEFAULT_ROYALTY_BPS } from '@/features/scarces/scarce-royalty';
import {
  parseGenerativeRarity,
  type GenerativeRarity,
} from '@/features/scarces/generative-set';

export type DropArtMode = 'single' | 'variations';
export type DropVariationSource = 'upload' | 'generate' | 'cid';
export type DropVariationExt = 'png' | 'jpg' | 'webp' | 'gif';

export type DropFormDraft = {
  accountId: string;
  savedAt: number;
  templateId: DropTemplateId;
  title: string;
  slug: string;
  idSuffix: string;
  description: string;
  seriesName: string;
  supplyInput: string;
  priceInput: string;
  startTime: string;
  endTime: string;
  eventStarts: string;
  eventEnds: string;
  placeDraft: string;
  accessEnds: string;
  maxPerWallet: string;
  royaltyBps: number;
  isCustomRoyalty: boolean;
  customRoyaltyInput: string;
  royaltyShares: RoyaltySplitShare[];
  transferable: boolean;
  renewable: boolean;
  maxRedeemsInput: string;
  draftAllowlist: AllowlistEntry[];
  artMode: DropArtMode;
  musicFormat: MusicReleaseFormat;
  writingFormat: WritingReleaseFormat;
  facets: string[];
  variationSource: DropVariationSource;
  variationsCid: string;
  variationsExt: DropVariationExt;
  coverSeatInput: string;
  traitsCid: string;
  randomAssign: boolean;
  showAdvanced: boolean;
  /** Sealed-set frequencies after generate — optional so older drafts still load. */
  generativeRarity?: GenerativeRarity;
};

const STORAGE_KEY = 'onsocial.drop-form-draft.v1';
/** Same day as pin drafts — survive close-and-come-back. */
export const DROP_FORM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const TEMPLATE_IDS = new Set<DropTemplateId>([
  'art',
  'writing',
  'audio',
  'ticket',
  'coupon',
  'membership',
  'custom',
]);

function isRoyaltyShare(value: unknown): value is RoyaltySplitShare {
  if (!value || typeof value !== 'object') return false;
  const row = value as RoyaltySplitShare;
  return (
    typeof row.accountId === 'string' &&
    typeof row.percent === 'number' &&
    Number.isFinite(row.percent)
  );
}

function isAllowlistEntry(value: unknown): value is AllowlistEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as AllowlistEntry;
  return (
    typeof row.account_id === 'string' &&
    typeof row.allocation === 'number' &&
    Number.isFinite(row.allocation)
  );
}

function readRaw(): DropFormDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DropFormDraft>;
    if (
      !parsed ||
      typeof parsed.accountId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.templateId !== 'string' ||
      !TEMPLATE_IDS.has(parsed.templateId) ||
      typeof parsed.title !== 'string' ||
      typeof parsed.slug !== 'string' ||
      typeof parsed.idSuffix !== 'string' ||
      typeof parsed.description !== 'string' ||
      typeof parsed.seriesName !== 'string' ||
      typeof parsed.supplyInput !== 'string' ||
      typeof parsed.priceInput !== 'string' ||
      typeof parsed.startTime !== 'string' ||
      typeof parsed.endTime !== 'string' ||
      typeof parsed.eventStarts !== 'string' ||
      typeof parsed.eventEnds !== 'string' ||
      typeof parsed.placeDraft !== 'string' ||
      typeof parsed.accessEnds !== 'string' ||
      typeof parsed.maxPerWallet !== 'string' ||
      typeof parsed.royaltyBps !== 'number' ||
      typeof parsed.isCustomRoyalty !== 'boolean' ||
      typeof parsed.customRoyaltyInput !== 'string' ||
      !Array.isArray(parsed.royaltyShares) ||
      !parsed.royaltyShares.every(isRoyaltyShare) ||
      typeof parsed.transferable !== 'boolean' ||
      typeof parsed.renewable !== 'boolean' ||
      typeof parsed.maxRedeemsInput !== 'string' ||
      !Array.isArray(parsed.draftAllowlist) ||
      !parsed.draftAllowlist.every(isAllowlistEntry) ||
      (parsed.artMode !== 'single' && parsed.artMode !== 'variations') ||
      (parsed.musicFormat !== 'single' && parsed.musicFormat !== 'album') ||
      (parsed.writingFormat !== 'issue' && parsed.writingFormat !== 'book') ||
      !Array.isArray(parsed.facets) ||
      !parsed.facets.every((f) => typeof f === 'string') ||
      (parsed.variationSource !== 'upload' &&
        parsed.variationSource !== 'generate' &&
        parsed.variationSource !== 'cid') ||
      typeof parsed.variationsCid !== 'string' ||
      (parsed.variationsExt !== 'png' &&
        parsed.variationsExt !== 'jpg' &&
        parsed.variationsExt !== 'webp' &&
        parsed.variationsExt !== 'gif') ||
      typeof parsed.coverSeatInput !== 'string' ||
      typeof parsed.traitsCid !== 'string' ||
      typeof parsed.randomAssign !== 'boolean' ||
      typeof parsed.showAdvanced !== 'boolean'
    ) {
      return null;
    }
    const generativeRarity = parseGenerativeRarity(parsed.generativeRarity);
    const draft = parsed as DropFormDraft;
    if (!generativeRarity) {
      delete draft.generativeRarity;
      return draft;
    }
    return { ...draft, generativeRarity };
  } catch {
    return null;
  }
}

function writeRaw(draft: DropFormDraft | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!draft) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private mode — form still works in-session without resume.
  }
}

/** True when the draft holds something worth restoring (not empty defaults). */
export function dropFormDraftHasContent(
  draft: Pick<
    DropFormDraft,
    | 'title'
    | 'slug'
    | 'description'
    | 'seriesName'
    | 'facets'
    | 'draftAllowlist'
    | 'variationsCid'
    | 'traitsCid'
    | 'startTime'
    | 'endTime'
    | 'eventStarts'
    | 'eventEnds'
    | 'placeDraft'
    | 'accessEnds'
    | 'maxPerWallet'
    | 'supplyInput'
    | 'priceInput'
    | 'royaltyBps'
    | 'isCustomRoyalty'
    | 'templateId'
  >
): boolean {
  if (draft.title.trim()) return true;
  if (draft.slug.trim()) return true;
  if (draft.description.trim()) return true;
  if (draft.seriesName.trim()) return true;
  if (draft.facets.length > 0) return true;
  if (draft.draftAllowlist.length > 0) return true;
  if (draft.variationsCid.trim()) return true;
  if (draft.traitsCid.trim()) return true;
  if (draft.startTime.trim()) return true;
  if (draft.endTime.trim()) return true;
  if (draft.eventStarts.trim()) return true;
  if (draft.eventEnds.trim()) return true;
  if (draft.placeDraft.trim()) return true;
  if (draft.accessEnds.trim()) return true;
  if (draft.maxPerWallet.trim()) return true;
  if (draft.supplyInput.trim() && draft.supplyInput.trim() !== '25') return true;
  if (draft.priceInput.trim() && draft.priceInput.trim() !== '1') return true;
  if (draft.isCustomRoyalty || draft.royaltyBps !== DEFAULT_ROYALTY_BPS)
    return true;
  if (draft.templateId !== 'art') return true;
  return false;
}

export function loadDropFormDraft(accountId: string): DropFormDraft | null {
  const draft = readRaw();
  if (!draft) return null;
  if (draft.accountId !== accountId) return null;
  if (Date.now() - draft.savedAt > DROP_FORM_DRAFT_TTL_MS) {
    writeRaw(null);
    return null;
  }
  if (!dropFormDraftHasContent(draft)) {
    writeRaw(null);
    return null;
  }
  return draft;
}

export function saveDropFormDraft(
  draft: Omit<DropFormDraft, 'savedAt'> & { savedAt?: number }
): void {
  if (!dropFormDraftHasContent(draft)) {
    writeRaw(null);
    return;
  }
  writeRaw({ ...draft, savedAt: draft.savedAt ?? Date.now() });
}

export function clearDropFormDraft(): void {
  writeRaw(null);
}
