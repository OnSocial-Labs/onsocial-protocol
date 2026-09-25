import { describe, expect, it } from 'vitest';
import {
  DROP_CREATE_SECTION_ORDER,
  dropCreateAdvancedExtraAction,
  dropCreateAdvancedExtraOpen,
  dropCreateAttachAction,
  dropCreateAttachHint,
  dropCreateDescriptionOpen,
  dropCreateDescriptionPlaceholder,
  dropCreateDescriptionToggle,
  dropCreateBookPdfPlacement,
  dropCreateDealDraftDirty,
  dropCreateDesignDraftDirty,
  dropCreateMoreToggle,
  dropCreateRoyaltyDraftDirty,
  dropCreateDealShowsSupplyField,
  dropCreateSetDealCount,
  dropCreateSetDealLabel,
  dropCreateFacetsAction,
  dropCreateFacetsOpen,
  dropCreatePiecePickerClass,
  dropCreateAllowlistOpen,
  dropCreateAllowlistSummary,
  dropCreateDropIdSummary,
  dropCreateExtraHint,
  dropCreateExtraRowLabel,
  dropCreateFacetsSummary,
  dropCreateOptionalSummary,
  dropCreateRenewalsChoice,
  dropCreateRenewalsHint,
  dropCreateRenewalsSummary,
  dropCreateRenewalsOpen,
  dropCreateRoyaltySummary,
  dropCreatePerWalletInput,
  dropCreatePerWalletSummary,
  dropSetReorderIntent,
  dropCreateSaleRulesSummary,
  dropCreateSetSourceSummary,
  dropCreateAllowlistNeedsSaleOpen,
  dropCreateSaleWindowSummary,
  dropCreateSaleCloseDisplay,
  dropCreateTicketSaleWindow,
  dropCreateTransferableSummary,
  dropCreateBurnableSummary,
  dropRightsFacts,
  dropCreateRoyaltyOpen,
  dropCreateSaleRulesOpen,
  dropCreateSaleWindowOpen,
  dropCreateScreenTitle,
} from '@/features/scarces/drop-create-layout';
import { DEFAULT_ROYALTY_BPS } from '@/features/scarces/scarce-royalty';

describe('dropCreateScreenTitle', () => {
  it('keeps New drop unless the studio is open', () => {
    expect(dropCreateScreenTitle(false)).toBe('New drop');
    expect(dropCreateScreenTitle(true)).toBe('Design your set');
  });
});

describe('DROP_CREATE_SECTION_ORDER', () => {
  it('puts the work before the name, then the deal, then description', () => {
    expect(DROP_CREATE_SECTION_ORDER).toEqual([
      'work',
      'title',
      'deal',
      'description',
    ]);
  });
});

describe('dropCreateDescriptionOpen', () => {
  it('waits until the maker asks or a draft already has copy', () => {
    expect(dropCreateDescriptionOpen('')).toBe(false);
    expect(dropCreateDescriptionOpen('  ')).toBe(false);
    expect(dropCreateDescriptionOpen('Fans get the print.')).toBe(true);
    expect(dropCreateDescriptionOpen('', true)).toBe(true);
  });
});

describe('dropCreateDescriptionToggle', () => {
  it('stays Description — the chevron opens and closes', () => {
    expect(dropCreateDescriptionToggle()).toBe('Description');
  });
});

describe('dropCreateDescriptionPlaceholder', () => {
  it('says where the line shows, and where a manuscript goes', () => {
    expect(dropCreateDescriptionPlaceholder(false)).toBe(
      'Shown on the drop page.'
    );
    expect(dropCreateDescriptionPlaceholder(true)).toBe(
      'Shown on the drop page. The manuscript uploads separately.'
    );
  });
});

describe('dropCreatePiecePickerClass', () => {
  it('puts empty artwork on the piece, not a studio launch card', () => {
    expect(dropCreatePiecePickerClass()).toBe(
      'drop-cover-picker drop-create-piece'
    );
    expect(dropCreatePiecePickerClass('piece')).toBe(
      'drop-cover-picker drop-create-piece'
    );
    expect(dropCreatePiecePickerClass('studio')).toBe(
      'drop-cover-picker drop-studio-launch'
    );
  });
});

