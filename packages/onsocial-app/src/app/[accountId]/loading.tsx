/**
 * Intentionally empty — soft intercept navigations must not flash the portfolio
 * avatar skeleton over an already-mounted profile while the @overlay slot loads.
 * Full-page routes can add their own segment loading (e.g. standing/[kind]/loading).
 */
export default function AccountLoading() {
  return null;
}
