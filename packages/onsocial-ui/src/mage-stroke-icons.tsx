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

/** Mage `chevron-up` — vertical flip of {@link ChevronDownIcon}. */
export function ChevronUpIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4 15.5831L10.5866 8.9963C10.9633 8.625 11.471 8.4169 12 8.4169C12.529 8.4169 13.0367 8.625 13.4134 8.9963L20 15.5831"
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

/** Mage `cancel` — circle with a slash. Abort a drop or sale, not close. */
export function CancelIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 21.5a9.5 9.5 0 1 0 0-19a9.5 9.5 0 0 0 0 19m6.713-2.787L5.287 5.287"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `stop` — media stop square. */
export function StopIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M17.25 5H6.75A1.75 1.75 0 0 0 5 6.75v10.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0 0 19 17.25V6.75A1.75 1.75 0 0 0 17.25 5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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

/** Mage `chart-vertical` — poll / bar-chart affordance. */
export function ChartVerticalIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M13.632 6.352V4.589c0-.565-.458-1.023-1.023-1.023H7.103c-.565 0-1.023.458-1.023 1.023v1.763c0 .565.458 1.023 1.023 1.023h5.506c.565 0 1.023-.458 1.023-1.023m7.618 6.53v-1.764c0-.564-.458-1.022-1.023-1.022H7.103c-.565 0-1.023.458-1.023 1.022v1.764c0 .564.458 1.022 1.023 1.022h13.124c.565 0 1.023-.458 1.023-1.022m-3.33 6.528v-1.762c0-.565-.458-1.023-1.023-1.023H7.114c-.565 0-1.023.458-1.023 1.023v1.763c0 .565.458 1.023 1.023 1.023h9.783c.565 0 1.023-.458 1.023-1.023M2.75 3.294v17.412"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `note-text` — text card / written cover; pair with NoteTextFillIcon when active. */
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

/** Mage `Align Left` — essay / article alignment. */
export function AlignLeftIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.5 12H12.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M4.5 18.25H19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M4.5 5.75H19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
    </MageStrokeSvg>
  );
}

/** Mage `Align Center` — essay / article alignment. */
export function AlignCenterIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M6.28571 12H17.7143"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M9.71429 17.7143H14.2857"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M4 6.28571H20"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
    </MageStrokeSvg>
  );
}

/**
 * Justify — Mage ships left/center/right only; this matches Align Left’s
 * stroke language with three equal full-width rules (standard justify mark).
 */
export function AlignJustifyIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.5 5.75H19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M4.5 12H19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
      <path
        d="M4.5 18.25H19.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
    </MageStrokeSvg>
  );
}

/** Mage `building-tree` — office / organization mark. */
export function BuildingTreeIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M9.20601 3.41006H14.4685C15.1879 3.41006 15.8779 3.69586 16.3866 4.20457C16.8953 4.71328 17.1811 5.40325 17.1811 6.12267V20.5899H6.4934V6.12267C6.4934 5.40325 6.77919 4.71328 7.28791 4.20457C7.79662 3.69586 8.48658 3.41006 9.20601 3.41006Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M3.16593 20.5899H21.25"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11.6926 14.2605H12.0181C12.3778 14.2605 12.7228 14.4034 12.9771 14.6578C13.2315 14.9121 13.3744 15.2571 13.3744 15.6168V20.5899H10.3363V15.6168C10.3363 15.2571 10.4792 14.9121 10.7335 14.6578C10.9879 14.4034 11.3329 14.2605 11.6926 14.2605Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.88416 7.02689H13.7903"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.88416 10.6437H13.7903"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M17.1811 9.28738H17.8683C18.5877 9.28738 19.2777 9.57318 19.7864 10.0819C20.2951 10.5906 20.5809 11.2806 20.5809 12V20.5899"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M4.10631 20.5899V13.8084"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M5.46261 11.0958C5.46261 10.3467 4.85537 9.7395 4.10631 9.7395C3.35724 9.7395 2.75 10.3467 2.75 11.0958V12.4521C2.75 13.2012 3.35724 13.8084 4.10631 13.8084C4.85537 13.8084 5.46261 13.2012 5.46261 12.4521V11.0958Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `map-marker` — place / venue pin. */
export function MapMarkerIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 12.7998C13.8502 12.7998 15.3499 11.3001 15.3499 9.4499C15.3499 7.59978 13.8502 6.09995 12 6.09995C10.1498 6.09995 8.65004 7.59978 8.65004 9.4499C8.65004 11.3001 10.1498 12.7998 12 12.7998Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 2.75C5.3001 2.75 4.18345 8.33325 5.3001 12.5654C6.28275 16.2726 9.23071 18.8074 11.1737 20.8844C11.2783 20.9995 11.4059 21.0915 11.5482 21.1545C11.6905 21.2175 11.8444 21.25 12 21.25C12.1556 21.25 12.3095 21.2175 12.4518 21.1545C12.594 21.0915 12.7217 20.9995 12.8263 20.8844C14.7693 18.8074 17.7172 16.2726 18.6999 12.5654C19.8165 8.33325 18.6999 2.75 12 2.75Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeMiterlimit={10}
        strokeLinecap="round"
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

