import { kommoBase } from '../../src/kommo.mts';
import { validState, sessionCookie, cookie, redirectUri } from '../../src/oauth-security.mts';
import { consumeState, exchange, saveTokens, expectedAccount } from '../../src/oauth-vault.mts';
export default async (request:Request) => {
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':cookie('',0)};
 let stage='validate';
 if(request.method!=='GET') return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
 try {
  const input=new URL(request.url),code=input.searchParams.get('code'),state=input.searchParams.get('state'),session=sessionCookie(request);
  if(input.origin!==new URL(redirectUri()).origin||!code||!state||!validState(state,session)) return Response.json({error:'Invalid OAuth callback'},{status:400,headers});
  stage='consume_state';
  if(!await consumeState(state,session)) return Response.json({error:'Expired or consumed OAuth callback'},{status:400,headers});
  stage='exchange_code';
  const base=kommoBase(),tokens=await exchange(base,{grant_type:'authorization_code',code});
  stage='verify_account';
  const response=await fetch(`${base}/api/v4/account`,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if(!response.ok) throw new Error('Account verification failed');
  const account=await response.json() as {id?:unknown};
  if(String(account.id)!==expectedAccount()) throw new Error('Account mismatch');
  stage='save_tokens';
  await saveTokens(base,tokens);
  return new Response('ELEAR Home authorization verified. You may close this window.',{headers:{...headers,'content-type':'text/plain; charset=utf-8'}});
 } catch {return Response.json({error:'OAuth authorization failed; restart the authorization flow',stage},{status:502,headers});}
};