describe('dropCreateAttachAction', () => {
  it('names the empty attach like Add a description, not a form label', () => {
    expect(dropCreateAttachAction('track')).toBe('Add track');
    expect(dropCreateAttachAction('tracks')).toBe('Add tracks');
    expect(dropCreateAttachAction('file')).toBe('Add file');
    expect(dropCreateAttachAction('files')).toBe('Add files');
    expect(dropCreateAttachAction('pdf')).toBe('Add PDF');
  });
});

describe('dropCreateAttachHint', () => {
  it('describes the file to add, and leaves preview and reorder for the list', () => {
    expect(dropCreateAttachHint('single')).toBe(
      'MP3, M4A, WAV, or similar · ≤20 MB'
    );
    expect(dropCreateAttachHint('album', { maxTracks: 30 })).toBe(
      '2–30 tracks · MP3, M4A, WAV, or similar · ≤20 MB each'
    );
    expect(dropCreateAttachHint('issue')).toBe(
      '.md for the reader · PDF ok · ≤500 KB text / 20 MB PDF'
    );
    expect(dropCreateAttachHint('book', { maxChapters: 100 })).toBe(
      '2–100 chapters · .md for reading'
    );
    for (const hint of [
      dropCreateAttachHint('single'),
      dropCreateAttachHint('album', { maxTracks: 30 }),
      dropCreateAttachHint('book', { maxChapters: 100 }),
    ]) {
      expect(hint.toLowerCase()).not.toMatch(/preview|reorder/);
    }
  });
});

describe('dropCreateBookPdfPlacement', () => {
  it('parks the optional PDF in More, not on the first screen', () => {
    expect(dropCreateBookPdfPlacement()).toBe('more');
  });
});

describe('dropCreateMoreToggle', () => {
  it('names the collapsed extras More', () => {
    expect(dropCreateMoreToggle(false)).toBe('More');
    expect(dropCreateMoreToggle(true)).toBe('Hide more');
  });
});

describe('drop create draft dirtiness', () => {
  it('treats a typed supply or price as a draft', () => {
    expect(dropCreateDealDraftDirty('', '')).toBe(false);
    expect(dropCreateDealDraftDirty('  ', '  ')).toBe(false);
    expect(dropCreateDealDraftDirty('5', '')).toBe(true);
    expect(dropCreateDealDraftDirty('', '1')).toBe(true);
  });

  it('treats a royalty change or split as a draft and leaves the 10% default', () => {
    expect(
      dropCreateRoyaltyDraftDirty({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: false,
        shareCount: 0,
      })
    ).toBe(false);
    expect(
      dropCreateRoyaltyDraftDirty({
        royaltyBps: 500,
        isCustomRoyalty: false,
        shareCount: 0,
      })
    ).toBe(true);
    expect(
      dropCreateRoyaltyDraftDirty({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: true,
        shareCount: 0,
      })
    ).toBe(true);
    expect(
      dropCreateRoyaltyDraftDirty({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: false,
        shareCount: 2,
      })
    ).toBe(true);
  });

  it('treats layers or a running generate as a draft', () => {
    expect(dropCreateDesignDraftDirty(null)).toBe(false);
    expect(
      dropCreateDesignDraftDirty({ layers: 0, traits: 0, working: false })
    ).toBe(false);
    expect(
      dropCreateDesignDraftDirty({ layers: 2, traits: 0, working: false })
    ).toBe(true);
    expect(
      dropCreateDesignDraftDirty({ layers: 0, traits: 4, working: false })
    ).toBe(true);
    expect(
      dropCreateDesignDraftDirty({ layers: 0, traits: 0, working: true })
    ).toBe(true);
  });
});

describe('dropCreateAdvancedExtraOpen', () => {
  it('waits until the maker asks or a draft already has a value', () => {
    expect(dropCreateAdvancedExtraOpen('')).toBe(false);
    expect(dropCreateAdvancedExtraOpen('  ')).toBe(false);
    expect(dropCreateAdvancedExtraOpen('Ink Studies')).toBe(true);
    expect(dropCreateAdvancedExtraOpen('', true)).toBe(true);
  });
});

