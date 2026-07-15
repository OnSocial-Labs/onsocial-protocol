'use client';

import {
  ChevronDownIcon,
  FloatingPanelMenu,
  osFloatingPanelBodyClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
  useDropdown,
} from '@onsocial/ui';
import {
  HOME_FEED_LENSES,
  homeFeedLensDescription,
  homeFeedLensLabel,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';

export function HomeFeedLensMenu({
  lens,
  onLensChange,
  standingAvailable,
}: {
  lens: HomeFeedLens;
  onLensChange: (lens: HomeFeedLens) => void;
  /** Standing needs a connected wallet. */
  standingAvailable: boolean;
}) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const options = HOME_FEED_LENSES.filter(
    (option) => option !== 'standing' || standingAvailable
  );
  const activeLabel = homeFeedLensLabel(lens);

  return (
    <div className="home-feed-lens-menu standing-view-menu" ref={containerRef}>
      <button
        type="button"
        className={`${osFloatingPanelTriggerClassName}${isOpen ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close feed menu' : 'Open feed menu'}
      >
        <span className={osFloatingPanelTriggerLabelClassName}>
          {activeLabel}
        </span>
        <span className={osFloatingPanelTriggerMetaClassName}>
          <ChevronDownIcon
            className={`${osFloatingPanelTriggerChevronClassName}${
              isOpen ? ' is-open' : ''
            }`}
            aria-hidden
          />
        </span>
      </button>

      <FloatingPanelMenu
        ref={panelRef}
        open={isOpen}
        align="left"
        offset="sm"
        className="home-feed-lens-menu-panel standing-view-menu-panel"
        role="listbox"
        aria-label="Feed"
      >
        <div className={osFloatingPanelHeaderClassName}>
          <p className={osFloatingPanelHeaderLabelClassName}>Feed</p>
          <p className={osFloatingPanelHeaderActiveClassName}>{activeLabel}</p>
        </div>

        <div className={osFloatingPanelBodyClassName}>
          {options.map((option) => {
            const selected = option === lens;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${osFloatingPanelItemClassName}${
                  selected ? ' is-selected' : ''
                }`}
                onClick={() => {
                  onLensChange(option);
                  close();
                }}
              >
                <span className="home-feed-lens-option">
                  <span className="home-feed-lens-option-label">
                    {homeFeedLensLabel(option)}
                  </span>
                  <span className="home-feed-lens-option-desc">
                    {homeFeedLensDescription(option)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </FloatingPanelMenu>
    </div>
  );
}
