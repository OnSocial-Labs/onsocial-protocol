import { describe, expect, it } from 'vitest';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DotsCircleIcon,
  EditIcon,
  ExternalLinkIcon,
  GiftIcon,
  GlobeIcon,
  LogoutIcon,
  MultiplyIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  UserIcon,
} from './mage-stroke-icons.js';

describe('mage stroke icons', () => {
  it('exports icon components', () => {
    expect(typeof ArrowLeftIcon).toBe('function');
    expect(typeof ArrowUpRightIcon).toBe('function');
    expect(typeof CameraIcon).toBe('function');
    expect(typeof CheckIcon).toBe('function');
    expect(typeof ChevronDownIcon).toBe('function');
    expect(typeof ChevronRightIcon).toBe('function');
    expect(typeof CopyIcon).toBe('function');
    expect(typeof EditIcon).toBe('function');
    expect(typeof ExternalLinkIcon).toBe('function');
    expect(typeof GiftIcon).toBe('function');
    expect(typeof GlobeIcon).toBe('function');
    expect(typeof LogoutIcon).toBe('function');
    expect(typeof UserIcon).toBe('function');
    expect(typeof MultiplyIcon).toBe('function');
    expect(typeof TrashIcon).toBe('function');
    expect(typeof SearchIcon).toBe('function');
    expect(typeof DotsCircleIcon).toBe('function');
    expect(typeof SlidersHorizontalIcon).toBe('function');
  });
});