describe('dropCreateAdvancedExtraAction', () => {
  it('names Advanced extras like Add a description, not a form label', () => {
    expect(dropCreateAdvancedExtraAction('dropId')).toBe('Set a drop ID');
    expect(dropCreateAdvancedExtraAction('series')).toBe('Add to a series');
    expect(dropCreateAdvancedExtraAction('royalty')).toBe('Set a royalty');
    expect(dropCreateAdvancedExtraAction('saleRules')).toBe('Set sale rules');
    expect(dropCreateAdvancedExtraAction('renewals')).toBe('Set renewable');
    expect(dropCreateAdvancedExtraAction('renewals', { isTicket: true })).toBe(
      'Allow postpone'
    );
    expect(dropCreateAdvancedExtraAction('allowlist')).toBe('Add an allowlist');
    expect(dropCreateAdvancedExtraAction('place')).toBe('Add a place');
    expect(dropCreateAdvancedExtraAction('burnable')).toBe('Set burnable');
  });
});

describe('dropCreateRenewalsChoice', () => {
  it('says Yes when they can postpone or renew', () => {
    expect(dropCreateRenewalsChoice(true)).toBe('Yes');
    expect(dropCreateRenewalsChoice(false)).toBe('No');
  });
});

describe('dropCreateExtraRowLabel', () => {
  it('names the row, not a Set a… link', () => {
    expect(dropCreateExtraRowLabel('dropId')).toBe('Drop ID');
    expect(dropCreateExtraRowLabel('saleRules')).toBe('Sale');
    expect(dropCreateExtraRowLabel('perWallet')).toBe('Per wallet');
    expect(dropCreateExtraRowLabel('transferable')).toBe('Transferable');
    expect(dropCreateExtraRowLabel('burnable')).toBe('Burnable');
    expect(dropCreateExtraRowLabel('renewals')).toBe('Renewable');
    expect(dropCreateExtraRowLabel('renewals', { isTicket: true })).toBe(
      'Postpone'
    );
    expect(dropCreateExtraRowLabel('facets', { facetLabel: 'Style' })).toBe(
      'Style'
    );
    expect(dropCreateExtraRowLabel('setSource')).toBe('Images');
  });
});

describe('dropCreateSetSourceSummary', () => {
  it('reads the full choice, and a pinned set stays Generate layers', () => {
    expect(dropCreateSetSourceSummary('upload')).toBe('Upload images');
    expect(dropCreateSetSourceSummary('generate')).toBe('Generate layers');
    expect(dropCreateSetSourceSummary('cid')).toBe('Generate layers');
  });
});

describe('dropCreateRenewalsHint', () => {
  it('explains postpone for tickets', () => {
    expect(dropCreateRenewalsHint(true)).toMatch(/event end later/);
    expect(dropCreateRenewalsHint(false)).toMatch(/renew/);
  });
});

describe('dropCreateExtraHint', () => {
  it('is one line in the drawer, not a question', () => {
    expect(dropCreateExtraHint('dropId')).toMatch(/from your title/);
    expect(dropCreateExtraHint('event')).toMatch(/not the sale/);
    expect(dropCreateExtraHint('access')).toMatch(/offer ends/);
    expect(dropCreateExtraHint('renewals', { isTicket: true })).toBe(
      dropCreateRenewalsHint(true)
    );
    expect(dropCreateExtraHint('saleRules')).toBe('When collectors can mint.');
    expect(dropCreateExtraHint('perWallet')).toMatch(/one wallet/);
    expect(dropCreateExtraHint('transferable')).toBe(
      'Yes lets them transfer and resell. No keeps the edition with them.'
    );
    expect(dropCreateExtraHint('burnable')).toBe(
      'Yes lets the holder destroy their edition. Gone for good, no refund.'
    );
    expect(dropCreateExtraHint('setSource')).toBe(
      'Upload finished images, or generate a set from stacked layers.'
    );
    expect(dropCreateExtraHint('renewals')).toBe(
      'Yes lets holders renew after it expires.'
    );
  });
});

