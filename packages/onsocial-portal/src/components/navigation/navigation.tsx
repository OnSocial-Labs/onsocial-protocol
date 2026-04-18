'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, ChevronDown, Eye, Flame, Handshake, Landmark, Key, Package, Play } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { PortalBadge } from '@/components/ui/portal-badge';
import type { PortalAccent } from '@/lib/portal-colors';
import { portalColors } from '@/lib/portal-colors';
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
import {
  getDesktopNavMetrics,
  getDesktopViewportScale,
  getMobileNavMetrics,
  interpolateMetric,
  MOBILE_NAV_MAX_WIDTH,
  MOBILE_NAV_MIN_WIDTH,
} from '@/lib/nav-metrics';
import { cn } from '@/lib/utils';
import { useDropdown } from '@/hooks/use-dropdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavVisibility } from '@/components/providers/nav-visibility-context';

/* ── Grouped navigation structure ────────────────────────────── */

interface NavGroupItem {
  label: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  attribution?: string;
  accent: PortalAccent;
  items: NavGroupItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Protocol',
    attribution: 'Governed by DAO',
    accent: 'blue',
    items: [
      { label: 'Transparency', href: '/transparency', description: 'Token supply & on-chain proof', icon: Eye },
      { label: 'Boost', href: '/boost', description: 'Influence staking & rewards', icon: Flame },
      { label: 'Partners', href: '/partners', description: 'Ecosystem collaborations', icon: Handshake },
      { label: 'Governance', href: '/governance', description: 'Proposals & on-chain voting', icon: Landmark },
    ],
  },
  {
    label: 'Services',
    attribution: 'By OnSocial Labs',
    accent: 'purple',
    items: [
      { label: 'OnAPI', href: '/onapi', description: 'API access & subscriptions', icon: Key },
      { label: 'SDK', href: '/sdk', description: 'Build with OnSocial', icon: Package },
      { label: 'Playground', href: '/playground', description: 'Interactive code sandbox', icon: Play },
    ],
  },
];

/** Flat list for mobile menu + legacy helpers */
const navItems = navGroups.flatMap((g) =>
  g.items.map((item) => ({ label: item.label, href: item.href, isAnchor: false }))
);

const homepageSections = [
  { id: 'hero', label: 'Home', accent: 'slate' as const },
  { id: 'paths', label: 'Paths', accent: 'purple' as const },
  { id: 'protocol', label: 'Protocol', accent: 'blue' as const },
  { id: 'status', label: 'Status', accent: 'green' as const },
];

const SCROLL_HIDE_THRESHOLD = 12;

function MobileMenuScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;
    const prevBodyTop = document.body.style.top;
    const prevBodyWidth = document.body.style.width;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.top = prevBodyTop;
      document.body.style.width = prevBodyWidth;
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
  }, []);

  return null;
}

