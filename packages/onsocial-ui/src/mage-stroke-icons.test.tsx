import { describe, expect, it } from 'vitest';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  MultiplyIcon,
  SearchIcon,
} from './mage-stroke-icons.js';

describe('mage stroke icons', () => {
  it('exports icon components', () => {
    expect(typeof ArrowLeftIcon).toBe('function');
    expect(typeof ArrowUpRightIcon).toBe('function');
    expect(typeof ChevronDownIcon).toBe('function');
    expect(typeof MultiplyIcon).toBe('function');
    expect(typeof SearchIcon).toBe('function');
  });
});
