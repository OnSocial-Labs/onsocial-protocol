import type { ReactNode } from 'react';
import { cn } from './cn.js';

/** Transparent fill + 1px border + inset lip — glass/mood tint shows through. */
export const osFieldBorderedClassName = 'os-field-bordered';

/** Quiet wash, no border — dense stacks off glass (protocol, lyrics, endorse). */
export const osFieldSoftClassName = 'os-field-soft';

/** Label stack wrapper class — pair with `os-field.css`. */
export const osFieldClassName = 'os-field';

/**
 * Field surface chrome.
 * - `bordered` — default on glass create/edit forms (tint shows through)
 * - `soft` — dense / non-glass sheets
 */
export type OsFieldChrome = 'bordered' | 'soft';

export interface OsFieldProps {
  /** Visible label above the control. */
  label?: ReactNode;
  /** Hint / counter under the control. */
  hint?: ReactNode;
  /** Optional `htmlFor` when wrapping a single labelled control. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint stack. Apply {@link osFieldBorderedClassName} /
 * {@link osFieldSoftClassName} on the child input, textarea, or amount wrapper.
 */
export function OsField({
  label,
  hint,
  htmlFor,
  className,
  children,
}: OsFieldProps) {
  const Tag = htmlFor ? 'label' : 'div';
  return (
    <Tag
      className={cn(osFieldClassName, className)}
      {...(htmlFor ? { htmlFor } : {})}
    >
      {label ? <span className="os-field-label">{label}</span> : null}
      {children}
      {hint ? <small className="os-field-hint">{hint}</small> : null}
    </Tag>
  );
}
