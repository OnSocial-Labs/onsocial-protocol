'use client';

import { useState } from 'react';
import {
  minutesToParts,
  partsToMinutes,
  type DurationParts,
} from '@/lib/relative-duration';
import { cn } from '@/lib/utils';

const fieldLabelClass =
  'mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70';

const unitInputClass =
  'portal-field-focus w-full rounded-xl border border-border/40 bg-background/45 px-2 py-2 text-center text-sm font-mono tabular-nums text-foreground outline-none transition-colors focus:border-[var(--portal-blue-border)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const UNIT_FIELDS: Array<{
  key: keyof DurationParts;
  label: string;
  max: number;
}> = [
  { key: 'days', label: 'Days', max: 365 },
  { key: 'hours', label: 'Hrs', max: 23 },
  { key: 'minutes', label: 'Min', max: 59 },
];

export function RelativeDurationFields({
  totalMinutes,
  onTotalMinutesChange,
  className,
  idPrefix,
}: {
  totalMinutes: number;
  onTotalMinutesChange: (minutes: number) => void;
  className?: string;
  idPrefix: string;
}) {
  const parts = minutesToParts(totalMinutes);
  const [editing, setEditing] = useState<
    Partial<Record<keyof DurationParts, string>>
  >({});

  const commitPart = (key: keyof DurationParts) => {
    const rawValue = editing[key];
    if (rawValue === undefined) {
      return;
    }

    const parsed = rawValue.trim() === '' ? 0 : Number(rawValue);
    const max = UNIT_FIELDS.find((field) => field.key === key)!.max;
    const capped = Number.isFinite(parsed)
      ? Math.max(0, Math.min(max, Math.floor(parsed)))
      : 0;

    onTotalMinutesChange(
      partsToMinutes({
        ...minutesToParts(totalMinutes),
        [key]: capped,
      })
    );

    setEditing((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {UNIT_FIELDS.map((field) => (
        <div key={field.key}>
          <label
            className={fieldLabelClass}
            htmlFor={`${idPrefix}-${field.key}`}
          >
            {field.label}
          </label>
          <input
            id={`${idPrefix}-${field.key}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={unitInputClass}
            value={
              editing[field.key] !== undefined
                ? editing[field.key]!
                : String(parts[field.key])
            }
            onFocus={() =>
              setEditing((current) => ({
                ...current,
                [field.key]: String(parts[field.key]),
              }))
            }
            onChange={(event) =>
              setEditing((current) => ({
                ...current,
                [field.key]: event.target.value.replace(/\D/g, ''),
              }))
            }
            onBlur={() => commitPart(field.key)}
          />
        </div>
      ))}
    </div>
  );
}
