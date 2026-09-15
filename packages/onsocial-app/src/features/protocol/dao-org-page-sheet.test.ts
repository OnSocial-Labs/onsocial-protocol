import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, 'dao-org-page-sheet.tsx'), 'utf8');
const members = readFileSync(join(here, 'dao-members-sheet.tsx'), 'utf8');
const treasury = readFileSync(join(here, 'dao-treasury-sheet.tsx'), 'utf8');
const edit = readFileSync(join(here, 'dao-edit-sheet.tsx'), 'utf8');
const boost = readFileSync(join(here, 'dao-boost-sheet.tsx'), 'utf8');
const proposals = readFileSync(join(here, 'dao-workspace-panel.tsx'), 'utf8');
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('DAO org page overlay', () => {
  it('wraps Members / Treasury in a thin OsPageSheet overlay', () => {
    expect(wrapper).toContain('OsPageSheet');
    expect(wrapper).toContain('SheetHeader');
    expect(wrapper).toContain('surface="page"');
    expect(wrapper).toContain('presentation="appear"');
    expect(wrapper).toContain('SHEET_Z.list');
    expect(wrapper).toContain('closeAriaLabel');
    expect(wrapper).toContain('useDaoPageMood');
    expect(wrapper).not.toContain('DAO_ORG_PAGE_Z');
    expect(wrapper).not.toContain('OsAppScreen');
    expect(wrapper).not.toContain('keepDock');
    expect(wrapper).not.toContain('dockBack');
    expect(wrapper).not.toContain('MultiplyIcon');
    expect(wrapper).not.toContain('OsIconAction');
    expect(members).toContain('DaoOrgPageSheet');
    expect(members).not.toContain('DaoPageSlideOverScreen');
    expect(members).not.toContain('dao-members-slide');
    expect(members).not.toContain('setMounted');
    expect(members).not.toContain('onClosed');
    expect(treasury).toContain('DaoOrgPageSheet');
    expect(treasury).not.toContain('DaoPageSlideOverScreen');
    expect(treasury).not.toContain('dao-treasury-slide');
    expect(treasury).not.toContain('setMounted');
    expect(treasury).not.toContain('onClosed');
  });

  it('leaves Proposals on the keep-dock OsAppScreen page', () => {
    expect(proposals).toContain('OsAppScreen');
    expect(proposals).toContain('keepDock');
    expect(proposals).toContain('dockBack');
    expect(proposals).toContain('MultiplyIcon');
    expect(proposals).toContain('Close proposals');
    expect(proposals).not.toContain('leading={null}');
  });

  it('leaves Edit / Boost on the DAO slide-over', () => {
    expect(edit).toContain('DaoPageSlideOverScreen');
    expect(edit).not.toContain('DaoOrgPageSheet');
    expect(boost).toContain('DaoPageSlideOverScreen');
    expect(boost).not.toContain('DaoOrgPageSheet');
  });

  it('pads Members / Treasury as an overlay list, not a keep-dock page', () => {
    expect(globalsCss).toContain('.dao-org-page .dao-org-page-content');
    expect(globalsCss).toMatch(
      /\.glass-sheet-panel\.dao-org-page > \.glass-sheet-body\.dao-org-page-body/
    );
    expect(globalsCss).not.toMatch(
      /\.glass-sheet-panel\.dao-org-page \.os-app-screen--embedded/
    );
    expect(globalsCss).not.toContain(
      ".glass-sheet-root[data-keep-dock='true'] .dao-org-page .dao-org-page-content"
    );
    expect(globalsCss).not.toContain('dao-members-slide');
    expect(globalsCss).not.toContain('dao-treasury-slide');
  });
});
