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
