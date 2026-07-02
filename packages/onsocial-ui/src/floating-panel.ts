export const osFloatingPanelClassName = 'os-floating-panel';

export const osFloatingPanelMenuClassName = 'os-floating-panel-menu';

export const osFloatingPanelHeaderClassName = 'os-floating-panel-header';

export const osFloatingPanelHeaderLabelClassName =
  'os-floating-panel-header-label';

export const osFloatingPanelHeaderActiveClassName =
  'os-floating-panel-header-active';

export const osFloatingPanelBodyClassName = 'os-floating-panel-body';

export const osFloatingPanelItemClassName = 'os-floating-panel-item';

export const osFloatingPanelItemSelectedClassName =
  'os-floating-panel-item is-selected';

export const osFloatingPanelTriggerClassName = 'os-floating-panel-trigger';

export const osFloatingPanelSearchClassName = 'os-floating-panel-search';

export const osFloatingPanelTriggerLabelClassName =
  'os-floating-panel-trigger-label';

export const osFloatingPanelTriggerMetaClassName =
  'os-floating-panel-trigger-meta';

export const osFloatingPanelTriggerChevronClassName =
  'os-floating-panel-trigger-chevron';

export const osFloatingPanelCountClassName = 'os-floating-panel-count';

export type OsFloatingPanelMenuAlign = 'left' | 'right' | 'center';

export type OsFloatingPanelMenuOffset = 'sm' | 'md';

export function osFloatingPanelMenuAlignClassName(
  align: OsFloatingPanelMenuAlign = 'left'
): string {
  return `os-floating-panel-menu--align-${align}`;
}

export function osFloatingPanelMenuOffsetClassName(
  offset: OsFloatingPanelMenuOffset = 'sm'
): string {
  return `os-floating-panel-menu--offset-${offset}`;
}