describe('dropCreate summaries', () => {
  it('shows the picked value, or the default', () => {
    expect(dropCreateDropIdSummary('')).toBe('From title');
    expect(dropCreateDropIdSummary('ink-studies')).toBe('ink-studies');
    expect(dropCreateOptionalSummary('')).toBe('None');
    expect(dropCreateOptionalSummary('Ink Studies')).toBe('Ink Studies');
    expect(dropCreateFacetsSummary([])).toBe('None');
    expect(dropCreateFacetsSummary(['generative'])).toBe('generative');
    expect(
      dropCreateFacetsSummary(['generative'], (slug) =>
        slug === 'generative' ? 'Generative' : null
      )
    ).toBe('Generative');
    expect(dropCreateAllowlistSummary(0)).toBe('None');
    expect(dropCreateAllowlistSummary(0, false)).toBe('Connect');
    expect(dropCreateAllowlistSummary(2)).toBe('2 accounts');
    expect(dropCreateRenewalsSummary({ on: true, isTicket: true })).toBe('Yes');
    expect(dropCreateRenewalsSummary({ on: false })).toBe('No');
    expect(
      dropCreateRenewalsSummary({
        on: true,
        requiresAccessEnd: true,
      })
    ).toBe('Yes');
    expect(
      dropCreateRenewalsSummary({
        on: true,
        requiresAccessEnd: true,
        accessEndsLabel: '8 Sep',
      })
    ).toBe('Yes');
    expect(
      dropCreateRenewalsSummary({
        on: true,
        accessEndsLabel: '8 Sep',
      })
    ).toBe('Yes · 8 Sep');
    expect(dropCreateSaleWindowSummary('Now', 'no end')).toBe('Now · no end');
    expect(dropCreateAllowlistNeedsSaleOpen(0, '')).toBe(false);
    expect(dropCreateAllowlistNeedsSaleOpen(2, '')).toBe(true);
    expect(dropCreateAllowlistNeedsSaleOpen(2, '2026-09-30T21:49')).toBe(
      false
    );
    const eventEndsMs = Date.parse('2026-09-25T21:54:00');
    const afterEvent = Date.parse('2026-09-30T21:49:00');
    expect(
      dropCreateTicketSaleWindow({
        saleOpensMs: afterEvent,
        saleClosesMs: null,
        eventEndsMs,
      }).error
    ).toBe('The open time must be before the event ends.');
    expect(
      dropCreateTicketSaleWindow({
        saleOpensMs: null,
        saleClosesMs: null,
        eventEndsMs,
      })
    ).toEqual({ error: null, closesMs: eventEndsMs });
    expect(
      dropCreateTicketSaleWindow({
        saleOpensMs: Date.parse('2026-09-24T18:00:00'),
        saleClosesMs: Date.parse('2026-09-26T18:00:00'),
        eventEndsMs,
      }).error
    ).toBe('The close time must be on or before the event end.');
    expect(
      dropCreateTicketSaleWindow({
        saleOpensMs: null,
        saleClosesMs: eventEndsMs,
        eventEndsMs,
      })
    ).toEqual({ error: null, closesMs: eventEndsMs });
    expect(
      dropCreateTicketSaleWindow({
        saleOpensMs: afterEvent,
        saleClosesMs: null,
        eventEndsMs: null,
      })
    ).toEqual({ error: null, closesMs: null });
    expect(
      dropCreateSaleCloseDisplay({
        isTicket: true,
        endTimeLabel: '',
        eventEndsLabel: 'Sep 25, 2026, 9:54 PM',
        emptyLabel: 'no end',
      })
    ).toBe('Sep 25, 2026, 9:54 PM');
    expect(
      dropCreateSaleCloseDisplay({
        isTicket: false,
        endTimeLabel: '',
        eventEndsLabel: 'Sep 25, 2026, 9:54 PM',
        emptyLabel: 'no end',
      })
    ).toBe('no end');
    expect(dropCreatePerWalletSummary('', 'editions')).toBe('No limit');
    expect(dropCreatePerWalletSummary('0', 'editions')).toBe('No limit');
    expect(dropCreatePerWalletSummary('2', 'editions')).toBe('2 editions');
    expect(dropCreatePerWalletInput('0', 10)).toBe('');
    expect(dropCreatePerWalletInput('3', 10)).toBe('3');
    expect(dropCreatePerWalletInput('50', 10)).toBe('10');
    expect(dropCreatePerWalletInput('50', null)).toBe('50');
    expect(dropCreatePerWalletInput('0008', 20)).toBe('8');
    expect(dropSetReorderIntent('mouse', 2, 0, false)).toBe('wait');
    expect(dropSetReorderIntent('mouse', 6, 0, false)).toBe('arm');
    expect(dropSetReorderIntent('touch', 4, 0, false)).toBe('wait');
    expect(dropSetReorderIntent('touch', 0, 0, true)).toBe('arm');
    expect(dropSetReorderIntent('touch', 16, 2, false)).toBe('arm');
    expect(dropSetReorderIntent('touch', 2, 16, false)).toBe('arm');
    expect(dropCreateTransferableSummary(true)).toBe('Yes');
    expect(dropCreateTransferableSummary(false)).toBe('No');
    expect(dropCreateBurnableSummary(false)).toBe('No');
    expect(dropCreateBurnableSummary(true)).toBe('Yes');
    expect(
      dropRightsFacts({
        transferable: true,
        burnable: true,
        renewable: true,
        isTicket: true,
      })
    ).toEqual(['Transferable', 'Burnable', 'Postpone']);
    expect(
      dropRightsFacts({
        transferable: false,
        burnable: false,
        renewable: true,
      })
    ).toEqual(['Not transferable', 'Not burnable', 'Renewable']);
    expect(
      dropRightsFacts({
        transferable: true,
        burnable: null,
        renewable: false,
      })
    ).toEqual(['Transferable']);
    expect(
      dropCreateSaleRulesSummary({
        opensLabel: 'Now',
        closesLabel: 'no end',
        maxPerWallet: '',
        transferable: true,
      })
    ).toBe('Now · no end');
    expect(
      dropCreateRoyaltySummary({
        percentLabel: '10%',
        isNone: false,
        splitCount: 1,
      })
    ).toBe('10%');
  });
});

