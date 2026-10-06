import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared SDK method list. `plain` renders check-icon rows (hub cards);
 * `boxed` renders pill rows (family guides). Both wrap long slash-joined
 * method strings so mobile viewports never overflow.
 */
export function MethodList({
  items,
  variant = 'plain',
}: {
  items: string[];
  variant?: 'plain' | 'boxed';
}) {
  if (variant === 'boxed') {
    return (
      <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li
            key={item}
            className="min-w-0 break-words rounded-[0.75rem] border border-border/30 bg-background/35 px-3 py-2 font-mono text-xs text-portal-neutral md:text-sm"
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex min-w-0 gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span className="break-words font-mono text-xs leading-5 text-portal-neutral">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}
