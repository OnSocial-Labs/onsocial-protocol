import type { ReactNode, SVGProps } from 'react';
import { cn } from './cn.js';

/** Shared class for every stroke glyph — see `mage-stroke-icons.css`. */
export const mageStrokeIconClassName = 'mage-stroke-icon';

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
      className={cn(mageStrokeIconClassName, className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Stroke paths — camelCase attributes. */
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

/** `chevron-up` — vertical flip of {@link ChevronDownIcon}. */
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

/** `cancel` — circle with a slash. Abort a drop or sale, not close. */
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

/** `stop` — media stop square. */
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

/** `filter` — horizontal sliders; page appearance / layout customize. */
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

/** `settings` — gear for settings hubs / configuration entry. */
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

/** `dots-circle` — subtle customize / more affordance (stroke reads larger than fill). */
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

/** `check` — inline save / confirm affordance. */
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

/** `trash` — clear profile media. */
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

/** `focus` — camera reticle, stroke. Official weight is 1.5. */
export function FocusIcon({
  strokeWidth = 1.5,
  ...props
}: MageStrokeIconProps & { strokeWidth?: number }) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M20.325 8.3V6.45a2.775 2.775 0 0 0-2.775-2.775h-2.775m0 16.65h2.775a2.775 2.775 0 0 0 2.775-2.775V15.7m-16.65 0v1.85a2.775 2.775 0 0 0 2.775 2.775h2.775m0-16.65H6.45A2.775 2.775 0 0 0 3.675 6.45V8.3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** `camera` — profile / media pickers. */
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

/** `chart-vertical` — poll / bar-chart affordance. */
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

/** `note-text` — text card / written cover; pair with NoteTextFillIcon when active. */
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

/** `Align Left` — essay / article alignment. */
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

/** `Align Center` — essay / article alignment. */
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
 * Justify — left, center, and right are the only shipped alignment marks.
 * This matches Align Left’s stroke language with three equal full-width
 * rules (standard justify mark).
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

/** `building-tree` — office / organization mark. */
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

/** `map-marker` — place / venue pin. */
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

/** `image` — still photo / picture cover. */
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

/** `video-player` — video frame / clip cover. */
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

/** Default stroke weight — 2px unless fill. */
const MAGE_STROKE = 2;

/** `message-round` — reply / conversation affordance. */
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

/** `exchange-b` — quote / repost cycle affordance. */
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

/** `refresh` — renew / restart commitment. */
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

/** Unlocked padlock — release a completed boost commitment. */
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

/** `heart` — like idle state; pair with HeartFillIcon when active. */
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

/** `bookmark` — save for later idle; pair with BookmarkFillIcon when saved. */
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

/** `fire-a` — Boost. Pair with FireFillIcon when active. */
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

/** `fire-b` — post amplify, and the Hot feed sort. Pair with FireBFillIcon when active. */
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

/** `clock` / time — chronological / Recent feed sort (idle). */
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

/** `edit-pen` — profile / inline edit affordance. */
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

/** `edit` — profile / content editing. */
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

/** Stroke `gift` — reward and collect surfaces. */
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

/** `key` — app access / session key management. */
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

/** `box-3d` — NEAR contract / infra account fallback. */
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

/** `box-check` — submitted proposal / ballot mark. */
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

/** `shield-check` — protocol guardian / council mark. */
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

/** `security-shield` — protocol governance DAO face mark. */
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

/** `user-plus` — add / stand-with affordance. */
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

/** `user-check` — endorse / vouch for a person. */
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

/** `user-cross` — block this person. */
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

/** `user-minus` — remove / step-back affordance. */
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

/** `star-moving` — Hubs mark (stroke). */
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

/** `stars-c` — drop / scarce affordance (stroke). */
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

/** `tag` — list / price for sale. */
export function TagIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m17.524 17.524l-2.722 2.723a2.567 2.567 0 0 1-3.634 0L4.13 13.209A3.85 3.85 0 0 1 3 10.487V5.568A2.57 2.57 0 0 1 5.568 3h4.919c1.021 0 2 .407 2.722 1.13l7.038 7.038a2.567 2.567 0 0 1 0 3.634z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.126 11.694a2.568 2.568 0 1 0 0-5.137a2.568 2.568 0 0 0 0 5.137"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/**
 * `direction-up-right` — paper-plane send / transfer.
 * Distinct from {@link ArrowUpRightIcon} (corner ↗ leave / open elsewhere).
 */
export function DirectionUpRightIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="m9.697 12.695l-5.271-.91a2.074 2.074 0 0 1-.167-3.941l14.045-4.968a2.075 2.075 0 0 1 2.66 2.66l-4.968 14.318a2.075 2.075 0 0 1-3.981-.205l-.91-5.546a2.08 2.08 0 0 0-1.408-1.408"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** `shop` — open Market / marketplace destination. */
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

/** `plus` — add / create affordance. */
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

/** `plus-circle` — add the next item in a sequence. */
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

/** `exclamation-triangle` — content warning tool. */
export function ExclamationTriangleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M10.367 4.462L2.752 17.655a1.885 1.885 0 0 0 1.634 2.827h15.228a1.885 1.885 0 0 0 1.633-2.827L13.633 4.462a1.885 1.885 0 0 0-3.266 0m1.628 3.116v6.277"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12.043 17.326h-.009"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** `information-circle` — small facts / explain affordance. */
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

/** `question-mark-circle` — help / info affordance. */
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

/** `link` — generic / other link affordance. */
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

/** `scale-up` — expand / fullscreen listen affordance. */
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

/** `scale-down` — contract / exit fullscreen listen. */
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

/** `file-download` — export a real file (page + arrow). */
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

/** `download` — save / import affordance (arrow into tray). */
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

/** `share` — system / native share affordance. */
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

/** `volume-up` — speaker + waves (unmute / audible). */
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

/** `volume-mute` — speaker + X (muted). */
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

/** Stroke `home` — roof and walls. Quiet Home launcher tile. */
export function HomeIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M19.6325 7.11089L13.1591 3.08871C12.805 2.86736 12.3957 2.75 11.9781 2.75C11.5605 2.75 11.1512 2.86736 10.7971 3.08871L4.3237 7.13318C3.95562 7.36509 3.66349 7.69966 3.48332 8.09564C3.30315 8.49161 3.24283 8.93168 3.3098 9.36153L4.98106 19.3891C5.06888 19.9144 5.3419 20.3908 5.75067 20.7321C6.15944 21.0734 6.67693 21.2571 7.20941 21.2498H16.7913C17.3238 21.2571 17.8413 21.0734 18.2501 20.7321C18.6588 20.3908 18.9319 19.9144 19.0197 19.3891L20.6909 9.36153C20.7582 8.92366 20.6935 8.47568 20.5049 8.07479C20.3164 7.67391 20.0126 7.33833 19.6325 7.11089Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** `fingerprint-minimal` — logged-out Connect. Apache 2.0. */
export function FingerprintIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12.036 12.158s-.986 4.736 4.492 6.993"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.752 20.952c-2.871-1.621-5.086-4.726-4.725-8.127a4.05 4.05 0 0 1 1.737-3.306a2.935 2.935 0 0 1 3.9 1.261c.942 1.388.275 3.179.964 4.641c1.06 1.801 3.75 1.346 4.767-.297c1.526-2.352.715-5.943-.843-8.105c-2.447-3.337-6.043-5.107-11.14-3.338c-4.789 1.632-7.162 8.381-4.64 12.863"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.982 19.002a9 9 0 0 1-1.864-3.484a8.9 8.9 0 0 1-.183-3.933a6.4 6.4 0 0 1 .91-2.45A6.6 6.6 0 0 1 8.662 7.23a6.3 6.3 0 0 1 3.578-.869c.811.025 1.61.208 2.349.537s1.406.798 1.96 1.38a8.28 8.28 0 0 1 1.692 5.51"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MageStrokeSvg>
  );
}