describe('dropCreateSaleWindowOpen', () => {
  it('waits on now / no end until the maker asks or sets a time', () => {
    expect(dropCreateSaleWindowOpen('', '')).toBe(false);
    expect(dropCreateSaleWindowOpen('  ', '  ')).toBe(false);
    expect(dropCreateSaleWindowOpen('', '', true)).toBe(true);
    expect(dropCreateSaleWindowOpen('2026-09-08T10:00', '')).toBe(true);
    expect(dropCreateSaleWindowOpen('', '2026-09-09T18:00')).toBe(true);
  });
});

describe('dropCreateSaleRulesOpen', () => {
  it('waits on now / no cap / transferable until the maker asks or changes one', () => {
    expect(
      dropCreateSaleRulesOpen({
        startTime: '',
        endTime: '',
        maxPerWallet: '',
        transferable: true,
      })
    ).toBe(false);
    expect(
      dropCreateSaleRulesOpen({
        startTime: '',
        endTime: '',
        maxPerWallet: '',
        transferable: true,
        forcedOpen: true,
      })
    ).toBe(true);
    expect(
      dropCreateSaleRulesOpen({
        startTime: '2026-09-08T10:00',
        endTime: '',
        maxPerWallet: '',
        transferable: true,
      })
    ).toBe(true);
    expect(
      dropCreateSaleRulesOpen({
        startTime: '',
        endTime: '',
        maxPerWallet: '2',
        transferable: true,
      })
    ).toBe(true);
    expect(
      dropCreateSaleRulesOpen({
        startTime: '',
        endTime: '',
        maxPerWallet: '',
        transferable: false,
      })
    ).toBe(true);
    expect(
      dropCreateSaleRulesOpen({
        startTime: '',
        endTime: '',
        maxPerWallet: '',
        transferable: false,
        defaultTransferable: false,
      })
    ).toBe(false);
  });
});

describe('dropCreateRenewalsOpen', () => {
  it('waits on off / no cap until the maker asks or a kind needs them', () => {
    expect(
      dropCreateRenewalsOpen({
        renewable: false,
        maxRedeems: '',
        accessEnds: '',
      })
    ).toBe(false);
    expect(
      dropCreateRenewalsOpen({
        renewable: false,
        maxRedeems: '',
        accessEnds: '',
        forcedOpen: true,
      })
    ).toBe(true);
    expect(
      dropCreateRenewalsOpen({
        renewable: true,
        maxRedeems: '',
        accessEnds: '',
      })
    ).toBe(true);
    expect(
      dropCreateRenewalsOpen({
        renewable: true,
        defaultRenewable: true,
        maxRedeems: '',
        accessEnds: '',
      })
    ).toBe(false);
    expect(
      dropCreateRenewalsOpen({
        renewable: false,
        maxRedeems: '1',
        accessEnds: '',
      })
    ).toBe(true);
    expect(
      dropCreateRenewalsOpen({
        renewable: false,
        maxRedeems: '',
        accessEnds: '',
        requiresAccessEnd: true,
      })
    ).toBe(true);
  });
});

