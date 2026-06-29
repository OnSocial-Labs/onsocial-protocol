import type { ReactNode, SVGProps } from 'react';

export type MageStrokeIconProps = Pick<
  SVGProps<SVGSVGElement>,
  'className' | 'aria-hidden'
>;

function MageStrokeSvg({
  className,
  children,
  ...props
}: MageStrokeIconProps & { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Mage stroke paths — camelCase attrs for React 19. */
export function ChevronDownIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4 8.41693L10.5866 15.0037C10.9633 15.375 11.471 15.5831 12 15.5831C12.529 15.5831 13.0367 15.375 13.4134 15.0037L20 8.41693"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

export function MultiplyIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19 5L5 19"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 19L5 5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

export function SearchIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M10.7828 18.8276C12.3741 18.8298 13.9302 18.3601 15.2544 17.4781C16.5785 16.596 17.6112 15.3413 18.2216 13.8726C18.832 12.4039 18.9929 10.7872 18.6837 9.2271C18.3746 7.66702 17.6093 6.23364 16.4849 5.10831C15.3604 3.98299 13.9272 3.2163 12.3666 2.90525C10.8061 2.5942 9.18823 2.75277 7.71786 3.3609C6.24748 3.96902 4.99062 4.99937 4.10632 6.32158C3.22202 7.64379 2.75 9.19844 2.75 10.7888C2.75 12.919 3.59596 14.9621 5.10209 16.4693C6.60821 17.9766 8.65135 18.8248 10.7828 18.8276Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.4883 16.491L21.25 21.25"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

export function ArrowUpRightIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M17.6568 6.34315L6.34314 17.6569"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M18.101 16.7327L18.101 7.4373C18.1019 7.23513 18.0627 7.03471 17.9856 6.84767C17.9086 6.66062 17.7953 6.4907 17.6523 6.34768C17.5093 6.20465 17.3394 6.09137 17.1523 6.01443C16.9653 5.93732 16.7649 5.89814 16.5627 5.89898L7.2673 5.89899"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

export function ArrowLeftIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4 12L20 12"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M11.0325 4.33939L4.45961 10.9122C4.31606 11.0546 4.20206 11.224 4.12432 11.4108C4.04646 11.5975 4.00641 11.7977 4.00641 12C4.00641 12.2023 4.04646 12.4025 4.12432 12.5892C4.20206 12.776 4.31606 12.9454 4.45961 13.0877L11.0325 19.6606"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}
