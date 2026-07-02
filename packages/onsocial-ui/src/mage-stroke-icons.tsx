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

/** Mage `filter` — horizontal sliders; page appearance / layout customize. */
export function SlidersHorizontalIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.25 12H8.895m-4.361 0H2.75m18.5 6.607h-5.748m-4.361 0H2.75m18.5-13.214h-3.105m-4.361 0H2.75m13.214 2.18a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm-9.25 6.607a2.18 2.18 0 1 0 0-4.36a2.18 2.18 0 0 0 0 4.36Zm6.607 6.608a2.18 2.18 0 1 0 0-4.361a2.18 2.18 0 0 0 0 4.36Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeMiterlimit={10}
      />
    </MageStrokeSvg>
  );
}

/** Mage `dots-circle` — subtle customize / more affordance (stroke reads larger than fill). */
export function DotsCircleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.736a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346"
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

/** Mage `check` — inline save / confirm affordance. */
export function CheckIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m4.5 11.795l4.221 4.221a1.596 1.596 0 0 0 2.272 0L19.5 7.51"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `trash` — clear profile media. */
export function TrashIcon({
  strokeWidth = 1.75,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.25 6.5h15.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.75 6.5V5.25a1.25 1.25 0 0 1 1.25-1.25h4a1.25 1.25 0 0 1 1.25 1.25V6.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 6.5l.65 11.35a1.25 1.25 0 0 0 1.24 1.15h6.22a1.25 1.25 0 0 0 1.24-1.15L17 6.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 10v5.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.75 10v5.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

/** Mage `camera` — profile / media pickers. */
export function CameraIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M5.833 19.708h12.334a3.083 3.083 0 0 0 3.083-3.083V9.431a3.083 3.083 0 0 0-3.083-3.084h-1.419c-.408 0-.8-.163-1.09-.452l-1.15-1.151a1.54 1.54 0 0 0-1.09-.452h-2.836c-.41 0-.8.163-1.09.452l-1.15 1.151c-.29.29-.682.452-1.09.452H5.833A3.083 3.083 0 0 0 2.75 9.431v7.194a3.083 3.083 0 0 0 3.083 3.083"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 16.625a4.111 4.111 0 1 0 0-8.222a4.111 4.111 0 0 0 0 8.222"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function ChevronRightIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m8.417 20l6.587-6.587a2.013 2.013 0 0 0 0-2.826L8.417 4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function CopyIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M18.327 7.286h-8.044a1.93 1.93 0 0 0-1.925 1.938v10.088c0 1.07.862 1.938 1.925 1.938h8.044a1.93 1.93 0 0 0 1.925-1.938V9.224c0-1.07-.862-1.938-1.925-1.938"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.642 7.286V4.688c0-.514-.203-1.007-.564-1.37a1.92 1.92 0 0 0-1.361-.568H5.673c-.51 0-1 .204-1.36.568a1.95 1.95 0 0 0-.565 1.37v10.088c0 .514.203 1.007.564 1.37s.85.568 1.361.568h2.685"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `edit` — profile / content editing. */
export function EditIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19.09 14.441v4.44a2.37 2.37 0 0 1-2.369 2.369H5.12a2.37 2.37 0 0 1-2.369-2.383V7.279a2.356 2.356 0 0 1 2.37-2.37H9.56"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M6.835 15.803v-2.165c.002-.357.144-.7.395-.953l9.532-9.532a1.36 1.36 0 0 1 1.934 0l2.151 2.151a1.36 1.36 0 0 1 0 1.934l-9.532 9.532a1.36 1.36 0 0 1-.953.395H8.197a1.36 1.36 0 0 1-1.362-1.362M19.09 8.995l-4.085-4.086"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function ExternalLinkIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M18.607 11.035v7.929a2.27 2.27 0 0 1-2.3 2.286H5.05a2.27 2.27 0 0 1-2.299-2.3V7.693a2.273 2.273 0 0 1 2.3-2.3h7.928M21.25 2.75L10.679 13.321M15.964 2.75h5.286v5.286"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function GlobeIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 21.5c2.332 0 4.222-4.253 4.222-9.5S14.332 2.5 12 2.5 7.778 6.753 7.778 12s1.89 9.5 4.222 9.5M2.5 12h19"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function LogoutIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M13.477 21.245H8.34a4.92 4.92 0 0 1-5.136-4.623V7.378A4.92 4.92 0 0 1 8.34 2.755h5.136"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.795 12H7.442"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
      <path
        d="m16.083 17.136 4.404-4.404a1.04 1.04 0 0 0 0-1.464l-4.404-4.404"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function UserIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19.618 21.25c0-3.602-4.016-6.53-7.618-6.53s-7.618 2.928-7.618 6.53M12 11.456a4.353 4.353 0 1 0 0-8.706 4.353 4.353 0 0 0 0 8.706"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}