/** Stroke `notification-bell` — body and clapper. Quiet Activity tile. */
export function NotificationBellIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M11.9623 17.9861H18.7715C19.0367 18.0009 19.3014 17.9476 19.5401 17.8311C19.7788 17.7146 19.9837 17.5389 20.1352 17.3207C20.2868 17.1026 20.38 16.8493 20.406 16.585C20.432 16.3206 20.3898 16.0541 20.2835 15.8106C19.9245 14.7229 18.4887 13.4176 18.4887 12.134C18.4887 9.28415 18.4887 8.53361 17.0855 6.85847C16.6306 6.31932 16.0672 5.88198 15.4321 5.57493L14.6489 5.19422C14.5172 5.11567 14.4034 5.01012 14.3153 4.88451C14.2273 4.75892 14.1667 4.61609 14.1377 4.46542C14.0596 3.95781 13.7914 3.4989 13.3873 3.18178C12.9833 2.86465 12.4739 2.71303 11.9623 2.75766C11.4595 2.72728 10.9636 2.88545 10.5713 3.20127C10.1791 3.5171 9.91866 3.96784 9.84113 4.46542C9.80599 4.62092 9.7371 4.76682 9.63938 4.89276C9.54163 5.01869 9.4174 5.12161 9.27548 5.19422L8.4923 5.57493C7.8572 5.88198 7.29385 6.31932 6.83892 6.85847C5.43572 8.53361 5.43572 9.28415 5.43572 12.134C5.43572 13.4176 4.06516 14.5923 3.70621 15.7454C3.48865 16.4415 3.369 17.9861 5.18554 17.9861H11.9623Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.2254 17.9861C15.2342 18.4171 15.156 18.8455 14.9951 19.2453C14.8343 19.6453 14.5943 20.0086 14.2895 20.3134C13.9846 20.6182 13.6213 20.8582 13.2214 21.0191C12.8214 21.18 12.3932 21.2583 11.9622 21.2493C11.5312 21.2583 11.1029 21.18 10.7029 21.0191C10.303 20.8582 9.93969 20.6182 9.63491 20.3134C9.3301 20.0086 9.09006 19.6453 8.92922 19.2453C8.76837 18.8455 8.69004 18.4171 8.69892 17.9861"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Stroke `users` — two people. Quiet Guilds launcher tile. */
export function UsersIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M17.9281 19.6343H20.0657C20.2539 19.6375 20.4401 19.5951 20.6083 19.5106C20.7766 19.4261 20.9218 19.3021 21.0316 19.1491C21.1413 18.9962 21.2124 18.8189 21.2386 18.6325C21.2649 18.4461 21.2455 18.2561 21.1822 18.0788C20.637 16.9119 19.7739 15.9223 18.692 15.2236C17.6101 14.5248 16.3531 14.1451 15.0652 14.1281"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M15.0652 11.3701C15.5465 11.3701 16.023 11.2754 16.4676 11.0912C16.9122 10.907 17.3161 10.6371 17.6564 10.2968C17.9967 9.95657 18.2666 9.5526 18.4508 9.10801C18.6349 8.66341 18.7297 8.18691 18.7297 7.70568C18.731 7.22366 18.6371 6.74612 18.4535 6.30042C18.2699 5.85473 18.0002 5.44964 17.6598 5.10835C17.3194 4.76706 16.915 4.49628 16.4698 4.31153C16.0246 4.12678 15.5473 4.03168 15.0652 4.03168"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14.0251 20.8271C14.3771 20.8263 14.7221 20.7281 15.0218 20.5434C15.3215 20.3587 15.5643 20.0947 15.7233 19.7807C15.8823 19.4666 15.9513 19.1146 15.9228 18.7638C15.8942 18.4129 15.7692 18.0767 15.5615 17.7925C14.8329 16.8246 13.8947 16.0342 12.8171 15.4805C11.7396 14.9269 10.5507 14.6243 9.33953 14.5956C8.1284 14.6243 6.93948 14.9269 5.86193 15.4805C4.78437 16.0342 3.84614 16.8246 3.11758 17.7925C2.90988 18.0767 2.78484 18.4129 2.75629 18.7638C2.72774 19.1146 2.79678 19.4666 2.95579 19.7807C3.11481 20.0947 3.35759 20.3587 3.6573 20.5434C3.957 20.7281 4.30195 20.8263 4.65398 20.8271H14.0251Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.3395 11.4847C10.4413 11.4822 11.4972 11.0427 12.2754 10.2627C13.0536 9.48267 13.4907 8.42583 13.4907 7.324C13.4907 6.22305 13.0533 5.16718 12.2748 4.38869C11.4963 3.6102 10.4405 3.17285 9.3395 3.17285C8.23855 3.17285 7.18269 3.6102 6.4042 4.38869C5.62571 5.16718 5.18835 6.22305 5.18835 7.324C5.18835 8.42583 5.6254 9.48267 6.40362 10.2627C7.18184 11.0427 8.23768 11.4822 9.3395 11.4847Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Stroke `dashboard` — four equal panes. Quiet DAOs launcher tile. */
export function DashboardIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M8.55694 2.75H4.68222C4.16976 2.75 3.6783 2.95357 3.31593 3.31593C2.95357 3.6783 2.75 4.16976 2.75 4.68222V8.55694C2.74999 9.07035 2.95324 9.56288 3.31531 9.92687C3.67738 10.2909 4.16882 10.4967 4.68222 10.4994H8.55694C9.07212 10.4994 9.56621 10.2948 9.9305 9.9305C10.2948 9.56621 10.4994 9.07212 10.4994 8.55694V4.68222C10.4967 4.16882 10.2909 3.67738 9.92687 3.31531C9.56288 2.95324 9.07035 2.74999 8.55694 2.75Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M19.3178 2.75H15.443C14.9296 2.74999 14.4371 2.95324 14.0731 3.31531C13.7091 3.67738 13.5033 4.16882 13.5005 4.68222V8.55694C13.5005 9.07212 13.7052 9.56621 14.0695 9.9305C14.4338 10.2948 14.9279 10.4994 15.443 10.4994H19.3178C19.8312 10.4967 20.3226 10.2909 20.6847 9.92687C21.0468 9.56288 21.25 9.07035 21.25 8.55694V4.68222C21.25 4.16976 21.0464 3.6783 20.6841 3.31593C20.3217 2.95357 19.8302 2.75 19.3178 2.75Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M19.3178 13.5005H15.443C14.9296 13.5005 14.4371 13.7038 14.0731 14.0659C13.7091 14.4279 13.5033 14.9194 13.5005 15.4328V19.3075C13.5005 19.8227 13.7052 20.3168 14.0695 20.681C14.4338 21.0453 14.9279 21.25 15.443 21.25H19.3178C19.8312 21.2473 20.3226 21.0414 20.6847 20.6774C21.0468 20.3134 21.25 19.8209 21.25 19.3075V15.4328C21.25 14.9203 21.0464 14.4288 20.6841 14.0665C20.3217 13.7041 19.8302 13.5005 19.3178 13.5005Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.55694 13.5005H4.68222C4.16882 13.5033 3.67738 13.7091 3.31531 14.0731C2.95324 14.4371 2.74999 14.9296 2.75 15.443V19.3178C2.75 19.8302 2.95357 20.3217 3.31593 20.6841C3.6783 21.0464 4.16976 21.25 4.68222 21.25H8.55694C9.07035 21.25 9.56288 21.0468 9.92687 20.6847C10.2909 20.3226 10.4967 19.8312 10.4994 19.3178V15.443C10.4994 14.9279 10.2948 14.4338 9.9305 14.0695C9.56621 13.7052 9.07212 13.5005 8.55694 13.5005Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Stroke `calendar` — quiet Events launcher tile. */
export function CalendarIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M17 4.625H7C4.79086 4.625 3 6.41586 3 8.625V17.375C3 19.5841 4.79086 21.375 7 21.375H17C19.2091 21.375 21 19.5841 21 17.375V8.625C21 6.41586 19.2091 4.625 17 4.625Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M3 10.625H21"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M17 2.625V6.625"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 2.625V6.625"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}

/** Stroke `user-circle` — person in a circle. Quiet Page launcher tile. */
export function UserCircleIcon(props: MageStrokeIconProps) {
  return (
    <MageStrokeSvg {...props}>
      <path
        d="M12 21.5C17.2467 21.5 21.5 17.2467 21.5 12C21.5 6.7533 17.2467 2.5 12 2.5C6.7533 2.5 2.5 6.7533 2.5 12C2.5 17.2467 6.7533 21.5 12 21.5Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M6.3739 19.6528C6.90736 18.6208 7.71438 17.7554 8.70668 17.1513C9.69897 16.5472 10.8383 16.2277 12 16.2277C13.1617 16.2277 14.301 16.5472 15.2933 17.1513C16.2857 17.7554 17.0926 18.6208 17.6261 19.6528"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 13.0556C13.8772 13.0556 15.3989 11.5339 15.3989 9.6567C15.3989 7.77954 13.8772 6.25781 12 6.25781C10.1228 6.25781 8.60114 7.77954 8.60114 9.6567C8.60114 11.5339 10.1228 13.0556 12 13.0556Z"
        stroke="currentColor"
        strokeWidth={MAGE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </MageStrokeSvg>
  );
}
