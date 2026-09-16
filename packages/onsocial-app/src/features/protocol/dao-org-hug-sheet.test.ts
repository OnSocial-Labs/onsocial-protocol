import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const wrapper = readFileSync(join(here, 'dao-org-hug-sheet.tsx'), 'utf8');
const members = readFileSync(join(here, 'dao-members-sheet.tsx'), 'utf8');
const treasury = readFileSync(join(here, 'dao-treasury-sheet.tsx'), 'utf8');
const info = readFileSync(join(here, 'protocol-dao-info-sheet.tsx'), 'utf8');
const edit = readFileSync(join(here, 'dao-edit-sheet.tsx'), 'utf8');
const boost = readFileSync(join(here, 'dao-boost-sheet.tsx'), 'utf8');
const proposals = readFileSync(join(here, 'dao-workspace-panel.tsx'), 'utf8');
const chrome = readFileSync(
  join(here, '../../components/portfolio/portfolio-dao-org-chrome.tsx'),
  'utf8'
);
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('DAO org hug drawers', () => {
  it('wraps Members / Treasury / Info in a full-detent OsHugSheet', () => {
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
    expect(info).toContain('DaoOrgHugSheet');
    expect(info).toContain('SheetFactSection');
    expect(info).toContain('formatDaoRoleLabel');
    expect(info).toContain('OsSheetFooter');
    expect(info).not.toContain('ProtocolTaskSheet');
    expect(info).not.toContain("primaryLabel: 'Close'");
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
    expect(edit).toContain('DaoLookPreview');
    expect(edit).toContain("DaoEditSheetMode = 'config' | 'social'");
    expect(edit).toContain("mode = 'config'");
    expect(edit).toContain('PROFILE_BIO_MAX');
    expect(edit).toContain('What this DAO stewards');
    expect(edit).toContain('Publishes as a config proposal');
    expect(edit).not.toContain('dao-edit-footnote');
    expect(edit).not.toContain('face shows a short excerpt');
    expect(edit).not.toContain('Also publish OnSocial profile');
    expect(edit).not.toContain('DaoOrgHugSheet');
    expect(boost).toContain('DaoPageSlideOverScreen');
    expect(boost).not.toContain('DaoOrgHugSheet');
  });

  it('reuses Create DAO look preview for Edit cover + crest', () => {
    expect(edit).toContain('DaoLookPreview');
    expect(edit).not.toContain('Cover + square crest — same look');
    expect(globalsCss).toContain('.dao-look-preview-cover');
    expect(globalsCss).not.toContain('.dao-edit-cover:not(.has-media)');
  });

  it('batches OnSocial publish on config Edit with a wallet slider', () => {
    expect(edit).toContain('resolveDaoEditBaseline');
    expect(edit).toContain('submitProtocolProposals');
    expect(edit).toContain('account-action-toggle dao-edit-publish');
    expect(edit).toContain('account-safe-mode-switch');
    expect(edit).toContain('DAO_CREATE_PUBLISH');
    expect(edit).toContain('DAO_EDIT_PUBLISH_HINT');
    expect(edit).toContain('bondCount');
    expect(edit).toContain('clampProfileBioFace');
    expect(edit).toContain('label="Face"');
    expect(edit).toContain('ProfileAboutEditorSheet');
    expect(edit).toContain('account-editor-about-trigger');
  });

  it('pads Members / Treasury / Info as a hug list, not a page overlay', () => {
    expect(globalsCss).toContain('.dao-org-hug-content');
    expect(globalsCss).toContain('.dao-info-lead');
    expect(globalsCss).not.toContain('.dao-org-page .dao-org-page-content');
    expect(globalsCss).not.toMatch(
      /\.glass-sheet-panel\.dao-org-page > \.glass-sheet-body\.dao-org-page-body/
    );
    expect(globalsCss).not.toContain('dao-members-slide');
    expect(globalsCss).not.toContain('dao-treasury-slide');
    expect(globalsCss).not.toContain('protocol-dao-info-eyebrow');
  });

  it('pins Members stake CTA and Info actions in the hug footer', () => {
    expect(wrapper).toContain('footer={footer}');
    expect(members).toContain('footer={stakeFooter}');
    expect(members).toContain('OsSheetFooter');
    expect(members).not.toContain('dao-members-stake-footer');
    expect(members).not.toContain('dao-members-stake-actions');
    expect(info).toContain('footer={footer}');
    expect(info).not.toContain('protocol-dao-info-actions');
  });

  it('opens a long DAO face bio in a hug drawer, not About', () => {
    const faceBio = readFileSync(
      join(here, '../../components/portfolio/portfolio-face-bio.tsx'),
      'utf8'
    );
    expect(faceBio).toContain('OsHugSheet');
    expect(faceBio).toContain('Close bio');
    expect(faceBio).toContain('Read full bio');
    expect(faceBio).toContain('daoFaceBioOverflows');
    expect(faceBio).not.toContain('DropArt');
    expect(faceBio).not.toContain('OsPageSheet');
  });

  it('lands raised proposals on the proposal page instead of the face', () => {
    expect(chrome).toContain('openDaoSubmittedProposal');
    expect(chrome).toContain("setOverlay('proposals')");
    expect(edit).toContain('onProposed?.(socialResponse.proposalId)');
    expect(boost).toContain('onProposed?.(response.proposalId)');
    expect(proposals).toContain(
      'openDaoSubmittedProposal(daoAccountId, proposalId)'
    );
  });
});
