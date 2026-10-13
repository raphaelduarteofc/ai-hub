import { requiredEnv } from '../../src/config.mts';
import { newState, cookie, redirectUri } from '../../src/oauth-security.mts';
import { addState } from '../../src/oauth-vault.mts';
export default async (request:Request) => {
 if(request.method!=='GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
 try {
  const redirect=redirectUri();
  if(new URL(request.url).origin!==new URL(redirect).origin) return new Response(null,{status:400});
  const clientId=requiredEnv('KOMMO_CLIENT_ID'),v=newState();await addState(v.state,v.session,v.expiresAt);
  const url=new URL('https://www.kommo.com/oauth');
  url.searchParams.set('client_id',clientId);url.searchParams.set('state',v.state);url.searchParams.set('redirect_uri',redirect);
  return new Response(null,{status:302,headers:{Location:url.href,'Set-Cookie':cookie(v.session),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 } catch {return Response.json({error:'OAuth initialization unavailable'},{status:503});}
};
