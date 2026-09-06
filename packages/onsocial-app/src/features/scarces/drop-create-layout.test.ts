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
  dropCreateRoyaltyOpen,
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
