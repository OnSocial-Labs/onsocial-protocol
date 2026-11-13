import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import { portfolioPath } from '@/lib/overlay-routes';

/**
 * Confirmed-empty shelf. Visitors leave for the face before the shelf paints.
 * The owner stays and sees the empty invitation. The count is baked in by
 * the server; this only reads the wallet id, which the server does not have.
 */
export function visitorEmptyWritingRedirectScript(accountId: string): string {
  const face = portfolioPath(accountId);
  return `(function(){
    try {
      var id=localStorage.getItem(${JSON.stringify(APP_WALLET_ACCOUNT_KEY)})||'';
      if (id.toLowerCase()===${JSON.stringify(accountId.toLowerCase())}) return;
      location.replace(${JSON.stringify(face)});
    } catch (e) {
      location.replace(${JSON.stringify(face)});
    }
  })();`;
}
