import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scarcesDir = dirname(fileURLToPath(import.meta.url));

describe('hub drawer handoff wiring', () => {
  it('keeps facts mounted and opens the next drawer in the same turn', () => {
    const panel = readFileSync(join(scarcesDir, 'app-page-panel.tsx'), 'utf8');
    const facts = readFileSync(join(scarcesDir, 'hub-info-sheets.tsx'), 'utf8');
    const settings = readFileSync(
      join(scarcesDir, 'hub-settings-sheet.tsx'),
      'utf8'
    );

    expect(panel).toContain('open={factsOpen}');
    expect(panel).not.toContain('factsOpen ? (');
    expect(panel).toContain('replaceSheet()');
    expect(panel).not.toContain('hubSettingsHandoffIsReplace');
    expect(panel).not.toContain('setSheetHandoff');
    expect(panel).not.toContain('SheetHandoffProvider');
    expect(panel).not.toContain('pendingManageSheet');
    expect(panel).not.toContain('HubPeopleSheet');
    expect(settings).not.toContain('showPeople');
    expect(settings).not.toContain('label="People"');
    expect(facts).toContain('if (open) setClosing(false)');
    expect(facts).toContain('UserPlusFillIcon');
    expect(facts).toContain('HubAddRosterSheet');
  });
});
