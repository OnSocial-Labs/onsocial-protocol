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
  DotsVerticalIcon,
  EditIcon,
  EditPenIcon,
  ExternalLinkIcon,
  GiftIcon,
  GlobeIcon,
  HeartIcon,
  LinkIcon,
  LogoutIcon,
  MessageIcon,
  MessageRoundIcon,
  MultiplyIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  RepeatIcon,
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
    expect(typeof EditPenIcon).toBe('function');
    expect(typeof ExternalLinkIcon).toBe('function');
    expect(typeof HeartIcon).toBe('function');
    expect(typeof LinkIcon).toBe('function');
    expect(typeof MessageIcon).toBe('function');
    expect(typeof MessageRoundIcon).toBe('function');
    expect(typeof PlusIcon).toBe('function');
    expect(typeof QuestionMarkCircleIcon).toBe('function');
    expect(typeof RepeatIcon).toBe('function');
    expect(typeof GiftIcon).toBe('function');
    expect(typeof GlobeIcon).toBe('function');
    expect(typeof LogoutIcon).toBe('function');
    expect(typeof UserIcon).toBe('function');
    expect(typeof MultiplyIcon).toBe('function');
    expect(typeof TrashIcon).toBe('function');
    expect(typeof SearchIcon).toBe('function');
    expect(typeof DotsCircleIcon).toBe('function');
    expect(typeof DotsVerticalIcon).toBe('function');
    expect(typeof SlidersHorizontalIcon).toBe('function');
  });
});
