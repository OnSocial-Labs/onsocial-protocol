import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Divider } from './divider.js';

/** Transparent fill + cool border / inset lip — default on mood surfaces. */
export const osFieldBorderedClassName = 'os-field-bordered';

/** Quiet wash, no border — dense / quiet OS sheets without mood wash. */
export const osFieldSoftClassName = 'os-field-soft';

/**
 * Spoken line — no box. Digits use the page face. A detail rule sits under
 * them, quiet at rest and solid while the field is focused.
 */
export const osFieldPlainClassName = 'os-field-plain';

/** Label stack wrapper class — pair with `os-field.css`. */
export const osFieldClassName = 'os-field';

export const osFieldPlainValueClassName = 'os-field-plain-value';
export const osFieldPlainRuleClassName = 'os-field-plain-rule';

export type OsFieldChrome = 'bordered' | 'soft';

/** Box chrome, or the spoken line used by create-drop supply and price. */
export type OsAffixChrome = OsFieldChrome | 'plain';

export function osAffixChromeClassName(chrome: OsAffixChrome): string {
  if (chrome === 'plain') return osFieldPlainClassName;
  if (chrome === 'soft') return osFieldSoftClassName;
  return osFieldBorderedClassName;
}

/** Digits plus the detail rule. The unit stays a sibling on the affix shell. */
export function OsFieldPlainValue({ children }: { children: ReactNode }) {
  return (
    <span className={osFieldPlainValueClassName}>
      {children}
      <Divider variant="detail" className={osFieldPlainRuleClassName} />
    </span>
  );
}

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
 * Label + control + hint stack. Apply `osFieldBorderedClassName` /
 * `osFieldSoftClassName` on the child input, textarea, or amount wrapper.
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