export function Navigation() {
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isDesktopViewport = !isMobile;
  const { navHidden, setNavHidden } = useNavVisibility();
  const lastScrollY = useRef(0);
  const scrollDirection = useRef<'up' | 'down'>('up');
  const [viewportWidth, setViewportWidth] = useState(MOBILE_NAV_MIN_WIDTH);
  const [activeHomepageSectionId, setActiveHomepageSectionId] = useState(
    homepageSections[0].id
  );
  const navRef = useRef<HTMLElement | null>(null);
  const logoRef = useRef<HTMLAnchorElement | null>(null);
  const desktopActionsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuScrollRef = useRef<HTMLDivElement | null>(null);
  const protocolDropdown = useDropdown();
  const servicesDropdown = useDropdown();
  const mobileContextDropdown = useDropdown();
  const desktopContextDropdown = useDropdown();
  const groupDropdowns = useMemo(
    () => [protocolDropdown, servicesDropdown],
    [protocolDropdown, servicesDropdown]
  );
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { handoffProgress, pageBadge, navBack } = useMobilePageContext();
  const router = useRouter();
  const isOpen = openPathname === pathname;
  const activeGroup = useMemo(() => {
    if (pathname === '/') return null;
    return navGroups.find((g) =>
      g.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    ) ?? null;
  }, [pathname]);
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
        const y = window.scrollY;
        const delta = y - lastScrollY.current;

        if (Math.abs(delta) > SCROLL_HIDE_THRESHOLD) {
          const dir = delta > 0 ? 'down' : 'up';
          scrollDirection.current = dir;
          // Hide when scrolling down past 80px, show on scroll up
          setNavHidden(dir === 'down' && y > 80);
        }

        // Always reveal at the very top
        if (y <= 10) {
          setNavHidden(false);
        }

        lastScrollY.current = y;
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

  const closeProtocol = protocolDropdown.close;
  const closeServices = servicesDropdown.close;
  const closeMobileContext = mobileContextDropdown.close;
  const closeDesktopContext = desktopContextDropdown.close;
  useEffect(() => {
    closeProtocol();
    closeServices();
    closeMobileContext();
    closeDesktopContext();
  }, [pathname, closeProtocol, closeServices, closeMobileContext, closeDesktopContext]);

  // Mobile always starts compact (1); desktop stays expanded (0)
  const effectiveCompactProgress = isDesktopViewport ? 0 : 1;
  // When mobile menu is open or interacting with dropdown, don't hide
  const effectiveNavHidden = !isDesktopViewport && navHidden && !isOpen && !mobileContextDropdown.isOpen;
  const effectiveHandoffProgress = isOpen
    ? 1
    : reduceMotion
      ? handoffProgress >= 0.6
        ? 1
        : 0
      : handoffProgress;
  const {
    mobileViewportScale,
    topInset: mobileTopInset,
    height: mobileNavHeight,
    radius: mobileNavRadius,
    logoSize: mobileLogoSize,
    menuRadius: mobileMenuRadius,
    menuPaddingX: mobileMenuPaddingX,
    menuPaddingY: mobileMenuPaddingY,
    badgeMaxWidth: mobileBadgeMaxWidth,
    menuGap: mobileMenuGap,
    menuTop: mobileMenuTop,
  } = getMobileNavMetrics(viewportWidth);
  const {
    topInset: desktopTopInset,
    height: desktopNavHeight,
    radius: desktopNavRadius,
  } = getDesktopNavMetrics();
  const desktopViewportScale = getDesktopViewportScale(viewportWidth);
  const compactMobileHeader = !isDesktopViewport;
  const mobileContainerInsetClass = 'px-4';
  const dockedBadgeProgress =
    pageBadge && !isDesktopViewport
      ? Math.min(1, Math.max(0, (effectiveHandoffProgress - 0.18) / 0.82))
      : 0;
  const dockedBadgeOpacity = dockedBadgeProgress;
  const homepageBadgeVisible = pathname === '/' && !isDesktopViewport;
  const mobileBadge = pathname === '/' ? homepageSection : pageBadge;
  const mobileBadgeAccent =
    pathname === '/' ? homepageSection.accent : pageBadge?.badgeAccent;
  const mobileBadgeLabel =
    pathname === '/' ? homepageSection.label : pageBadge?.badge;
  const mobileBadgeOpacity =
    pathname === '/' ? (homepageBadgeVisible ? 1 : 0) : pageBadge ? 1 : 0;
  const desktopNavGap = interpolateMetric(10, 16, desktopViewportScale);
  const desktopNavFontSize = interpolateMetric(12.75, 13.5, desktopViewportScale);
  const desktopActionGap = interpolateMetric(8, 10, desktopViewportScale);
  const desktopNavSidePadding = interpolateMetric(2, 6, desktopViewportScale);
  const showDesktopBadge = viewportWidth >= 1180;
  const compactDesktopInstallButton = viewportWidth < 1080;

  const closeMenu = () => {
    setOpenPathname(null);
  };

  const toggleMenu = () => {
    mobileContextDropdown.close();
    setOpenPathname((current) => (current === pathname ? null : pathname));
  };

  const isActiveItem = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleMobileMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = mobileMenuScrollRef.current;
    if (!container || container.scrollHeight <= container.clientHeight) {
      return;
    }

    container.scrollTop += event.deltaY;
    event.preventDefault();
  };

  return (
    <motion.header
      {...fadeUpMotion(!!reduceMotion, {
        distance: 24,
        duration: 0.5,
        exitDistance: 12,
      })}
      className="fixed top-0 left-0 right-0 z-50 bg-transparent will-change-transform"
      animate={{
        opacity: 1,
        y: effectiveNavHidden ? -(mobileTopInset + mobileNavHeight + 8) : 0,
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.32,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {isOpen && !isDesktopViewport ? <MobileMenuScrollLock /> : null}

      <div
        className={cn(
          'container mx-auto md:pt-2',
          mobileContainerInsetClass
        )}
        style={{
          paddingTop: `${isDesktopViewport ? desktopTopInset : mobileTopInset}px`,
        }}
      >
        <motion.nav
          ref={navRef}
          className={cn(
            'relative z-30 flex items-center justify-between overflow-visible border px-4 shadow-[0_22px_56px_-30px_rgba(15,23,42,0.46)] transition-[border-color,background-color,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:mx-auto md:h-14 md:max-w-6xl md:rounded-[22px] md:border-border/45 md:bg-background/72 md:px-4 md:shadow-[0_24px_64px_-34px_rgba(15,23,42,0.32)] md:backdrop-blur-xl xl:max-w-[76rem]',
            compactMobileHeader
              ? 'border-border/35 bg-background/55 backdrop-blur-2xl'
              : 'border-border/45 bg-background/72 backdrop-blur-xl'
          )}
          style={{
            height: `${isDesktopViewport ? desktopNavHeight : mobileNavHeight}px`,
            borderRadius: `${isDesktopViewport ? desktopNavRadius : mobileNavRadius}px`,
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
              }}
            >
              <BrandLogo className="h-full w-full" />
            </div>
          </Link>
          )}

          <div className="flex min-w-0 flex-1 justify-center px-3 md:hidden">
            <div
              className="relative flex min-w-0 h-9 items-center"
              style={{ maxWidth: `${mobileBadgeMaxWidth}px` }}
              ref={mobileContextDropdown.containerRef}
            >
              {mobileBadge ? (
                <div
                  className="min-w-0"
                  style={{
                    opacity: mobileBadgeOpacity,
                    pointerEvents: mobileBadgeOpacity < 0.08 ? 'none' : 'auto',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (pathname === '/') {
                        document.getElementById(homepageSection.id)?.scrollIntoView({ behavior: 'smooth' });
                      } else if (activeGroup) {
                        mobileContextDropdown.toggle();
                      }
                    }}
                    className="group inline-flex h-9 max-w-full items-center"
                  >
                    <PortalBadge
                      accent={mobileBadgeAccent ?? 'slate'}
                      size="sm"
                      casing="uppercase"
                      tracking="normal"
                      className={cn(
                        'max-w-full truncate whitespace-nowrap border-white/10 bg-white/6 px-3.5 py-1.5 text-[10px] transition-all',
                        activeGroup
                          ? 'group-hover:border-white/20 group-active:scale-[0.97]'
                          : 'group-active:scale-[0.97]'
                      )}
                    >
                      {mobileBadgeLabel}
                      {activeGroup ? (
                        <ChevronDown
                          className={cn(
                            'ml-1 inline-block h-2.5 w-2.5 opacity-40 transition-transform',
                            mobileContextDropdown.isOpen && 'rotate-180'
                          )}
                        />
                      ) : null}
                    </PortalBadge>
                  </button>
                </div>
              ) : null}

              {/* Context switcher: sibling pages in same group */}
              {activeGroup ? (
                <FloatingPanelMenu
                  open={mobileContextDropdown.isOpen}
                  align="center"
                  offsetClass="mt-1"
                  className="w-[15rem]"
                  role="menu"
                >
                  <div className="p-1.5 space-y-0.5">
                    <p
                      className="px-3 pb-1 pt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: portalColors[activeGroup.accent] }}
                    >
                      {activeGroup.label}
                    </p>
                    {activeGroup.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isActiveItem(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={mobileContextDropdown.close}
                          className={cn(
                            floatingPanelItemClass,
                            '!gap-3',
                            active
                              ? floatingPanelItemSelectedClass
                              : 'text-muted-foreground'
                          )}
                          role="menuitem"
                          aria-current={active ? 'page' : undefined}
                        >
                          <span
                            className="shrink-0"
                            style={active ? { color: portalColors[activeGroup.accent] } : undefined}
                          >
                            <ItemIcon className="h-4 w-4" />
                          </span>
                          <span className="text-[13px] font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </FloatingPanelMenu>
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
            {/* Home link */}
            <Link
              href="/"
              className={cn(
                'shrink-0 whitespace-nowrap transition-colors',
                pathname === '/'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              style={{ fontSize: `${desktopNavFontSize}px` }}
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              Home
            </Link>

            {/* Group dropdowns */}
            {navGroups.map((group, groupIndex) => {
              const dropdown = groupDropdowns[groupIndex];
              const groupIsActive = group.items.some((item) =>
                isActiveItem(item.href)
              );

              return (
                <div
                  key={group.label}
                  className="relative flex h-10 shrink-0 items-center"
                  ref={dropdown.containerRef}
                >
                  <button
                    type="button"
                    onClick={() => {
                      // Close other dropdowns
                      groupDropdowns.forEach((d, i) => {
                        if (i !== groupIndex) d.close();
                      });
                      dropdown.toggle();
                    }}
                    className={cn(
                      'inline-flex h-10 items-center gap-1 whitespace-nowrap transition-colors',
                      dropdown.isOpen || groupIsActive
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    style={{ fontSize: `${desktopNavFontSize}px` }}
                    aria-expanded={dropdown.isOpen}
                    aria-haspopup="menu"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform',
                        dropdown.isOpen && 'rotate-180'
                      )}
                    />
                  </button>

                  <FloatingPanelMenu
                    open={dropdown.isOpen}
                    align="center"
                    offsetClass="mt-1"
                    className="w-[17rem]"
                    role="menu"
                  >
                    <div className="p-1.5 space-y-0.5">
                      {group.attribution ? (
                        <p className="px-3 pb-1 pt-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground/50">
                          {group.attribution}
                        </p>
                      ) : null}
                      {group.items.map((item, itemIndex) => {
                        const ItemIcon = item.icon;
                        return (
                        <motion.div
                          key={item.href}
                          {...fadeUpMotion(!!reduceMotion, {
                            distance: 6,
                            exitDistance: 4,
                            duration: 0.18,
                            delay: itemIndex * 0.022,
                          })}
                        >
                          <Link
                            href={item.href}
                            onClick={dropdown.close}
                            className={cn(
                              floatingPanelItemClass,
                              '!gap-3',
                              isActiveItem(item.href)
                                ? floatingPanelItemSelectedClass
                                : 'text-muted-foreground'
                            )}
                            role="menuitem"
                            tabIndex={dropdown.isOpen ? 0 : -1}
                            aria-current={
                              isActiveItem(item.href) ? 'page' : undefined
                            }
                          >
                            <span
                              className="shrink-0"
                              style={isActiveItem(item.href) ? { color: portalColors[group.accent] } : undefined}
                            >
                              <ItemIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <span className="block text-[13px] font-medium text-foreground">
                                {item.label}
                              </span>
                              <span className="block text-[11px] leading-tight text-muted-foreground/50">
                                {item.description}
                              </span>
                            </div>
                          </Link>
                        </motion.div>
                        );
                      })}
                    </div>
                  </FloatingPanelMenu>
                </div>
              );
            })}

            {/* App external link */}
            <Link
              href="https://onsocial.id"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
              style={{ fontSize: `${desktopNavFontSize}px` }}
            >
              App
              <ArrowUpRight className="h-3 w-3 opacity-50" />
            </Link>
          </div>

          {/* Desktop Actions */}
          <div
            ref={desktopActionsRef}
            className="hidden shrink-0 items-center md:flex"
            style={{ gap: `${desktopActionGap}px` }}
          >
            {showDesktopBadge ? (
              <div
                className="relative flex h-10 min-w-[96px] max-w-[180px] items-center justify-center"
                ref={desktopContextDropdown.containerRef}
              >
                {pathname === '/' ? (
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById(homepageSection.id)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                        className="group flex h-10 w-full items-center justify-center"
                    >
                      <PortalBadge
                        accent={homepageSection.accent}
                        size="sm"
                        casing="uppercase"
                        tracking="normal"
                        className="w-full justify-center border-white/10 bg-white/6 px-3 py-1.5 text-[10px] transition-all group-active:scale-[0.97]"
                      >
                        {homepageSection.label}
                      </PortalBadge>
                    </button>
                  </motion.div>
                ) : pageBadge ? (
                  <motion.div
                    initial={false}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (activeGroup) desktopContextDropdown.toggle();
                      }}
                        className="group flex h-10 w-full items-center justify-center"
                    >
                      <PortalBadge
                        accent={pageBadge.badgeAccent}
                        size="sm"
                        casing="uppercase"
                        tracking="normal"
                        className={cn(
                          'w-full justify-center border-white/10 bg-white/6 px-3 py-1.5 text-[10px] transition-all group-active:scale-[0.97]',
                          activeGroup && 'group-hover:border-white/20'
                        )}
                      >
                        {pageBadge.badge}
                        {activeGroup ? (
                          <ChevronDown
                            className={cn(
                              'ml-1 inline-block h-2.5 w-2.5 opacity-40 transition-transform',
                              desktopContextDropdown.isOpen && 'rotate-180'
                            )}
                          />
                        ) : null}
                      </PortalBadge>
                    </button>
                  </motion.div>
                ) : (
                  <div aria-hidden="true" className="h-[26px] w-full" />
                )}

                {/* Desktop context switcher */}
                {activeGroup ? (
                  <FloatingPanelMenu
                    open={desktopContextDropdown.isOpen}
                    align="center"
                    offsetClass="mt-1"
                    className="w-[15rem]"
                    role="menu"
                  >
                    <div className="p-1.5 space-y-0.5">
                      <p
                        className="px-3 pb-1 pt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: portalColors[activeGroup.accent] }}
                      >
                        {activeGroup.label}
                      </p>
                      {activeGroup.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isActiveItem(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={desktopContextDropdown.close}
                            className={cn(
                              floatingPanelItemClass,
                              '!gap-3',
                              active
                                ? floatingPanelItemSelectedClass
                                : 'text-muted-foreground'
                            )}
                            role="menuitem"
                            aria-current={active ? 'page' : undefined}
                          >
                            <span
                              className="shrink-0"
                              style={active ? { color: portalColors[activeGroup.accent] } : undefined}
                            >
                              <ItemIcon className="h-4 w-4" />
                            </span>
                            <span className="text-[13px] font-medium">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </FloatingPanelMenu>
                ) : null}
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
                y: 12,
                scale: 0.97,
                duration: 0.28,
                exitY: 8,
                exitScale: 0.99,
              })}
              className="fixed inset-x-0 z-20 px-4 md:hidden"
              onWheelCapture={handleMobileMenuWheel}
              style={{
                top: `${mobileMenuTop}px`,
                maxHeight: `calc(100dvh - ${mobileMenuTop + 16}px)`,
              }}
            >
              <div
                className={`container mx-auto flex max-w-2xl flex-col overflow-hidden ${floatingPanelClass}`}
                style={{
                  borderRadius: `${mobileMenuRadius}px`,
                  maxHeight: `calc(100dvh - ${mobileMenuTop + 16}px)`,
                }}
              >
                <div
                  ref={mobileMenuScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{
                    maxHeight: `calc(100dvh - ${mobileMenuTop + 16}px)`,
                    padding: `${mobileMenuPaddingY}px ${mobileMenuPaddingX}px`,
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  <div className="relative z-10 space-y-1">
                  {/* Home */}
                  <motion.div
                    {...fadeUpMotion(!!reduceMotion, {
                      distance: 12,
                      duration: 0.24,
                      delay: 0.02,
                    })}
                  >
                    <Link
                      href="/"
                      onClick={closeMenu}
                      className={cn(
                        floatingPanelItemClass,
                        'px-3 py-2 text-[14px]',
                        pathname === '/'
                          ? floatingPanelItemSelectedClass
                          : 'text-muted-foreground'
                      )}
                      aria-current={pathname === '/' ? 'page' : undefined}
                    >
                      Home
                    </Link>
                  </motion.div>

                  {/* Grouped sections */}
                  {navGroups.map((group, groupIndex) => {
                    const baseDelay = 0.05 + groupIndex * 0.08;
                    return (
                      <div key={group.label}>
                        <motion.div
                          {...fadeUpMotion(!!reduceMotion, {
                            distance: 12,
                            duration: 0.24,
                            delay: baseDelay,
                          })}
                          className="mt-3 mb-1"
                        >
                          <div className="flex items-center gap-2 px-3">
                            <span
                              className="text-[0.6rem] font-semibold uppercase tracking-[0.16em]"
                              style={{ color: portalColors[group.accent] }}
                            >
                              {group.label}
                            </span>
                            {group.attribution ? (
                              <span className="text-[0.55rem] tracking-wide text-muted-foreground/30">
                                {group.attribution}
                              </span>
                            ) : null}
                          </div>
                        </motion.div>
                        <div className="space-y-1">
                          {group.items.map((item, itemIndex) => {
                            const ItemIcon = item.icon;
                            const active = isActiveItem(item.href);
                            return (
                              <motion.div
                                key={item.href}
                                {...fadeUpMotion(!!reduceMotion, {
                                  distance: 12,
                                  duration: 0.24,
                                  delay: baseDelay + 0.02 + itemIndex * 0.026,
                                })}
                              >
                                <Link
                                  href={item.href}
                                  onClick={closeMenu}
                                  className={cn(
                                    'group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors',
                                    active
                                      ? 'bg-[var(--portal-slate-frame-bg)] text-foreground'
                                      : 'text-muted-foreground hover:bg-[var(--portal-slate-bg)] hover:text-foreground'
                                  )}
                                  aria-current={active ? 'page' : undefined}
                                >
                                  <span
                                    className="shrink-0 transition-colors"
                                    style={active ? { color: portalColors[group.accent] } : undefined}
                                  >
                                    <ItemIcon className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <span className="block text-[14px] font-medium leading-snug">
                                      {item.label}
                                    </span>
                                    <span className="block text-[11px] leading-tight text-muted-foreground/50">
                                      {item.description}
                                    </span>
                                  </div>
                                </Link>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* App external link */}
                  <motion.div
                    {...fadeUpMotion(!!reduceMotion, {
                      distance: 12,
                      duration: 0.24,
                      delay: 0.05 + navGroups.length * 0.08 + 0.04,
                    })}
                    className="mt-3"
                  >
                    <Link
                      href="https://onsocial.id"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeMenu}
                      className={cn(
                        floatingPanelItemClass,
                        'px-3 py-2 text-[14px] text-muted-foreground'
                      )}
                    >
                      App
                      <ArrowUpRight className="h-3.5 w-3.5 opacity-40" />
                    </Link>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.05 + navGroups.length * 0.08 + 0.09,
                      duration: 0.24,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="mt-3 border-t border-fade-section pt-3"
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
