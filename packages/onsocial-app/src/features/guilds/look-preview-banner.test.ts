import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('look preview banner parity', () => {
  it('matches profile edit banner overlay and empty affordances', () => {
    for (const file of [
      'guild-look-preview.tsx',
      '../scarces/hub-look-preview.tsx',
    ]) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).toContain('account-editor-banner-backdrop');
      expect(src).toContain('account-editor-banner-empty');
      expect(src).toContain('account-editor-banner-overlay');
      expect(src).toContain('Photo or video');
      expect(src).not.toMatch(/look-preview-banner-empty|cover-empty/);
    }
  });

  it('centers empty hint clear of overlapping mark (hub / guild)', () => {
    const guild = readFileSync(join(root, 'guild-look-preview.tsx'), 'utf8');
    const hub = readFileSync(
      join(root, '../scarces/hub-look-preview.tsx'),
      'utf8'
    );
    expect(guild).toContain('guild-look-preview-banner-hint');
    expect(guild).not.toContain('profile-editor-media-size-hint--dock');
    expect(hub).toContain('hub-look-preview-banner-hint');
    expect(hub).not.toContain('profile-editor-media-size-hint--dock');
  });

  it('wires pan surfaces for hub and guild look previews', () => {
    const guild = readFileSync(join(root, 'guild-look-preview.tsx'), 'utf8');
    const hub = readFileSync(
      join(root, '../scarces/hub-look-preview.tsx'),
      'utf8'
    );
    expect(guild).toContain('MediaFramePanSurface');
    expect(guild).toContain('onBannerPanChange');
    expect(hub).toContain('MediaFramePanSurface');
    expect(hub).toContain('onBannerPanChange');
  });

  it('Edit guild composes look-preview primitives (no media fork)', () => {
    const edit = readFileSync(join(root, 'guild-edit-sheet.tsx'), 'utf8');
    expect(edit).toContain('GuildLookPreview');
    expect(edit).toContain('GuildBadgeWell');
    expect(edit).toContain('prepareProfileBannerForSave');
    expect(edit).toContain('prepareProfileAvatarForSave');
    expect(edit).not.toContain('profile-editor-media-size-hint--dock');
    expect(edit).not.toContain('MediaFramePanSurface');
    expect(edit).not.toContain('guild-edit-badge-picker');
  });

  it('create and edit share face heroes (hub / guild look-preview, DAO portfolio)', () => {
    const hubEdit = readFileSync(
      join(root, '../scarces/hub-manage-sheets.tsx'),
      'utf8'
    );
    const hubCreate = readFileSync(
      join(root, '../scarces/create-app-panel.tsx'),
      'utf8'
    );
    const guildCreate = readFileSync(
      join(root, 'guild-create-panel.tsx'),
      'utf8'
    );
    const daoEdit = readFileSync(
      join(root, '../protocol/dao-edit-sheet.tsx'),
      'utf8'
    );
    const daoCreate = readFileSync(
      join(root, '../protocol/dao-create-panel.tsx'),
      'utf8'
    );
    expect(hubEdit).toContain('HubLookPreview');
    expect(hubCreate).toContain('HubLookPreview');
    expect(guildCreate).toContain('GuildLookPreview');
    expect(daoEdit).toContain('PortfolioFaceEditorHero');
    expect(daoCreate).toContain('PortfolioFaceEditorHero');
    expect(daoCreate).not.toContain('DaoLookPreview');
    expect(daoCreate).not.toContain('subtitle=');
  });

  it('hub / guild look-preview are face-only (no compact layout)', () => {
    for (const file of [
      'guild-look-preview.tsx',
      '../scarces/hub-look-preview.tsx',
    ]) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).not.toContain('data-layout');
      expect(src).not.toContain('compact');
    }
  });
});
