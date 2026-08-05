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
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 19L5 5"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.4883 16.491L21.25 21.25"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeMiterlimit={10}
      />
    </MageStrokeSvg>
  );
}

/** Mage `settings` — gear for settings hubs / configuration entry. */
export function SettingsIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12.132 15.404a3.364 3.364 0 1 0 0-6.728a3.364 3.364 0 0 0 0 6.728"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.983 15.094a9.4 9.4 0 0 1-1.802 3.1l-2.124-.482a7.25 7.25 0 0 1-2.801 1.56l-.574 2.079a9.5 9.5 0 0 1-1.63.149a9 9 0 0 1-2.032-.23l-.609-2.146a7.5 7.5 0 0 1-2.457-1.493l-2.1.54a9.4 9.4 0 0 1-1.837-3.33l1.55-1.722a7.2 7.2 0 0 1 .069-2.652L3.107 8.872a9.4 9.4 0 0 1 2.067-3.353l2.17.54A7.7 7.7 0 0 1 9.319 4.91l.574-2.124a9 9 0 0 1 2.17-.287c.585 0 1.17.054 1.745.16l.551 2.113c.83.269 1.608.68 2.296 1.217l2.182-.563a9.4 9.4 0 0 1 2.043 3.1l-1.48 1.607a7.4 7.4 0 0 1 .068 3.364z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.736a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

/** Vertical more menu — three dots without the circle frame. */
export function DotsVerticalIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 7.736a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346m0 4.937a.673.673 0 1 0 0-1.346a.673.673 0 0 0 0 1.346"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

/** Horizontal more menu — three dots for trailing post/row actions. */
export function DotsHorizontalIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M7.736 12a.673.673 0 1 0-1.346 0a.673.673 0 0 0 1.346 0m4.937 0a.673.673 0 1 0-1.346 0a.673.673 0 0 0 1.346 0m4.937 0a.673.673 0 1 0-1.346 0a.673.673 0 0 0 1.346 0"
        stroke="currentColor"
        strokeWidth={2}
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
  strokeWidth = 2,
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
  strokeWidth = 2,
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
  strokeWidth = 2,
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

/** Mage `note-text` — text card / written cover. */
export function NoteTextIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M20.221 17.084v-8.11a4.166 4.166 0 0 0-4.166-4.197h-8.11A4.166 4.166 0 0 0 3.78 8.944v8.11a4.166 4.166 0 0 0 4.166 4.196h8.11a4.166 4.166 0 0 0 4.166-4.166M16.055 6.805V2.75m-8.11 4.055V2.75m-.507 8.11h9.124m-9.124 5.068h9.124"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `image` — still photo / picture cover. */
export function ImageIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M16.24 3.5h-8.5a5 5 0 0 0-5 5v7a5 5 0 0 0 5 5h8.5a5 5 0 0 0 5-5v-7a5 5 0 0 0-5-5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="m2.99 17 2.75-3.2a2.2 2.2 0 0 1 2.77-.27a2.2 2.2 0 0 0 2.77-.27l2.33-2.33a4 4 0 0 1 5.16-.43l2.49 1.93M7.99 10.17a1.66 1.66 0 1 0 0-3.32a1.66 1.66 0 0 0 0 3.32"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `video-player` — video frame / clip cover. */
export function VideoPlayerIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M3.196 7.873h17.608m-4.997 0V2.877M8.193 7.873V2.877m1.947 9.051v4.922c0 .101.032.2.091.286c.06.085.145.154.246.199a.66.66 0 0 0 .633-.057l3.798-2.65a.56.56 0 0 0 .176-.199a.5.5 0 0 0-.02-.492a.6.6 0 0 0-.192-.186l-3.798-2.272a.66.66 0 0 0-.616-.025a.6.6 0 0 0-.232.198a.5.5 0 0 0-.086.276"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        width="18.5"
        height="18.5"
        x="2.75"
        y="2.75"
        rx="6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
      />
    </MageStrokeSvg>
  );
}

export function ChevronLeftIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m15.583 20l-6.587-6.587a2.013 2.013 0 0 1 0-2.826L15.583 4"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.642 7.286V4.688c0-.514-.203-1.007-.564-1.37a1.92 1.92 0 0 0-1.361-.568H5.673c-.51 0-1 .204-1.36.568a1.95 1.95 0 0 0-.565 1.37v10.088c0 .514.203 1.007.564 1.37s.85.568 1.361.568h2.685"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Default Mage stroke weight — 2px unless fill. */
const MAGE_STROKE = 2;

