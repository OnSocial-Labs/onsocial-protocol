import { describe, expect, it } from 'vitest';
import {
  CollectionQtyStepper,
  collectionQtyClassName,
} from './collection-qty-stepper.js';

describe('CollectionQtyStepper', () => {
  it('exports the stepper and class token', () => {
    expect(typeof CollectionQtyStepper).toBe('function');
    expect(collectionQtyClassName).toBe('collection-qty');
  });
});
