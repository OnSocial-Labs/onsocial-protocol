import { describe, expect, it } from 'vitest';
import {
  DROP_CREATE_SECTION_ORDER,
  dropCreateAdvancedExtraAction,
  dropCreateAdvancedExtraOpen,
  dropCreateAttachAction,
  dropCreateBlurbOpen,
  dropCreateBookPdfPlacement,
  dropCreateDealShowsSupplyField,
  dropCreateFacetsAction,
  dropCreateFacetsOpen,
  dropCreatePiecePickerClass,
  dropCreateAllowlistOpen,
  dropCreateAllowlistSummary,
  dropCreateDropIdSummary,
  dropCreateExtraRowLabel,
  dropCreateFacetsSummary,
  dropCreateOptionalSummary,
  dropCreateRenewalsChoice,
  dropCreateRenewalsHint,
  dropCreateRenewalsOpen,
  dropCreateRoyaltySummary,
  dropCreateSaleRulesSummary,
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
  it('puts the work before the name, then the deal, then the blurb', () => {
    expect(DROP_CREATE_SECTION_ORDER).toEqual([
      'work',
      'title',
      'deal',
      'description',
    ]);
  });
});

describe('dropCreateBlurbOpen', () => {
  it('waits until the maker asks or a draft already has copy', () => {
    expect(dropCreateBlurbOpen('')).toBe(false);
    expect(dropCreateBlurbOpen('  ')).toBe(false);
    expect(dropCreateBlurbOpen('Fans get the print.')).toBe(true);
    expect(dropCreateBlurbOpen('', true)).toBe(true);
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
  it('names the empty attach like Add a blurb, not a form label', () => {
    expect(dropCreateAttachAction('track')).toBe('Add track');
    expect(dropCreateAttachAction('tracks')).toBe('Add tracks');
    expect(dropCreateAttachAction('file')).toBe('Add file');
    expect(dropCreateAttachAction('files')).toBe('Add files');
    expect(dropCreateAttachAction('pdf')).toBe('Add PDF');
  });
});

describe('dropCreateBookPdfPlacement', () => {
  it('parks the optional PDF in Advanced, not on the first screen', () => {
    expect(dropCreateBookPdfPlacement()).toBe('advanced');
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
  it('names Advanced extras like Add a blurb, not a form label', () => {
    expect(dropCreateAdvancedExtraAction('dropId')).toBe('Set a drop ID');
    expect(dropCreateAdvancedExtraAction('series')).toBe('Add to a series');
    expect(dropCreateAdvancedExtraAction('royalty')).toBe('Set a royalty');
    expect(dropCreateAdvancedExtraAction('saleRules')).toBe('Set sale rules');
    expect(dropCreateAdvancedExtraAction('renewals')).toBe('Set renewals');
    expect(dropCreateAdvancedExtraAction('renewals', { isTicket: true })).toBe(
      'Allow date changes'
    );
    expect(dropCreateAdvancedExtraAction('allowlist')).toBe('Add an allowlist');
    expect(dropCreateAdvancedExtraAction('place')).toBe('Add a place');
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
    expect(dropCreateExtraRowLabel('renewals')).toBe('Renewals');
    expect(dropCreateExtraRowLabel('renewals', { isTicket: true })).toBe(
      'Postpone'
    );
    expect(dropCreateExtraRowLabel('facets', { facetLabel: 'Style' })).toBe(
      'Style'
    );
  });
});

describe('dropCreateRenewalsHint', () => {
  it('explains postpone for tickets', () => {
    expect(dropCreateRenewalsHint(true)).toMatch(/event end later/);
    expect(dropCreateRenewalsHint(false)).toMatch(/renew/);
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
    expect(dropCreateAllowlistSummary(0)).toBe('None');
    expect(dropCreateAllowlistSummary(2)).toBe('2 accounts');
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
    expect(dropCreateFacetsAction('Access')).toBe('Add access');
    expect(dropCreateFacetsAction('Theme')).toBe('Add a theme');
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