/** Mage `message-round` — reply / conversation affordance. */
export function MessageRoundIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.25 12a9.23 9.23 0 0 1-2.705 6.54A9.25 9.25 0 0 1 12 21.25a9.2 9.2 0 0 1-3.795-.81l-3.867.572a1.195 1.195 0 0 1-1.361-1.43l.537-3.923A8.9 8.9 0 0 1 2.75 12a9.23 9.23 0 0 1 2.705-6.54A9.25 9.25 0 0 1 12 2.75a9.26 9.26 0 0 1 6.545 2.71A9.24 9.24 0 0 1 21.25 12"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** @deprecated Use MessageRoundIcon */
export const MessageIcon = MessageRoundIcon;

/** Mage `exchange-b` — quote / repost cycle affordance. */
export function RepeatIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19.75 6.75h-12a4 4 0 0 0-4 4v2m16-1v2a4 4 0 0 1-4 4h-12"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="m16.75 9.75l3-3l-3-3m-10 11l-3 3l3 3"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `refresh` — renew / restart commitment. */
export function RefreshIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M17.605 7.705A7.9 7.9 0 0 0 12 5.382a7.93 7.93 0 0 0-7.929 7.929A7.94 7.94 0 0 0 12 21.25a7.94 7.94 0 0 0 7.929-7.94"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
      <path
        d="m16.88 2.75l.95 3.858a1.33 1.33 0 0 1-.97 1.609l-3.869.948"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage-style `unlocked` — release a completed boost commitment. */
