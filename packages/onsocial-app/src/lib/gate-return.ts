import { gateContinuePath } from '@/lib/overlay-routes';

/** Same key as `app-wallet-context.tsx`. */
export const APP_WALLET_ACCOUNT_STORAGE_KEY = 'onsocial.app.wallet.accountId';

const STORED_ACCOUNT_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Path a stored account should open. Null when the id is not an account id. */
export function gateReturnHref(
  accountId: string,
  search: string
): string | null {
  if (!STORED_ACCOUNT_ID.test(accountId)) return null;
  return gateContinuePath(accountId, search);
}

/**
 * Full load of `/` only. A stored account leaves before the gate paints.
 * Client navigations still use the gate redirect.
 */
export const gateReturnScript = `(function(){
  try{
    if(location.pathname!=='/') return;
    var id=localStorage.getItem(${JSON.stringify(APP_WALLET_ACCOUNT_STORAGE_KEY)});
    if(!id||!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) return;
    var sheet='';
    try{
      var raw=new URLSearchParams(location.search||'').get('sheet')||'';
      raw=raw.trim().toLowerCase();
      if(raw==='boost'||raw==='rally') sheet=raw;
    }catch(e){}
    var path='/@'+encodeURIComponent(id);
    if(sheet) path+='?sheet='+sheet;
    location.replace(path);
  }catch(e){}
})();`;
