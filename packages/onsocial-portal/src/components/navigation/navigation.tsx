'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { PortalBadge } from '@/components/ui/portal-badge';
import {
  utilityButtonActiveClass,
  utilityButtonClass,
  utilityIconTransition,
} from '@/components/ui/utility-button';
import { WalletButton } from '@/components/wallet-button';
import {
  floatingPanelClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { fadeMotion, fadeUpMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useDropdown } from '@/hooks/use-dropdown';
import { useIsMobile } from '@/hooks/use-mobile';

const navItems = [
  { label: 'Home', href: '/', isAnchor: false },
  { label: 'SDK', href: '/sdk', isAnchor: false },
  { label: 'Transparency', href: '/transparency', isAnchor: false },
  { label: 'OnApi', href: '/onapi', isAnchor: false },
  { label: 'Boost', href: '/boost', isAnchor: false },
  { label: 'Partners', href: '/partners', isAnchor: false },
  { label: 'Governance', href: '/governance', isAnchor: false },
];

const homepageSections = [
  { id: 'hero', label: 'Home', accent: 'slate' as const },
  { id: 'paths', label: 'Paths', accent: 'purple' as const },
  { id: 'protocol', label: 'Protocol', accent: 'blue' as const },
  { id: 'status', label: 'Status', accent: 'green' as const },
];

const MOBILE_NAV_MIN_WIDTH = 360;
const MOBILE_NAV_MAX_WIDTH = 768;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

export function Navigation() {
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isDesktopViewport = !isMobile;
  const [compactProgress, setCompactProgress] = useState(0);
  const [desktopVisibleCount, setDesktopVisibleCount] = useState(
    navItems.length
  );
  const [viewportWidth, setViewportWidth] = useState(MOBILE_NAV_MIN_WIDTH);
  const [activeHomepageSectionId, setActiveHomepageSectionId] = useState(
    homepageSections[0].id
  );
  const navRef = useRef<HTMLElement | null>(null);
  const logoRef = useRef<HTMLAnchorElement | null>(null);
  const desktopActionsRef = useRef<HTMLDivElement | null>(null);
  const desktopMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const desktopOverflowItemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const desktopMeasureMoreRef = useRef<HTMLSpanElement | null>(null);
  const desktopItemMeasureRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const desktopMore = useDropdown();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const visibleNavItems = useMemo(() => navItems, []);
  const { handoffProgress, pageBadge, navBack } = useMobilePageContext();
  const router = useRouter();
  const isOpen = openPathname === pathname;
  const homepageSection = useMemo(
    () =>
      pathname === '/'
        ? (homepageSections.find(
            (section) => section.id === activeHomepageSectionId
          ) ?? homepageSections[0])
        : homepageSections[0],
    [activeHomepageSectionId, pathname]
  );

  useEffect(() => {
    const syncViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);

    return () => {
      window.removeEventListener('resize', syncViewportWidth);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    const handleScroll = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        setCompactProgress(Math.min(window.scrollY / 48, 1));
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (pathname !== '/') {
      return;
    }

    let frameId = 0;

    const syncHomepageSection = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const anchorLine = window.innerHeight * 0.28 + window.scrollY;
        let activeSection = homepageSections[0];

        for (const section of homepageSections.slice(1)) {
          const element = document.getElementById(section.id);
          if (!element) continue;

          const sectionTop =
            element.getBoundingClientRect().top + window.scrollY;
          if (anchorLine >= sectionTop) {
            activeSection = section;
          }
        }

        setActiveHomepageSectionId((current) =>
          current === activeSection.id ? current : activeSection.id
        );
      });
    };

    syncHomepageSection();
    window.addEventListener('scroll', syncHomepageSection, { passive: true });
    window.addEventListener('resize', syncHomepageSection);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', syncHomepageSection);
      window.removeEventListener('resize', syncHomepageSection);
    };
  }, [pathname]);

  useEffect(() => {
    desktopMore.close();
  }, [pathname, desktopMore]);

  const effectiveCompactProgress = isDesktopViewport ? 0 : compactProgress;
  const effectiveHandoffProgress = isOpen
    ? 1
    : reduceMotion
      ? handoffProgress >= 0.6
        ? 1
        : 0
      : handoffProgress;
  const mobileViewportScale = clamp(
    (viewportWidth - MOBILE_NAV_MIN_WIDTH) /
      (MOBILE_NAV_MAX_WIDTH - MOBILE_NAV_MIN_WIDTH),
    0,
    1
  );
  const desktopViewportScale = clamp(
    (viewportWidth - 768) / (1280 - 768),
    0,
    1
  );
  const compactMobileHeader = effectiveCompactProgress > 0.01;
  const mobileContainerInsetClass = 'px-4';
  const mobileTopInset = interpolate(
    interpolate(10, 14, mobileViewportScale),
    interpolate(4, 7, mobileViewportScale),
    effectiveCompactProgress
  );
  const mobileNavHeight = interpolate(
    interpolate(64, 72, mobileViewportScale),
    interpolate(56, 64, mobileViewportScale),
    effectiveCompactProgress
  );
  const mobileNavRadius = interpolate(
    interpolate(22, 28, mobileViewportScale),
    interpolate(18, 23, mobileViewportScale),
    effectiveCompactProgress
  );
  const mobileLogoSize = interpolate(
    interpolate(38, 44, mobileViewportScale),
    interpolate(34, 38, mobileViewportScale),
    effectiveCompactProgress
  );
  const mobileMenuRadius = interpolate(24, 28, mobileViewportScale);
  const mobileMenuPaddingX = interpolate(18, 20, mobileViewportScale);
  const mobileMenuPaddingY = interpolate(18, 20, mobileViewportScale);
  const mobileBadgeMaxWidth = interpolate(176, 200, mobileViewportScale);
  const dockedBadgeProgress =
    pageBadge && effectiveCompactProgress > 0.12
      ? Math.min(1, Math.max(0, (effectiveHandoffProgress - 0.18) / 0.82))
      : 0;
  const dockedBadgeOpacity = dockedBadgeProgress;
  const mobileMenuGap = interpolate(6, 8, mobileViewportScale);
  const mobileMenuTop = mobileTopInset + mobileNavHeight + mobileMenuGap;
  const homepageBadgeVisible =
    pathname === '/' && effectiveCompactProgress > 0.12;
  const mobileBadge = pathname === '/' ? homepageSection : pageBadge;
  const mobileBadgeAccent =
    pathname === '/' ? homepageSection.accent : pageBadge?.badgeAccent;
  const mobileBadgeLabel =
    pathname === '/' ? homepageSection.label : pageBadge?.badge;
  const mobileBadgeOpacity =
    pathname === '/' ? (homepageBadgeVisible ? 1 : 0) : pageBadge ? (effectiveCompactProgress > 0.12 ? 1 : 0.55) : 0;
  const desktopNavGap = interpolate(12, 20, desktopViewportScale);
  const desktopNavFontSize = interpolate(13, 14, desktopViewportScale);
  const desktopActionGap = interpolate(8, 12, desktopViewportScale);
  const desktopNavSidePadding = interpolate(4, 8, desktopViewportScale);
  const showDesktopBadge = viewportWidth >= 1180;
  const compactDesktopInstallButton = viewportWidth < 1080;
  const desktopPrimaryItems = visibleNavItems.slice(0, desktopVisibleCount);
  const desktopOverflowItems = visibleNavItems.slice(desktopVisibleCount);

  useEffect(() => {
    if (!isDesktopViewport) {
      setDesktopVisibleCount(visibleNavItems.length);
      desktopMore.close();
      return;
    }

    let frameId = 0;

    const syncDesktopVisibleItems = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const navWidth = navRef.current?.clientWidth ?? 0;
        const logoWidth = logoRef.current?.offsetWidth ?? 0;
        const actionsWidth = desktopActionsRef.current?.offsetWidth ?? 0;
        const moreWidth = desktopMeasureMoreRef.current?.offsetWidth ?? 76;

        if (!navWidth || !logoWidth) {
          return;
        }

        const itemWidths = visibleNavItems.map(
          (_, index) => desktopItemMeasureRefs.current[index]?.offsetWidth ?? 0
        );
        const reserveWidth = 48;
        const availableWidth = Math.max(
          navWidth - logoWidth - actionsWidth - reserveWidth,
          0
        );

        let usedWidth = 0;
        let nextVisibleCount = itemWidths.length;

        for (let index = 0; index < itemWidths.length; index += 1) {
          const itemWidth = itemWidths[index];
          const nextUsedWidth =
            index === 0 ? itemWidth : usedWidth + desktopNavGap + itemWidth;
          const needsOverflowButton = index < itemWidths.length - 1;
          const maxAllowedWidth = needsOverflowButton
            ? availableWidth - (moreWidth + desktopNavGap)
            : availableWidth;

          if (nextUsedWidth > maxAllowedWidth) {
            nextVisibleCount = index;
            break;
          }

          usedWidth = nextUsedWidth;
        }

        setDesktopVisibleCount((current) =>
          current === nextVisibleCount ? current : nextVisibleCount
        );
      });
    };

    syncDesktopVisibleItems();

    const resizeObserver = new ResizeObserver(syncDesktopVisibleItems);

    if (navRef.current) {
      resizeObserver.observe(navRef.current);
    }

    if (logoRef.current) {
      resizeObserver.observe(logoRef.current);
    }

    if (desktopActionsRef.current) {
      resizeObserver.observe(desktopActionsRef.current);
    }

    desktopItemMeasureRefs.current.forEach((item) => {
      if (item) {
        resizeObserver.observe(item);
      }
    });

    if (desktopMeasureMoreRef.current) {
      resizeObserver.observe(desktopMeasureMoreRef.current);
    }

    window.addEventListener('resize', syncDesktopVisibleItems);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncDesktopVisibleItems);
    };
  }, [desktopNavGap, isDesktopViewport, visibleNavItems]);

  useEffect(() => {
    if (!desktopOverflowItems.length) {
      desktopMore.close();
    }
  }, [desktopOverflowItems.length, desktopMore]);

  const focusDesktopOverflowItem = (index: number) => {
    const items = desktopOverflowItemRefs.current.filter(
      (item): item is HTMLAnchorElement => Boolean(item)
    );

    if (!items.length) {
      return;
    }

    const boundedIndex = ((index % items.length) + items.length) % items.length;
    items[boundedIndex]?.focus();
  };

  const handleDesktopMoreButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (!desktopOverflowItems.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      desktopMore.open();
      requestAnimationFrame(() => focusDesktopOverflowItem(0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      desktopMore.open();
      requestAnimationFrame(() =>
        focusDesktopOverflowItem(desktopOverflowItems.length - 1)
      );
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      desktopMore.close();
    }
  };

  const handleDesktopMoreMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    const items = desktopOverflowItemRefs.current.filter(
      (item): item is HTMLAnchorElement => Boolean(item)
    );

    if (!items.length) {
      return;
    }

    const activeIndex = items.findIndex(
      (item) => item === document.activeElement
    );

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusDesktopOverflowItem(activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusDesktopOverflowItem(
        activeIndex <= 0 ? items.length - 1 : activeIndex - 1
      );
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusDesktopOverflowItem(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusDesktopOverflowItem(items.length - 1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      desktopMore.close();
      desktopMoreButtonRef.current?.focus();
      return;
    }

    if (event.key === 'Tab') {
      desktopMore.close();
    }
  };

  const closeMenu = () => {
    setOpenPathname(null);
  };

  const toggleMenu = () => {
    setOpenPathname((current) => (current === pathname ? null : pathname));
  };

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (href.startsWith('#')) {
      e.preventDefault();

      // If we're not on the homepage, navigate there first
      if (window.location.pathname !== '/') {
        window.location.assign('/' + href);
        closeMenu();
        return;
      }

      // If we're on homepage, scroll to the element
      const element = document.querySelector(href);
      if (element) {
        const offset = 80; // Account for fixed header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
        closeMenu();
      }
    }
  };

  const isActiveItem = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <motion.header
      {...fadeUpMotion(!!reduceMotion, {
        distance: 24,
        duration: 0.5,
        exitDistance: 12,
      })}
      className="fixed top-0 left-0 right-0 z-50 bg-transparent"
    >
      <div
        className={cn(
          'container mx-auto md:pt-[10px]',
          mobileContainerInsetClass
        )}
        style={{ paddingTop: `${mobileTopInset}px` }}
      >
        <motion.nav
          ref={navRef}
          className={cn(
            'relative z-30 flex items-center justify-between overflow-visible border px-4 shadow-[0_22px_56px_-30px_rgba(15,23,42,0.46)] transition-[border-color,background-color,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:mx-auto md:h-16 md:max-w-6xl md:rounded-[24px] md:border-border/45 md:bg-background/72 md:px-5 md:shadow-[0_24px_64px_-34px_rgba(15,23,42,0.32)] md:backdrop-blur-xl xl:max-w-[76rem]',
            compactMobileHeader
              ? 'border-border/35 bg-background/55 backdrop-blur-2xl'
              : 'border-border/45 bg-background/72 backdrop-blur-xl'
          )}
          style={{
            height: `${mobileNavHeight}px`,
            borderRadius: `${mobileNavRadius}px`,
          }}
        >
          {/* Logo / Back */}
          {navBack ? (
            <button
              type="button"
              onClick={() => router.back()}
              className="group inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 bg-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transform-none" />
              {navBack.label}
            </button>
          ) : (
          <Link
            ref={logoRef}
            href="/"
            onClick={(e) => {
              // If on homepage, scroll to top smoothly
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                });
              }
              closeMenu();
            }}
            className="flex items-center"
          >
            <div
              style={{
                height: `${mobileLogoSize}px`,
                width: `${mobileLogoSize}px`,
                transform: `scale(${1 - effectiveCompactProgress * 0.02})`,
              }}
            >
              <BrandLogo className="h-full w-full" />
            </div>
          </Link>
          )}

          <div className="flex min-w-0 flex-1 justify-center px-3 md:hidden">
            <div
              className="min-w-0"
              style={{ maxWidth: `${mobileBadgeMaxWidth}px` }}
            >
              {mobileBadge ? (
                <div
                  className="min-w-0"
                  style={{
                    opacity: mobileBadgeOpacity,
                    pointerEvents: mobileBadgeOpacity < 0.08 ? 'none' : 'auto',
                  }}
                >
                  <PortalBadge
                    accent={mobileBadgeAccent ?? 'slate'}
                    size="sm"
                    casing="uppercase"
                    tracking="normal"
                    className="max-w-full truncate whitespace-nowrap border-white/10 bg-white/6 px-3.5 py-1.5 text-[10px]"
                  >
                    {mobileBadgeLabel}
                  </PortalBadge>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="hidden min-w-0 flex-1 items-center justify-center md:flex"
            style={{
              gap: `${desktopNavGap}px`,
              paddingInline: `${desktopNavSidePadding}px`,
            }}
          >
            {desktopPrimaryItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) =>
                  item.isAnchor && handleSmoothScroll(e, item.href)
                }
                className={cn(
                  'shrink-0 whitespace-nowrap transition-colors',
                  isActiveItem(item.href)
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                style={{ fontSize: `${desktopNavFontSize}px` }}
                aria-current={isActiveItem(item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
            {desktopOverflowItems.length ? (
              <div className="relative shrink-0" ref={desktopMore.containerRef}>
                <button
                  ref={desktopMoreButtonRef}
                  type="button"
                  onClick={desktopMore.toggle}
                  onKeyDown={handleDesktopMoreButtonKeyDown}
                  className={cn(
                    'inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                    desktopMore.isOpen && 'text-foreground'
                  )}
                  style={{ fontSize: `${desktopNavFontSize}px` }}
                  aria-expanded={desktopMore.isOpen}
                  aria-haspopup="menu"
                  aria-controls="desktop-nav-more-menu"
                >
                  <span>More</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      desktopMore.isOpen && 'rotate-180'
                    )}
                  />
                </button>

                <FloatingPanelMenu
                  open={desktopMore.isOpen}
                  align="center"
                  className="mt-3 w-44 md:w-52"
                  id="desktop-nav-more-menu"
                  role="menu"
                  onKeyDown={handleDesktopMoreMenuKeyDown}
                >
                  <div className="p-1 md:p-1.5 space-y-0.5">
                    {desktopOverflowItems.map((item, index) => (
                      <motion.div
                        key={item.href}
                        {...fadeUpMotion(!!reduceMotion, {
                          distance: 8,
                          exitDistance: 4,
                          duration: 0.2,
                          delay: index * 0.028,
                        })}
                      >
                        <Link
                          ref={(element) => {
                            desktopOverflowItemRefs.current[index] = element;
                          }}
                          href={item.href}
                          onClick={desktopMore.close}
                          className={cn(
                            floatingPanelItemClass,
                            isActiveItem(item.href)
                              ? floatingPanelItemSelectedClass
                              : 'text-muted-foreground'
                          )}
                          role="menuitem"
                          tabIndex={desktopMore.isOpen ? 0 : -1}
                          aria-current={
                            isActiveItem(item.href) ? 'page' : undefined
                          }
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </FloatingPanelMenu>
              </div>
            ) : null}
          </div>

          {/* Desktop Actions */}
          <div
            ref={desktopActionsRef}
            className="hidden shrink-0 items-center md:flex"
            style={{ gap: `${desktopActionGap}px` }}
          >
            {showDesktopBadge ? (
              <div className="flex min-w-[96px] max-w-[180px] justify-center">
                {pathname === '/' ? (
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: compactProgress > 0.08 ? 1 : 0.55,
                      y: 0,
                    }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <PortalBadge
                      accent={homepageSection.accent}
                      size="sm"
                      casing="uppercase"
                      tracking="normal"
                      className="w-full justify-center border-white/10 bg-white/6 px-3 py-1.5 text-[10px]"
                    >
                      {homepageSection.label}
                    </PortalBadge>
                  </motion.div>
                ) : pageBadge ? (
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: compactProgress > 0.08 ? 1 : 0.55,
                      y: 0,
                    }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <PortalBadge
                      accent={pageBadge.badgeAccent}
                      size="sm"
                      casing="uppercase"
                      tracking="normal"
                      className="w-full justify-center border-white/10 bg-white/6 px-3 py-1.5 text-[10px]"
                    >
                      {pageBadge.badge}
                    </PortalBadge>
                  </motion.div>
                ) : (
                  <div aria-hidden="true" className="h-[26px] w-full" />
                )}
              </div>
            ) : null}
            <PwaInstallButton compact={compactDesktopInstallButton} />
            <ThemeToggle />
            <WalletButton compact />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <WalletButton compact />
            <button
              type="button"
              onClick={toggleMenu}
              className={cn(
                utilityButtonClass,
                'border border-border/45 bg-background/70 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.34)] hover:border-border/70 hover:bg-background/84',
                isOpen && utilityButtonActiveClass
              )}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isOpen}
            >
              <span className="relative h-[18px] w-[18px]">
                <motion.span
                  initial={false}
                  animate={
                    isOpen
                      ? { rotate: 45, y: 0, scaleX: 1 }
                      : { rotate: 0, y: -5, scaleX: 1 }
                  }
                  transition={utilityIconTransition}
                  className="absolute left-0 top-1/2 block h-[2px] w-[18px] -translate-y-1/2 rounded-full bg-current origin-center will-change-transform"
                />
                <motion.span
                  initial={false}
                  animate={
                    isOpen
                      ? { opacity: 0, scaleX: 0.65 }
                      : { opacity: 1, scaleX: 0.82 }
                  }
                  transition={utilityIconTransition}
                  className="absolute left-0 top-1/2 block h-[2px] w-[18px] -translate-y-1/2 rounded-full bg-current origin-left will-change-transform"
                />
                <motion.span
                  initial={false}
                  animate={
                    isOpen
                      ? { rotate: -45, y: 0, scaleX: 1 }
                      : { rotate: 0, y: 5, scaleX: 1 }
                  }
                  transition={utilityIconTransition}
                  className="absolute left-0 top-1/2 block h-[2px] w-[18px] -translate-y-1/2 rounded-full bg-current origin-center will-change-transform"
                />
              </span>
            </button>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center opacity-0 md:flex"
          >
            <div
              className="flex items-center"
              style={{ gap: `${desktopNavGap}px` }}
            >
              {visibleNavItems.map((item, index) => (
                <span
                  key={item.href}
                  ref={(element) => {
                    desktopItemMeasureRefs.current[index] = element;
                  }}
                  className="shrink-0 whitespace-nowrap font-medium"
                  style={{ fontSize: `${desktopNavFontSize}px` }}
                >
                  {item.label}
                </span>
              ))}
              <span
                ref={desktopMeasureMoreRef}
                className="inline-flex items-center gap-1 whitespace-nowrap font-medium"
                style={{ fontSize: `${desktopNavFontSize}px` }}
              >
                <span>More</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </motion.nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              {...fadeMotion(0.24)}
              className="fixed inset-x-0 bottom-0 z-10 bg-transparent md:hidden"
              style={{ top: `${mobileMenuTop}px` }}
              onClick={closeMenu}
            />

            {/* Menu */}
            <motion.div
              {...scaleFadeMotion(!!reduceMotion, {
                y: 14,
                scale: 0.97,
                duration: 0.34,
                exitY: 10,
                exitScale: 0.985,
              })}
              className="absolute left-0 right-0 z-20 px-4 md:hidden"
              style={{ top: `${mobileMenuTop}px` }}
            >
              <div
                className={`container mx-auto max-w-2xl ${floatingPanelClass}`}
                style={{
                  borderRadius: `${mobileMenuRadius}px`,
                  padding: `${mobileMenuPaddingY}px ${mobileMenuPaddingX}px`,
                }}
              >
                <div className="relative z-10 space-y-1">
                  {visibleNavItems.map((item, i) => (
                    <motion.div
                      key={item.href}
                      {...fadeUpMotion(!!reduceMotion, {
                        distance: 14,
                        duration: 0.28,
                        delay: 0.04 + i * 0.045,
                      })}
                    >
                      <Link
                        href={item.href}
                        onClick={(e) => {
                          if (item.isAnchor) {
                            handleSmoothScroll(e, item.href);
                          } else {
                            closeMenu();
                          }
                        }}
                        className={cn(
                          floatingPanelItemClass,
                          'px-3 py-2.5 text-base',
                          isActiveItem(item.href)
                            ? floatingPanelItemSelectedClass
                            : 'text-muted-foreground'
                        )}
                        aria-current={
                          isActiveItem(item.href) ? 'page' : undefined
                        }
                      >
                        {item.label}
                      </Link>
                    </motion.div>
                  ))}
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.08 + visibleNavItems.length * 0.045,
                      duration: 0.28,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="mt-4 border-t border-fade-section pt-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Theme
                      </span>
                      <ThemeToggle />
                      <PwaInstallButton className="ml-auto text-xs" />
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
