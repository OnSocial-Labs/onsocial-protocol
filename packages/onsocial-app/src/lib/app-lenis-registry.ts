/** Lenis owns overflow roots. Restoring `scrollTop` alone gets overwritten. */

export type AppLenisScroll = {
  readonly limit: number;
  resize: () => void;
  scrollTo: (
    target: number,
    options: { immediate: true; force: true }
  ) => void;
};

const byElement = new WeakMap<HTMLElement, AppLenisScroll>();

export function registerAppLenis(
  element: HTMLElement,
  lenis: AppLenisScroll
): void {
  byElement.set(element, lenis);
}

export function unregisterAppLenis(element: HTMLElement): void {
  byElement.delete(element);
}

export function getAppLenis(element: HTMLElement): AppLenisScroll | null {
  return byElement.get(element) ?? null;
}