describe('dropCreateAllowlistOpen', () => {
  it('waits until the maker asks or a draft already has accounts', () => {
    expect(dropCreateAllowlistOpen(0)).toBe(false);
    expect(dropCreateAllowlistOpen(1)).toBe(true);
    expect(dropCreateAllowlistOpen(0, true)).toBe(true);
  });
});

describe('dropCreateRoyaltyOpen', () => {
  it('waits on the default 10% until the maker asks or changes it', () => {
    expect(
      dropCreateRoyaltyOpen({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: false,
      })
    ).toBe(false);
    expect(
      dropCreateRoyaltyOpen({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: false,
        forcedOpen: true,
      })
    ).toBe(true);
    expect(
      dropCreateRoyaltyOpen({
        royaltyBps: 0,
        isCustomRoyalty: false,
      })
    ).toBe(true);
    expect(
      dropCreateRoyaltyOpen({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: true,
      })
    ).toBe(true);
    expect(
      dropCreateRoyaltyOpen({
        royaltyBps: DEFAULT_ROYALTY_BPS,
        isCustomRoyalty: false,
        isSplit: true,
      })
    ).toBe(true);
  });
});

describe('dropCreateFacetsOpen', () => {
  it('waits until the maker asks or a draft already picked chips', () => {
    expect(dropCreateFacetsOpen([])).toBe(false);
    expect(dropCreateFacetsOpen(['generative'])).toBe(true);
    expect(dropCreateFacetsOpen([], true)).toBe(true);
  });
});

describe('dropCreateFacetsAction', () => {
  it('names the add-toggle from the field label', () => {
    expect(dropCreateFacetsAction('Style')).toBe('Add a style');
    expect(dropCreateFacetsAction('Genre')).toBe('Add a genre');
    expect(dropCreateFacetsAction('Subject')).toBe('Add a subject');
    expect(dropCreateFacetsAction('Occasion')).toBe('Add an occasion');
    expect(dropCreateFacetsAction('Offer')).toBe('Add an offer');
    expect(dropCreateFacetsAction('Tier')).toBe('Add a tier');
    expect(dropCreateFacetsAction('Theme')).toBe('Add a theme');
  });
});

describe('dropCreateSetDealCount', () => {
  it('stays off the line until a set has a count', () => {
    expect(
      dropCreateSetDealCount({
        isVariations: false,
        fileCount: 5,
        pinnedPieceCount: 0,
        generatedCount: 0,
      })
    ).toBeNull();
    expect(
      dropCreateSetDealCount({
        isVariations: true,
        fileCount: 0,
        pinnedPieceCount: 0,
        generatedCount: 0,
      })
    ).toBeNull();
  });

  it('prefers the live upload, then a pinned set, then a generated count', () => {
    expect(
      dropCreateSetDealCount({
        isVariations: true,
        fileCount: 5,
        pinnedPieceCount: 9,
        generatedCount: 100,
      })
    ).toBe(5);
    expect(
      dropCreateSetDealCount({
        isVariations: true,
        fileCount: 0,
        pinnedPieceCount: 40,
        generatedCount: 0,
      })
    ).toBe(40);
    expect(
      dropCreateSetDealCount({
        isVariations: true,
        fileCount: 0,
        pinnedPieceCount: 0,
        generatedCount: 100,
      })
    ).toBe(100);
  });
});

describe('dropCreateSetDealLabel', () => {
  it('names one piece and many pieces', () => {
    expect(dropCreateSetDealLabel(1)).toEqual({ value: '1', unit: 'piece' });
    expect(dropCreateSetDealLabel(5).unit).toBe('pieces');
  });
});

describe('dropCreateDealShowsSupplyField', () => {
  it('keeps a typed supply except on generated or uploaded sets', () => {
    expect(
      dropCreateDealShowsSupplyField({
        isGeneratedSet: false,
        isVariations: false,
      })
    ).toBe(true);
    expect(
      dropCreateDealShowsSupplyField({
        isGeneratedSet: true,
        isVariations: true,
      })
    ).toBe(false);
    expect(
      dropCreateDealShowsSupplyField({
        isGeneratedSet: false,
        isVariations: true,
      })
    ).toBe(false);
  });
});
