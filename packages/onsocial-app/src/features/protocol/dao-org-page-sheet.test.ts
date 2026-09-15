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
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('DAO org page overlay', () => {
  it('wraps Members / Treasury in OsPageSheet like Proposals', () => {
    expect(wrapper).toContain('export const DAO_ORG_PAGE_Z = 45');
    expect(wrapper).toContain('OsPageSheet');
    expect(wrapper).toContain('surface="page"');
    expect(wrapper).toContain('presentation="appear"');
    expect(wrapper).toContain('keepDock');
    expect(wrapper).toContain('OsAppScreen');
    expect(wrapper).toContain('embedded');
    expect(wrapper).toContain('dockBack');
    expect(wrapper).toContain('useDaoPageMood');
    expect(members).toContain('DaoOrgPageSheet');
    expect(members).not.toContain('DaoPageSlideOverScreen');
    expect(members).not.toContain('dao-members-slide');
    expect(treasury).toContain('DaoOrgPageSheet');
    expect(treasury).not.toContain('DaoPageSlideOverScreen');
    expect(treasury).not.toContain('dao-treasury-slide');
  });

  it('leaves Edit / Boost on the DAO slide-over', () => {
    expect(edit).toContain('DaoPageSlideOverScreen');
    expect(edit).not.toContain('DaoOrgPageSheet');
    expect(boost).toContain('DaoPageSlideOverScreen');
    expect(boost).not.toContain('DaoOrgPageSheet');
  });

  it('pads Members / Treasury as a keep-dock page, not a slide-over', () => {
    expect(globalsCss).toContain('.dao-org-page .dao-org-page-content');
    expect(globalsCss).toMatch(
      /\.glass-sheet-panel\.dao-org-page > \.glass-sheet-body\.dao-org-page-body/
    );
    expect(globalsCss).not.toContain('dao-members-slide');
    expect(globalsCss).not.toContain('dao-treasury-slide');
  });
});
