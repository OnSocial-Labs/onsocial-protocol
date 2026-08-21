/**
 * Intentionally empty — soft intercept navigations must not flash the portfolio
 * avatar skeleton over an already-mounted profile while the @overlay slot loads.
 * Full-page panel routes can add their own segment loading when needed.
 */
export default function AccountLoading() {
  return null;
}
