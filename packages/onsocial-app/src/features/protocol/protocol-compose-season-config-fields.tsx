'use client';

import { osFieldBorderedClassName } from '@onsocial/ui';

export function ProtocolComposeSeasonConfigFields({
  seasonId,
  onSeasonIdChange,
  seasonLabel,
  onSeasonLabelChange,
  seasonDurationDays,
  onSeasonDurationDaysChange,
  pending = false,
  loading = false,
}: {
  seasonId: string;
  onSeasonIdChange: (value: string) => void;
  seasonLabel: string;
  onSeasonLabelChange: (value: string) => void;
  seasonDurationDays: string;
  onSeasonDurationDaysChange: (value: string) => void;
  pending?: boolean;
  loading?: boolean;
}) {
  const disabled = pending || loading;

  if (loading && !seasonId.trim()) {
    return <p className="protocol-compose-note">Loading rally seasons…</p>;
  }

  return (
    <>
      <label className="guild-field">
        <span>Season id</span>
        <input
          type="text"
          value={seasonId}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="season-three"
          onChange={(event) => onSeasonIdChange(event.target.value)}
          disabled={disabled}
          className={osFieldBorderedClassName}
        />
      </label>
      <label className="guild-field">
        <span>Display name</span>
        <input
          type="text"
          value={seasonLabel}
          onChange={(event) => onSeasonLabelChange(event.target.value)}
          disabled={disabled}
          className={osFieldBorderedClassName}
        />
      </label>
      <label className="guild-field">
        <span>Duration days</span>
        <input
          type="text"
          inputMode="decimal"
          value={seasonDurationDays}
          onChange={(event) => onSeasonDurationDaysChange(event.target.value)}
          disabled={disabled}
          className={osFieldBorderedClassName}
        />
      </label>
      <p className="protocol-compose-note">
        Starts about 10 minutes after submission; end time is derived from
        duration.
      </p>
    </>
  );
}
