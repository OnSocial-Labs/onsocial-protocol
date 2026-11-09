import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ArrowLeftIcon,
  mageStrokeIconClassName,
  ArrowUpRightIcon,
  DirectionUpRightIcon,
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  CameraIcon,
  CancelIcon,
  ChartVerticalIcon,
  DashboardIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  TimeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  DotsCircleIcon,
  DownloadIcon,
  DotsHorizontalIcon,
  DotsVerticalIcon,
  EditIcon,
  EditPenIcon,
  ExclamationTriangleIcon,
  ExternalLinkIcon,
  FireIcon,
  FireBIcon,
  FingerprintIcon,
  GiftIcon,
  GlobeIcon,
  HomeIcon,
  NotificationBellIcon,
  UsersIcon,
  UserCircleIcon,
  HeartIcon,
  BookmarkIcon,
  Box3dIcon,
  BoxCheckIcon,
  BuildingTreeIcon,
  ImageIcon,
  MapMarkerIcon,
  InformationCircleIcon,
  LinkIcon,
  KeyIcon,
  LogoutIcon,
  MessageIcon,
  MessageRoundIcon,
  MultiplyIcon,
  NoteTextIcon,
  PlusCircleIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  RefreshIcon,
  RepeatIcon,
  SaveIcon,
  ScaleDownIcon,
  ScaleUpIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  ShieldCheckIcon,
  SecurityShieldIcon,
  ShopIcon,
  TagIcon,
  StarMovingIcon,
  StarsCIcon,
  StopIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  UnlockIcon,
  UserCheckIcon,
  UserCrossIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
  VideoPlayerIcon,
  VolumeMuteIcon,
  VolumeUpIcon,
} from './mage-stroke-icons.js';