/** Mage `bookmark` — save for later idle; pair with BookmarkFillIcon when saved. */
export function BookmarkIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m10.94 18.339l-3.43 2.548a1.71 1.71 0 0 1-2.76-1.23V6.35a3.735 3.735 0 0 1 3.87-3.597h6.76a3.74 3.74 0 0 1 3.87 3.597v13.309a1.708 1.708 0 0 1-2.76 1.229l-3.43-2.548a1.8 1.8 0 0 0-2.12 0"
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

/** Mage `key` — app access / session key management. */
export function KeyIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19.543 4.471A6.501 6.501 0 0 0 8.618 7.255a6.52 6.52 0 0 0 .34 4.447L2.5 18.179V21.5h3.364l-.318-1.99l1.965.33l1.67-1.661l-.318-1.99l1.976.318l1.47-1.472a6.5 6.5 0 0 0 8.06-2.261a6.52 6.52 0 0 0-.838-8.338z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.99 10.23a2.258 2.258 0 0 1-3.476-2.853a2.26 2.26 0 0 1 3.477-.339a2.275 2.275 0 0 1 0 3.192"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

/** Mage `box-3d` — NEAR contract / infra account fallback. */
export function Box3dIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M10.55 2.876L4.595 6.182a2.98 2.98 0 0 0-1.529 2.611v6.414a2.98 2.98 0 0 0 1.529 2.61l5.957 3.307a2.98 2.98 0 0 0 2.898 0l5.957-3.306a2.98 2.98 0 0 0 1.529-2.611V8.793a2.98 2.98 0 0 0-1.529-2.61L13.45 2.876a2.98 2.98 0 0 0-2.898 0Z"
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
      />
      <path
        d="M20.33 6.996L12 12L3.67 6.996M12 21.49V12"
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `box-check` — submitted proposal / ballot mark. */
export function BoxCheckIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M4.382 8.813v8.5c0 .845.344 1.656.957 2.253a3.3 3.3 0 0 0 2.308.934h8.706c.866 0 1.696-.336 2.308-.934a3.15 3.15 0 0 0 .957-2.253v-8.5m0-5.313H4.382c-.901 0-1.632.714-1.632 1.594v2.125c0 .88.73 1.593 1.632 1.593h15.236c.901 0 1.632-.713 1.632-1.593V5.094c0-.88-.73-1.594-1.632-1.594"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="m9 14.574l1.689 1.689a.637.637 0 0 0 .908 0L15 12.86"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `shield-check` — protocol guardian / council mark. */
export function ShieldCheckIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m8.67 10.909l1.875 1.874a.71.71 0 0 0 1.008 0l3.777-3.777"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.672 11.89V6.61a1.93 1.93 0 0 0-1.32-1.831L14.438 3.14a7.8 7.8 0 0 0-4.876 0L4.648 4.778a1.93 1.93 0 0 0-1.32 1.83v5.28a7.71 7.71 0 0 0 3.603 6.524l4.048 2.544a1.93 1.93 0 0 0 2.042 0l4.047-2.544a7.71 7.71 0 0 0 3.604-6.523"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `security-shield` — protocol governance DAO face mark. */
export function SecurityShieldIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 11.543A2.17 2.17 0 1 0 12 7.2a2.17 2.17 0 0 0 0 4.342m0 .001v3.256"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M20.672 11.89V6.61a1.93 1.93 0 0 0-1.32-1.831L14.438 3.14a7.8 7.8 0 0 0-4.876 0L4.648 4.778a1.93 1.93 0 0 0-1.32 1.83v5.28a7.71 7.71 0 0 0 3.603 6.524l4.048 2.544a1.93 1.93 0 0 0 2.042 0l4.047-2.544a7.71 7.71 0 0 0 3.604-6.523"
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

