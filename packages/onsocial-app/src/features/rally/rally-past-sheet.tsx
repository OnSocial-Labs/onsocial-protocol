'use client';

import { OsHugSheet } from '@onsocial/ui';
import {
  formatRallySeasonDates,
  resolveRallyPastRowBadge,
  resolveRallyPresentation,
  type RallyClaimRecord,
  type RallyRegistryEntry,
} from '@/lib/rally-season';
import { SHEET_Z } from '@/lib/sheet-z';

export type RallyPastSheetProps = {
  open: boolean;
  entries: RallyRegistryEntry[];
  claims: Record<string, RallyClaimRecord | null | undefined>;
  isConnected: boolean;
  onSelect: (seasonId: string) => void;
  onClose: () => void;
  zIndex?: number;
};

/** Past rallies — each row answers "did I get anything, can I still take it". */
export function RallyPastSheet({
  open,
  entries,
  claims,
  isConnected,
  onSelect,
  onClose,
  zIndex = SHEET_Z.list,
}: RallyPastSheetProps) {
  const countLabel =
    entries.length === 1 ? '1 past rally' : `${entries.length} past rallies`;

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Past rallies"
      copy={countLabel}
      closeAriaLabel="Close past rallies"
      backdropLabel="Close past rallies"
      zIndex={zIndex}
      panelClassName="rally-past-sheet-panel os-sheet-cap-standard"
      bodyClassName="rally-past-sheet-body"
    >
      <ul className="rally-past-list" aria-label="Past rallies">
        {entries.map((entry) => {
          const presentation = resolveRallyPresentation(
            entry.seasonId,
            entry.label
          );
          const dates = formatRallySeasonDates(entry);
          const badge = resolveRallyPastRowBadge({
            entry,
            claim: claims[entry.seasonId],
            isConnected,
          });
          return (
            <li key={entry.seasonId} className="rally-past-list-item">
              <button
                type="button"
                className="rally-past-row"
                onClick={() => onSelect(entry.seasonId)}
              >
                <span className="rally-past-row-main">
                  <span className="rally-past-row-name">
                    {presentation.pageTitle}
                  </span>
                  {dates ? (
                    <span className="rally-past-row-dates">{dates}</span>
                  ) : null}
                </span>
                {badge.tone === 'loading' ? (
                  <span
                    className="standing-row-shimmer rally-past-row-badge rally-past-row-badge--loading"
                    aria-hidden
                  />
                ) : (
                  <span
                    className={`rally-past-row-badge rally-past-row-badge--${badge.tone}`}
                  >
                    {badge.label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </OsHugSheet>
  );
}
