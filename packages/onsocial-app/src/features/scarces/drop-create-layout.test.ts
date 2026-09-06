import { describe, expect, it } from 'vitest';
import {
  DROP_CREATE_SECTION_ORDER,
  dropCreateAttachAction,
  dropCreateBlurbOpen,
  dropCreateDealShowsSupplyField,
  dropCreatePiecePickerClass,
  dropCreateScreenTitle,
} from '@/features/scarces/drop-create-layout';

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
