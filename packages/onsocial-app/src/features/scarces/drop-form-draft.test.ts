import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  clearDropFormDraft,
  dropFormDraftHasContent,
  loadDropFormDraft,
  saveDropFormDraft,
  DROP_FORM_DRAFT_TTL_MS,
  type DropFormDraft,
} from './drop-form-draft';
import { DEFAULT_ROYALTY_BPS } from './scarce-royalty';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal('window', { localStorage });
  return localStorage;
}

function baseDraft(
  overrides: Partial<DropFormDraft> = {}
): Omit<DropFormDraft, 'savedAt'> {
  return {
    accountId: 'alice.near',
    templateId: 'art',
    title: '',
    slug: '',
    idSuffix: 'ab12',
    description: '',
    seriesName: '',
    supplyInput: '25',
    priceInput: '1',
    startTime: '',
    endTime: '',
    eventStarts: '',
    eventEnds: '',
    placeDraft: '',
    accessEnds: '',
    maxPerWallet: '',
    royaltyBps: DEFAULT_ROYALTY_BPS,
    isCustomRoyalty: false,
    customRoyaltyInput: '',
    royaltyShares: [],
    transferable: true,
    renewable: false,
    maxRedeemsInput: '',
    draftAllowlist: [],
    artMode: 'single',
    musicFormat: 'single',
    writingFormat: 'article',
    facets: [],
    variationSource: 'upload',
    variationsCid: '',
    variationsExt: 'png',
    coverSeatInput: '1',
    traitsCid: '',
    randomAssign: false,
    showAdvanced: false,
    ...overrides,
  };
}

describe('drop-form-draft', () => {
  beforeEach(() => {
    installMemoryLocalStorage().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('treats empty defaults as no content', () => {
    expect(dropFormDraftHasContent(baseDraft())).toBe(false);
  });

  it('saves and loads a titled draft for the same account', () => {
    saveDropFormDraft(baseDraft({ title: 'Genesis Prints' }));
    const loaded = loadDropFormDraft('alice.near');
    expect(loaded?.title).toBe('Genesis Prints');
    expect(loaded?.idSuffix).toBe('ab12');
    expect(loadDropFormDraft('bob.near')).toBeNull();
  });

  it('clears empty saves and expired drafts', () => {
    saveDropFormDraft(baseDraft());
    expect(loadDropFormDraft('alice.near')).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    saveDropFormDraft(baseDraft({ title: 'Old' }));
    vi.setSystemTime(1_000_000 + DROP_FORM_DRAFT_TTL_MS + 1);
    expect(loadDropFormDraft('alice.near')).toBeNull();
  });

  it('clearDropFormDraft removes storage', () => {
    saveDropFormDraft(baseDraft({ title: 'Keep' }));
    clearDropFormDraft();
    expect(loadDropFormDraft('alice.near')).toBeNull();
  });

  it('round-trips optional generative rarity and ignores a bad payload', () => {
    saveDropFormDraft(
      baseDraft({
        title: 'Prints',
        generativeRarity: {
          supply: 3,
          layers: [
            {
              name: 'Background',
              traits: [{ name: 'Night', count: 2, pct: 66.7 }],
            },
          ],
        },
      })
    );
    expect(loadDropFormDraft('alice.near')?.generativeRarity?.supply).toBe(3);

    saveDropFormDraft(
      baseDraft({
        title: 'Prints',
        generativeRarity: { supply: 0, layers: [] } as never,
      })
    );
    expect(loadDropFormDraft('alice.near')?.generativeRarity).toBeUndefined();
  });
});
