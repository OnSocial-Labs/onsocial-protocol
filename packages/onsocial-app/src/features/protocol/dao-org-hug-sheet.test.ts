import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, 'dao-org-hug-sheet.tsx'), 'utf8');
const members = readFileSync(join(here, 'dao-members-sheet.tsx'), 'utf8');
const treasury = readFileSync(join(here, 'dao-treasury-sheet.tsx'), 'utf8');
const edit = readFileSync(join(here, 'dao-edit-sheet.tsx'), 'utf8');
const boost = readFileSync(join(here, 'dao-boost-sheet.tsx'), 'utf8');
const proposals = readFileSync(join(here, 'dao-workspace-panel.tsx'), 'utf8');
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('DAO org hug drawers', () => {
  it('wraps Members / Treasury in a full-detent OsHugSheet', () => {
    expect(wrapper).toContain('OsHugSheet');
    expect(wrapper).toContain('sizing="hug"');
    expect(wrapper).toContain('initialDetent="full"');
    expect(wrapper).toContain('os-sheet-cap-standard');
    expect(wrapper).toContain('SHEET_Z.list');
    expect(wrapper).toContain('closeAriaLabel');
    expect(wrapper).toContain('useDaoPageMood');
    expect(wrapper).not.toContain('OsPageSheet');
    expect(wrapper).not.toContain('OsAppScreen');
    expect(wrapper).not.toContain('keepDock');
    expect(wrapper).not.toContain('dockBack');
    expect(wrapper).not.toContain('presentation="appear"');
    expect(wrapper).not.toContain('surface="page"');
    expect(members).toContain('DaoOrgHugSheet');
    expect(members).not.toContain('DaoPageSlideOverScreen');
    expect(members).not.toContain('dao-members-slide');
    expect(members).not.toContain('dao-members-page');
    expect(members).not.toContain('setMounted');
    expect(members).not.toContain('onClosed');
    expect(treasury).toContain('DaoOrgHugSheet');
    expect(treasury).not.toContain('DaoPageSlideOverScreen');
    expect(treasury).not.toContain('dao-treasury-slide');
    expect(treasury).not.toContain('dao-treasury-page');
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
    expect(edit).not.toContain('DaoOrgHugSheet');
    expect(boost).toContain('DaoPageSlideOverScreen');
    expect(boost).not.toContain('DaoOrgHugSheet');
  });

  it('pads Members / Treasury as a hug list, not a page overlay', () => {
    expect(globalsCss).toContain('.dao-org-hug-content');
    expect(globalsCss).not.toContain('.dao-org-page .dao-org-page-content');
    expect(globalsCss).not.toMatch(
      /\.glass-sheet-panel\.dao-org-page > \.glass-sheet-body\.dao-org-page-body/
    );
    expect(globalsCss).not.toContain('dao-members-slide');
    expect(globalsCss).not.toContain('dao-treasury-slide');
  });

  it('pins Members stake CTA in the hug footer, not inside the panel', () => {
    expect(wrapper).toContain('footer={footer}');
    expect(members).toContain('footer={stakeFooter}');
    expect(members).toContain('OsSheetFooter');
    expect(members).not.toContain('dao-members-stake-footer');
    expect(members).not.toContain('dao-members-stake-actions');
  });
});
