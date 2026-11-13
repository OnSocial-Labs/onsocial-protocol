import { gateContinuePath } from '@/lib/overlay-routes';

export const APP_WALLET_ACCOUNT_KEY = 'onsocial.app.wallet.accountId';

const STORED_ACCOUNT_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function gateReturnHref(
  accountId: string,
  search: string
): string | null {
  if (!STORED_ACCOUNT_ID.test(accountId)) return null;
  return gateContinuePath(accountId, search);
}

/**
 * Full load of `/` only.
 * Client navigations still use the gate redirect.
 */
export const gateReturnScript = `(function(){
  if(document.documentElement.getAttribute('data-gate-return')==='1') return;
  document.documentElement.setAttribute('data-gate-return','1');
  try{
    if(location.pathname!=='/') return;
    var id=localStorage.getItem(${JSON.stringify(APP_WALLET_ACCOUNT_KEY)});
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