/** Mage `user-check` — endorse / vouch for a person. */
export function UserCheckIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12.359 14.724c-3.6 0-7.62 2.928-7.62 6.526m7.62-9.785a4.36 4.36 0 0 0 4.035-2.683a4.355 4.355 0 0 0-3.171-5.948a4.362 4.362 0 0 0-5.215 4.274a4.356 4.356 0 0 0 4.35 4.357m.904 6.897l1.688 1.689a.637.637 0 0 0 .909 0l3.403-3.403"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `user-cross` — block this person. */
export function UserCrossIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M11.959 14.724c-3.6 0-7.62 2.928-7.62 6.526m7.62-9.785a4.36 4.36 0 0 0 4.035-2.683a4.355 4.355 0 0 0-3.17-5.948a4.362 4.362 0 0 0-5.215 4.274a4.356 4.356 0 0 0 4.35 4.357"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="m19.661 15.487l-5 4.989m0-4.978l5 4.989"
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

/** Mage `stars-c` — drop / scarce affordance (stroke). */
export function StarsCIcon({
  strokeWidth = 2,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m15.238 10.81l-.569 1.694a4.33 4.33 0 0 1-2.757 2.76l-1.713.569a.288.288 0 0 0 0 .548l1.713.569a4.32 4.32 0 0 1 2.736 2.738l.568 1.715a.287.287 0 0 0 .548 0l.59-1.694a4.32 4.32 0 0 1 2.735-2.738l1.714-.569a.288.288 0 0 0 0-.548l-1.692-.59a4.32 4.32 0 0 1-2.757-2.76l-.569-1.715a.29.29 0 0 0-.448-.126a.3.3 0 0 0-.099.148m-8.43-4.914l-.413 1.231a3.15 3.15 0 0 1-2.006 2.007l-1.246.414a.21.21 0 0 0 0 .398l1.246.415a3.14 3.14 0 0 1 1.99 1.99l.413 1.248a.21.21 0 0 0 .398 0l.43-1.232a3.15 3.15 0 0 1 1.99-1.99l1.245-.415a.21.21 0 0 0 0-.398l-1.23-.43A3.14 3.14 0 0 1 7.62 7.128l-.414-1.247a.21.21 0 0 0-.398.016m7.849-3.422l-.207.616a1.57 1.57 0 0 1-1.002 1.004l-.623.207a.104.104 0 0 0-.052.16a.1.1 0 0 0 .052.039l.623.207a1.57 1.57 0 0 1 .995.995l.206.624a.105.105 0 0 0 .2 0l.214-.616a1.57 1.57 0 0 1 .995-.995l.623-.207a.105.105 0 0 0 0-.2l-.615-.214a1.57 1.57 0 0 1-1.003-1.004l-.207-.624a.105.105 0 0 0-.199.008"
        stroke="currentColor"
        strokeWidth={strokeWidth}
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

/** Mage `plus-circle` — add the next item in a sequence. */
export function PlusCircleIcon(props: MageStrokeIconProps) {
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
        d="M12 8v8m4-4H8"
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

/** Mage `volume-up` — speaker + waves (unmute / audible). */
export function VolumeUpIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M3 14.0881V9.91184C3 9.49649 3.14223 9.09814 3.39541 8.80445C3.64858 8.51075 3.99197 8.34575 4.35002 8.34575H6.24005C6.47678 8.34461 6.70927 8.2727 6.91506 8.13694L10.8842 5.5059C11.0892 5.37099 11.3211 5.30072 11.5569 5.30208C11.7926 5.30343 12.0239 5.37638 12.2278 5.51364C12.4317 5.65091 12.601 5.84771 12.719 6.08448C12.837 6.32125 12.8994 6.58972 12.9002 6.86318V17.1368C12.8994 17.4102 12.837 17.6787 12.719 17.9154C12.601 18.1522 12.4317 18.3491 12.2278 18.4863C12.0239 18.6235 11.7926 18.6965 11.5569 18.6979C11.3211 18.6992 11.0892 18.629 10.8842 18.494L6.91506 15.863C6.70927 15.7272 6.47678 15.6553 6.24005 15.6542H4.35002C3.99197 15.6542 3.64858 15.4891 3.39541 15.1955C3.14223 14.9018 3 14.5035 3 14.0881Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16.2278 15.7145C17.2301 14.7122 17.7933 13.3528 17.7932 11.9353C17.7933 10.5178 17.2301 9.15836 16.2278 8.15601"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M18.4954 18.0409C20.099 16.4371 21 14.2621 21 11.9941C21 9.72604 20.099 7.55094 18.4954 5.94727"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Mage `volume-mute` — speaker + X (muted). */
export function VolumeMuteIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M20.9514 9.55359L16.0486 14.4564"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16.0486 9.55359L20.9514 14.4564"
        stroke="currentColor"
        strokeWidth={2}
        strokeMiterlimit={10}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M3.04858 14.0881V9.91184C3.04858 9.49649 3.19082 9.09814 3.44399 8.80445C3.69717 8.51075 4.04055 8.34575 4.3986 8.34575H6.28863C6.52536 8.34461 6.75785 8.2727 6.96364 8.13694L10.9328 5.5059C11.1378 5.37099 11.3696 5.30072 11.6055 5.30208C11.8412 5.30343 12.0725 5.37638 12.2763 5.51364C12.4803 5.65091 12.6496 5.84771 12.7675 6.08448C12.8856 6.32125 12.9479 6.58972 12.9488 6.86318V17.1368C12.9479 17.4102 12.8856 17.6787 12.7675 17.9154C12.6496 18.1522 12.4803 18.3491 12.2763 18.4863C12.0725 18.6235 11.8412 18.6965 11.6055 18.6979C11.3696 18.6992 11.1378 18.629 10.9328 18.494L6.96364 15.863C6.75785 15.7272 6.52536 15.6553 6.28863 15.6542H4.3986C4.04055 15.6542 3.69717 15.4891 3.44399 15.1955C3.19082 14.9018 3.04858 14.5035 3.04858 14.0881Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Outline pair for HomeFillIcon. */
export function HomeIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.4442 9.47336L19.7742 19.4734C19.6614 20.169 19.3074 20.8026 18.7742 21.2633C18.206 21.7163 17.5009 21.9631 16.7742 21.9633H7.16422C6.46153 21.9572 5.7833 21.7045 5.24783 21.2495C4.71237 20.7944 4.35366 20.1658 4.23422 19.4734L2.56424 9.47336C2.4738 8.89638 2.55372 8.30555 2.79422 7.77335C3.03464 7.24389 3.42375 6.79571 3.91422 6.48334L10.3942 2.48334C10.8676 2.1913 11.4129 2.03665 11.9692 2.03665C12.5255 2.03665 13.0708 2.1913 13.5442 2.48334L20.0142 6.48334C20.5207 6.78374 20.925 7.22979 21.1742 7.76334C21.4303 8.29442 21.5242 8.88921 21.4442 9.47336Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Outline pair for NotificationBellFillIcon. */
export function NotificationBellIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.161 16.656a2.26 2.26 0 0 1-.41 1.088a2.27 2.27 0 0 1-1.89 1h-2.94a4.4 4.4 0 0 1-.23.788a4 4 0 0 1-2.18 2.178c-.495.2-1.026.298-1.56.29h-.08a3.9 3.9 0 0 1-1.44-.29a3.75 3.75 0 0 1-1.32-.87a3.85 3.85 0 0 1-.87-1.308a4.4 4.4 0 0 1-.23-.789h-2.82a2.24 2.24 0 0 1-1.94-.849a2.78 2.78 0 0 1-.26-2.367a6.7 6.7 0 0 1 .88-1.618a3.83 3.83 0 0 0 .82-1.768c0-2.886 0-3.865 1.58-5.743a5.7 5.7 0 0 1 1.9-1.478l.78-.38a.4.4 0 0 0 .1-.09a.3.3 0 0 0 .06-.13a3 3 0 0 1 1.905-2.142a3 3 0 0 1 2.835.434a2.72 2.72 0 0 1 1 1.758v.1a.35.35 0 0 0 .11.1l.72.35c.73.35 1.378.85 1.9 1.468c1.58 1.888 1.58 2.867 1.58 5.753c.134.69.44 1.336.89 1.878c.36.481.652 1.009.87 1.568c.164.332.247.698.24 1.069"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Outline pair for UsersFillIcon. */
export function UsersIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M21.987 18.73C21.9409 19.0359 21.8245 19.3268 21.6469 19.58C21.4702 19.8288 21.2361 20.0315 20.9645 20.1707C20.6929 20.31 20.3917 20.3817 20.0864 20.38H18.4359C18.3185 20.3796 18.2028 20.3514 18.0984 20.2975C17.9941 20.2436 17.904 20.1656 17.8358 20.07C17.7667 19.9745 17.7208 19.8643 17.7018 19.748C17.6827 19.6317 17.6909 19.5126 17.7257 19.4C18.0958 18.22 18.0158 16.89 14.6648 14.76C14.5282 14.6705 14.4236 14.54 14.3661 14.3872C14.3085 14.2344 14.3011 14.0673 14.3447 13.91C14.3916 13.7551 14.4867 13.6191 14.6163 13.522C14.7458 13.4248 14.903 13.3716 15.0649 13.37C16.4953 13.3898 17.8911 13.8122 19.0924 14.5886C20.2937 15.3651 21.2518 16.4642 21.857 17.76C21.98 18.0676 22.0247 18.4009 21.987 18.73Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M19.4863 7.70004C19.4847 8.2802 19.3691 8.85441 19.1462 9.39005C18.6938 10.4694 17.8351 11.3278 16.7554 11.7801C16.2193 12.002 15.6452 12.1174 15.0649 12.12C14.9336 12.1176 14.8052 12.0813 14.6921 12.0146C14.5791 11.9478 14.4852 11.8529 14.4197 11.7391C14.3543 11.6253 14.3194 11.4965 14.3185 11.3653C14.3176 11.234 14.3508 11.1047 14.4147 10.99C15.0269 10.011 15.3515 8.87966 15.3515 7.72507C15.3515 6.57048 15.0269 5.43912 14.4147 4.46005C14.3363 4.34796 14.29 4.21655 14.2809 4.08005C14.2717 3.94354 14.3001 3.80717 14.363 3.68564C14.4258 3.56411 14.5207 3.46208 14.6374 3.39059C14.7541 3.31911 14.8881 3.28088 15.0249 3.28006C15.6056 3.27788 16.1808 3.39351 16.7154 3.62003C17.2602 3.84914 17.7508 4.18979 18.1559 4.62003C18.9783 5.4508 19.4417 6.57116 19.4463 7.74002L19.4863 7.70004Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16.6754 18.7C16.7159 19.1896 16.6195 19.6807 16.3969 20.1187C16.1743 20.5566 15.8344 20.924 15.415 21.18C14.997 21.4371 14.5154 21.5722 14.0246 21.57H4.65181C4.16102 21.5722 3.67941 21.4371 3.2614 21.18C2.84145 20.9253 2.50155 20.5578 2.28047 20.1193C2.05939 19.6808 1.96602 19.189 2.01102 18.7C2.04837 18.2122 2.22163 17.7445 2.51117 17.35C3.308 16.2889 4.33479 15.4219 5.51454 14.814C6.6943 14.2061 7.9964 13.8732 9.32322 13.84C10.6546 13.866 11.9626 14.1947 13.1481 14.8011C14.3335 15.4075 15.3653 16.2758 16.1653 17.34C16.4564 17.7383 16.6328 18.2086 16.6754 18.7Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14.2447 7.31999C14.2421 8.61966 13.7251 9.86549 12.8068 10.7854C11.8884 11.7054 10.6433 12.2247 9.34322 12.23C8.37466 12.228 7.4284 11.9392 6.62389 11.4C5.81938 10.8608 5.19269 10.0955 4.82295 9.20054C4.45321 8.30559 4.35699 7.3212 4.54643 6.37162C4.73588 5.42205 5.2025 4.54989 5.88738 3.86521C6.57226 3.18054 7.44469 2.71402 8.39455 2.52464C9.34441 2.33525 10.3291 2.43144 11.2243 2.80107C12.1195 3.1707 12.8851 3.79721 13.4245 4.60148C13.9638 5.40575 14.2527 6.35171 14.2547 7.31999H14.2447Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Outline pair for UserCircleFillIcon. */
export function UserCircleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M11.9667 1.75195C9.81618 1.76239 7.72323 2.4468 5.98323 3.70856C4.24323 4.97032 2.94402 6.74571 2.26894 8.78424C1.59387 10.8228 1.57703 13.0215 2.22077 15.0701C2.86452 17.1187 4.13635 18.9138 5.85681 20.202C5.90685 20.2507 5.96434 20.2912 6.02709 20.322C7.7668 21.5741 9.85708 22.248 12.0017 22.248C14.1464 22.248 16.2367 21.5741 17.9764 20.322C18.0421 20.2869 18.1027 20.2432 18.1567 20.192C19.877 18.8994 21.1468 17.0996 21.7865 15.0471C22.4261 12.9945 22.4032 10.7931 21.721 8.7543C21.0389 6.71546 19.7319 4.94233 17.985 3.68573C16.2382 2.42913 14.1398 1.75265 11.9867 1.75195H11.9667ZM11.9667 5.51196C12.7921 5.50205 13.6018 5.73775 14.2926 6.18903C14.9834 6.6403 15.5239 7.28669 15.8454 8.04584C16.1668 8.80498 16.2545 9.64249 16.0974 10.4516C15.9403 11.2607 15.5454 12.0048 14.963 12.589C14.3807 13.1732 13.6374 13.5711 12.8277 13.7319C12.0181 13.8927 11.1788 13.8092 10.4169 13.492C9.65495 13.1748 9.00487 12.6383 8.54951 11.9508C8.09415 11.2634 7.85414 10.4561 7.86004 9.63196C7.86783 8.54512 8.30238 7.50471 9.07028 6.73431C9.83818 5.96392 10.8781 5.52503 11.9667 5.51196ZM16.5942 19.4319C15.2071 20.2944 13.6058 20.7515 11.9717 20.7515C10.3376 20.7515 8.73627 20.2944 7.34921 19.4319C6.918 19.1703 6.51226 18.869 6.13726 18.532C6.70519 17.7242 7.43513 17.0431 8.28074 16.532C9.39741 15.869 10.6725 15.5191 11.9717 15.5191C13.2709 15.5191 14.546 15.869 15.6627 16.532C16.5083 17.0431 17.2382 17.7242 17.8061 18.532C17.4311 18.869 17.0254 19.1703 16.5942 19.4319Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}