describe('mage stroke icons', () => {
  it('draws quiet launcher glyphs at the shared Mage stroke', () => {
    for (const Icon of [
      HomeIcon,
      UsersIcon,
      UserCircleIcon,
      DashboardIcon,
      CalendarIcon,
      NotificationBellIcon,
    ]) {
      const html = renderToStaticMarkup(createElement(Icon));
      expect(html).toContain('stroke-width="2"');
      expect(html).not.toContain('stroke-width="1.6"');
    }
    const users = renderToStaticMarkup(createElement(UsersIcon));
    const page = renderToStaticMarkup(createElement(UserCircleIcon));
    expect(users).not.toContain('M21.987');
    expect(page).toContain('M12 21.5');
    expect(page).not.toContain('M11.9667 1.75195');
    const bell = renderToStaticMarkup(createElement(NotificationBellIcon));
    expect(bell).toContain('viewBox="0 0 24 24"');
    expect(bell).toContain('mage-stroke-icon');
    expect(bell).not.toContain('448');
  });

  it('stamps every stroke glyph with mage-stroke-icon', () => {
    expect(mageStrokeIconClassName).toBe('mage-stroke-icon');
    const html = renderToStaticMarkup(
      createElement(GiftIcon, { className: 'os-action-drawer-icon' })
    );
    expect(html).toContain('mage-stroke-icon');
    expect(html).toContain('os-action-drawer-icon');
  });

  it('exports icon components', () => {
    expect(typeof ArrowLeftIcon).toBe('function');
    expect(typeof ArrowUpRightIcon).toBe('function');
    expect(typeof DirectionUpRightIcon).toBe('function');
    expect(typeof AlignCenterIcon).toBe('function');
    expect(typeof AlignJustifyIcon).toBe('function');
    expect(typeof AlignLeftIcon).toBe('function');
    expect(typeof CameraIcon).toBe('function');
    expect(typeof CancelIcon).toBe('function');
    expect(typeof ChartVerticalIcon).toBe('function');
    expect(typeof DashboardIcon).toBe('function');
    expect(typeof CalendarIcon).toBe('function');
    expect(typeof CheckIcon).toBe('function');
    expect(typeof ChevronDownIcon).toBe('function');
    expect(typeof TimeIcon).toBe('function');
    expect(typeof ChevronLeftIcon).toBe('function');
    expect(typeof ChevronRightIcon).toBe('function');
    expect(typeof ChevronUpIcon).toBe('function');
    expect(typeof CopyIcon).toBe('function');
    expect(typeof EditIcon).toBe('function');
    expect(typeof EditPenIcon).toBe('function');
    expect(typeof ExclamationTriangleIcon).toBe('function');
    expect(typeof ExternalLinkIcon).toBe('function');
    expect(typeof FireIcon).toBe('function');
    expect(typeof FireBIcon).toBe('function');
    expect(typeof FingerprintIcon).toBe('function');
    expect(typeof HeartIcon).toBe('function');
    expect(typeof BookmarkIcon).toBe('function');
    expect(typeof Box3dIcon).toBe('function');
    expect(typeof BoxCheckIcon).toBe('function');
    expect(typeof BuildingTreeIcon).toBe('function');
    expect(typeof ImageIcon).toBe('function');
    expect(typeof MapMarkerIcon).toBe('function');
    expect(typeof InformationCircleIcon).toBe('function');
    expect(typeof LinkIcon).toBe('function');
    expect(typeof MessageIcon).toBe('function');
    expect(typeof MessageRoundIcon).toBe('function');
    expect(typeof NoteTextIcon).toBe('function');
    expect(typeof PlusCircleIcon).toBe('function');
    expect(typeof PlusIcon).toBe('function');
    expect(typeof QuestionMarkCircleIcon).toBe('function');
    expect(typeof RefreshIcon).toBe('function');
    expect(typeof RepeatIcon).toBe('function');
    expect(typeof SaveIcon).toBe('function');
    expect(typeof ScaleDownIcon).toBe('function');
    expect(typeof ScaleUpIcon).toBe('function');
    expect(typeof GiftIcon).toBe('function');
    expect(typeof GlobeIcon).toBe('function');
    expect(typeof HomeIcon).toBe('function');
    expect(typeof NotificationBellIcon).toBe('function');
    expect(typeof UsersIcon).toBe('function');
    expect(typeof UserCircleIcon).toBe('function');
    expect(typeof KeyIcon).toBe('function');
    expect(typeof LogoutIcon).toBe('function');
    expect(typeof UserCheckIcon).toBe('function');
    expect(typeof UserCrossIcon).toBe('function');
    expect(typeof UserIcon).toBe('function');
    expect(typeof UserMinusIcon).toBe('function');
    expect(typeof UserPlusIcon).toBe('function');
    expect(typeof MultiplyIcon).toBe('function');
    expect(typeof TrashIcon).toBe('function');
    expect(typeof UnlockIcon).toBe('function');
    expect(typeof SearchIcon).toBe('function');
    expect(typeof SettingsIcon).toBe('function');
    expect(typeof ShareIcon).toBe('function');
    expect(typeof ShieldCheckIcon).toBe('function');
    expect(typeof SecurityShieldIcon).toBe('function');
    expect(typeof ShopIcon).toBe('function');
    expect(typeof TagIcon).toBe('function');
    expect(typeof StarMovingIcon).toBe('function');
    expect(typeof StarsCIcon).toBe('function');
    expect(typeof StopIcon).toBe('function');
    expect(typeof DotsCircleIcon).toBe('function');
    expect(typeof DownloadIcon).toBe('function');
    expect(typeof DotsHorizontalIcon).toBe('function');
    expect(typeof DotsVerticalIcon).toBe('function');
    expect(typeof SlidersHorizontalIcon).toBe('function');
    expect(typeof VideoPlayerIcon).toBe('function');
    expect(typeof VolumeMuteIcon).toBe('function');
    expect(typeof VolumeUpIcon).toBe('function');
  });
});