export function UnlockIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M6.75 10.75h10.5a2.5 2.5 0 0 1 2.5 2.5v5.5a2.5 2.5 0 0 1-2.5 2.5H6.75a2.5 2.5 0 0 1-2.5-2.5v-5.5a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.25 10.75v-3.5a3.75 3.75 0 0 1 7.3-1.2"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 14.5v2.5"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `heart` — like idle state; pair with HeartFillIcon when active. */
export function HeartIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 7.23c-1.733-3.924-5.764-4.273-7.641-2.562c-1.529 1.373-2.263 4.665-.867 7.695C5.9 17.573 12 20.309 12 20.309s6.101-2.736 8.508-7.946c1.396-3.03.662-6.322-.867-7.695C17.764 2.957 13.733 3.306 12 7.229"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `fire-a` — Hot sort idle; pair with FireFillIcon when Hot is selected. */
export function FireIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.21053 14.4342C4.21053 20.762 10.0526 21.25 12 21.25C13.9474 21.25 19.7895 20.762 19.7895 14.4342C19.7895 11.5651 16.9711 10.6621 15.8947 6.64474C9.07895 14.4342 10.0526 2.75 10.0526 2.75C10.0526 2.75 4.21053 8.59211 4.21053 14.4342Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.01979 13.6936C7.59763 15.8631 9.3648 17.556 11.0445 17.8829"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `fire-b` — amplify idle; pair with FireBFillIcon when viewer amplified. */
export function FireBIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M20.17 13.344c0-4.368-3.953-4.23-3.953-10.594C9.763 4.341 9.23 7.365 9.23 12.988c-1.463.149-2.797-2.273-3.637-3.597c-3.874 5.07-1.235 11.859 6.67 11.859a7.906 7.906 0 0 0 7.907-7.906"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16.938 12.988a5.11 5.11 0 0 1-5.93 4.942"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `clock` / time — chronological / Recent feed sort (idle). */
export function TimeIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m15.172 15.172l-3.167-3.167V5.672"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `edit-pen` — profile / inline edit affordance. */
export function EditPenIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m4.144 16.735l.493-3.425a.97.97 0 0 1 .293-.587l9.665-9.664a1.03 1.03 0 0 1 .973-.281a5.1 5.1 0 0 1 2.346 1.372a5.1 5.1 0 0 1 1.384 2.346a1.07 1.07 0 0 1-.282.973l-9.664 9.664a1.17 1.17 0 0 1-.598.294l-3.437.492a1.044 1.044 0 0 1-1.173-1.184m8.633-11.846l4.41 4.398M3.79 21.25h16.42"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M6.835 15.803v-2.165c.002-.357.144-.7.395-.953l9.532-9.532a1.36 1.36 0 0 1 1.934 0l2.151 2.151a1.36 1.36 0 0 1 0 1.934l-9.532 9.532a1.36 1.36 0 0 1-.953.395H8.197a1.36 1.36 0 0 1-1.362-1.362M19.09 8.995l-4.085-4.086"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 21.5c2.332 0 4.222-4.253 4.222-9.5S14.332 2.5 12 2.5 7.778 6.753 7.778 12s1.89 9.5 4.222 9.5M2.5 12h19"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage stroke `gift` — reward and collect surfaces. */
export function GiftIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.80556 12V19.1944C4.80556 19.7396 5.02212 20.2624 5.40761 20.6479C5.79311 21.0334 6.31595 21.25 6.86111 21.25H17.1389C17.6841 21.25 18.2069 21.0334 18.5924 20.6479C18.9779 20.2624 19.1944 19.7396 19.1944 19.1944V12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M19.7083 6.86108H4.29167C3.44023 6.86108 2.75 7.55131 2.75 8.40275V10.4583C2.75 11.3097 3.44023 12 4.29167 12H19.7083C20.5598 12 21.25 11.3097 21.25 10.4583V8.40275C21.25 7.55131 20.5598 6.86108 19.7083 6.86108Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M6.92278 6.86111C6.01834 5.71 5.83334 2.75 8.91667 2.75C12.4111 2.75 11.9486 6.86111 12 6.86111C12.0514 6.86111 11.6403 2.75 15.0833 2.75C18.1667 2.75 17.9611 5.71 17.0567 6.86111"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 21.25V6.86108"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.795 12H7.442"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
      <path
        d="m16.083 17.136 4.404-4.404a1.04 1.04 0 0 0 0-1.464l-4.404-4.404"
        stroke="currentColor"
        strokeWidth={2}
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `user-plus` — add / stand-with affordance. */
export function UserPlusIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12.125 14.719c-3.6 0-7.62 2.928-7.62 6.526m7.62-9.785a4.36 4.36 0 0 0 4.035-2.683a4.355 4.355 0 0 0-3.17-5.948a4.362 4.362 0 0 0-5.215 4.274a4.356 4.356 0 0 0 4.35 4.357"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16.488 14.983v5.997m-2.993-2.992h6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `user-minus` — remove / step-back affordance. */
export function UserMinusIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12.125 14.719c-3.6 0-7.62 2.928-7.62 6.526m7.62-9.785a4.36 4.36 0 0 0 4.035-2.683a4.355 4.355 0 0 0-3.17-5.948a4.362 4.362 0 0 0-5.215 4.274a4.356 4.356 0 0 0 4.35 4.357"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M13.495 17.988h6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `star-moving` — Hubs mark (stroke). */
export function StarMovingIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m14.524 17.649l3.513 1.84a.87.87 0 0 0 .941-.063a.9.9 0 0 0 .307-.392a.96.96 0 0 0 .053-.486l-.677-3.904a1 1 0 0 1 0-.434a.9.9 0 0 1 .233-.37l2.835-2.762a.93.93 0 0 0 .233-.92a.9.9 0 0 0-.72-.614l-3.925-.56a.92.92 0 0 1-.677-.498L14.884 4.91a.89.89 0 0 0-.783-.508a.84.84 0 0 0-.476.138a.8.8 0 0 0-.328.37l-1.799 3.576a.93.93 0 0 1-.666.498l-3.872.56a.93.93 0 0 0-.455.201a.87.87 0 0 0-.275.413a.95.95 0 0 0 .253.92L9.32 13.84q.155.161.233.37a1 1 0 0 1 0 .434l-.677 3.904a.86.86 0 0 0 0 .486a.9.9 0 0 0 .306.392a.87.87 0 0 0 .942.063l3.513-1.84a.9.9 0 0 1 .846 0zM8 5.4H2m3 12.07H2m1.5-5.773H2"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `shop` — market / list-for-sale affordance. */
export function ShopIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.25 9.944a3.08 3.08 0 0 1-2.056 2.899a2.9 2.9 0 0 1-1.027.185a3.08 3.08 0 0 1-2.899-2.056a2.9 2.9 0 0 1-.185-1.028c.003.351-.06.7-.185 1.028A3.08 3.08 0 0 1 12 13.028a3.08 3.08 0 0 1-2.898-2.056a2.9 2.9 0 0 1-.185-1.028c.002.351-.06.7-.185 1.028a3.08 3.08 0 0 1-2.899 2.056c-.35.002-.7-.06-1.027-.185A3.08 3.08 0 0 1 2.75 9.944l.462-1.623l1.11-3.166a2.06 2.06 0 0 1 1.943-1.377h11.47a2.06 2.06 0 0 1 1.942 1.377l1.11 3.166z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M19.194 12.843v5.324a2.056 2.056 0 0 1-2.055 2.055H6.86a2.055 2.055 0 0 1-2.056-2.055v-5.324m4.113 4.296h6.166"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `plus` — add / create affordance. */
export function PlusIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 4.5v15m7.5-7.5h-15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `information-circle` — small facts / explain affordance. */
export function InformationCircleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 11v5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 8.01l.01-.011"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `question-mark-circle` — help / info affordance. */
export function QuestionMarkCircleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M9.008 8.84a3.185 3.185 0 0 1 3.471-1.806a3.09 3.09 0 0 1 2.265 1.614a2.682 2.682 0 0 1-1.562 3.689a1.98 1.98 0 0 0-1.276 1.787v.738"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeMiterlimit={10}
        fill="none"
      />
      <path
        d="M11.881 17.424h.008"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `link` — generic / other link affordance. */
