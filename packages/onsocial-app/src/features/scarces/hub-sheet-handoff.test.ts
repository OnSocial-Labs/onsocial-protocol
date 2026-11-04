import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hubSettingsHandoffIsReplace } from '@/features/scarces/hub-sheet-handoff';

const scarcesDir = dirname(fileURLToPath(import.meta.url));

describe('hubSettingsHandoffIsReplace', () => {
  it('replaces hug successors and defers slide-overs', () => {
    expect(hubSettingsHandoffIsReplace('transfer')).toBe(true);
    expect(hubSettingsHandoffIsReplace('publish-requests')).toBe(true);
    expect(hubSettingsHandoffIsReplace('look')).toBe(false);
    expect(hubSettingsHandoffIsReplace('access')).toBe(false);
  });
});

describe('hub drawer handoff wiring', () => {
  it('keeps facts mounted and defers slide-overs after settings close', () => {
    const panel = readFileSync(join(scarcesDir, 'app-page-panel.tsx'), 'utf8');
    const facts = readFileSync(join(scarcesDir, 'hub-info-sheets.tsx'), 'utf8');
    const settings = readFileSync(
      join(scarcesDir, 'hub-settings-sheet.tsx'),
      'utf8'
    );

    expect(panel).toContain('open={factsOpen}');
    expect(panel).not.toContain('factsOpen ? (');
    expect(panel).toContain('hubSettingsHandoffIsReplace');
    expect(panel).toContain('pendingManageSheet');
    expect(panel).toContain('setPendingManageSheet(sheet)');
    expect(panel).not.toContain('HubPeopleSheet');
    expect(settings).not.toContain('showPeople');
    expect(settings).not.toContain('label="People"');
    // One provider wraps facts + creators + settings + hug successors.
    const providers = panel.match(/<SheetHandoffProvider/g) ?? [];
    expect(providers.length).toBe(1);
    expect(facts).toContain('if (open) setClosing(false)');
    expect(facts).toContain('UserPlusFillIcon');
    expect(facts).toContain('HubAddRosterSheet');
  });
});