export function LinkIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M10.522 13.48a4.1 4.1 0 0 0 2.892 1.199a4.7 4.7 0 0 0 1.063-.136a4.2 4.2 0 0 0 1.828-1.063l.969-.968l2.878-2.888a4.085 4.085 0 0 0-2.922-6.873a4.1 4.1 0 0 0-2.862 1.096L11.49 6.736"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="m12.445 17.336l-2.892 2.888a4.094 4.094 0 0 1-6.801-2.944a4.1 4.1 0 0 1 1.031-2.833l2.892-2.888l.969-.968A4.2 4.2 0 0 1 9.47 9.53a4.1 4.1 0 0 1 3.956 1.062"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `scale-up` — expand / fullscreen listen affordance. */
export function ScaleUpIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M3 15.396V21h5.604m6.792-18H21v5.604M21 3l-7.2 7.2m-3.6 3.6L3 21"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `scale-down` — contract / exit fullscreen listen. */
export function ScaleDownIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M10.2 19.404V13.8H4.59602m14.808-3.6H13.8V4.59601M21 3L13.8 10.2m-3.6 3.6L3 21"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `file-download` — export a real file (page + arrow). */
export function SaveIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M14.186 2.753v3.596c0 .487.194.955.54 1.3a1.85 1.85 0 0 0 1.306.539h4.125"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.25 8.568v8.568a4.25 4.25 0 0 1-1.362 2.97a4.28 4.28 0 0 1-3.072 1.14h-7.59a4.3 4.3 0 0 1-3.1-1.124a4.26 4.26 0 0 1-1.376-2.986V6.862a4.25 4.25 0 0 1 1.362-2.97a4.28 4.28 0 0 1 3.072-1.14h5.714a3.5 3.5 0 0 1 2.361.905l2.96 2.722a2.97 2.97 0 0 1 1.031 2.189"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 17.273v-6.774"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="m8.894 14.42l2.665 2.666a.62.62 0 0 0 .882 0l2.665-2.665"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `download` — save / import affordance (arrow into tray). */
export function DownloadIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 15.2375V3.21252"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7.375 10.9941L11.3409 14.96C11.5163 15.1337 11.7532 15.2312 12 15.2312C12.2468 15.2312 12.4837 15.1337 12.6591 14.96L16.625 10.9941"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M2.75 13.85V18.475C2.75 19.0883 2.99364 19.6765 3.42732 20.1102C3.86099 20.5438 4.44919 20.7875 5.0625 20.7875H18.9374C19.5508 20.7875 20.139 20.5438 20.5727 20.1102C21.0063 19.6765 21.25 19.0883 21.25 18.475V13.85"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `share` — system / native share affordance. */
export function ShareIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M6.01472 15.8088C7.81776 15.8088 9.27942 14.3472 9.27942 12.5441C9.27942 10.7411 7.81776 9.27942 6.01472 9.27942C4.21167 9.27942 2.75001 10.7411 2.75001 12.5441C2.75001 14.3472 4.21167 15.8088 6.01472 15.8088Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M17.9853 9.27941C19.7883 9.27941 21.25 7.81775 21.25 6.01471C21.25 4.21166 19.7883 2.75 17.9853 2.75C16.1822 2.75 14.7206 4.21166 14.7206 6.01471C14.7206 7.81775 16.1822 9.27941 17.9853 9.27941Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M17.9853 21.25C19.7883 21.25 21.25 19.7883 21.25 17.9853C21.25 16.1822 19.7883 14.7206 17.9853 14.7206C16.1822 14.7206 14.7206 16.1822 14.7206 17.9853C14.7206 19.7883 16.1822 21.25 17.9853 21.25Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.0144 16.6359L8.9856 13.8935"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.1124 7.58176L8.88765 10.9771"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}
