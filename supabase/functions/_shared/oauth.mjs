export const MAILBOXES = Object.freeze({ HAMATE: 'hamateeletroinfo@gmail.com', GADITA: 'gaditaempreendimentos@gmail.com' });
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const SCOPES = ['openid', 'email', GMAIL_SCOPE];
const encoder = new TextEncoder();
export function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function random() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))); }
export async function stateHash(value) { return Array.from(await digest(value),b=>b.toString(16).padStart(2,'0')).join(''); }
export function company(value) { if (!Object.hasOwn(MAILBOXES,value)) throw new Failure('invalid_company',400); return value; }
export class Failure extends Error { constructor(code,status=400) { super(code); this.code=code; this.status=status; } }
export function verifyIdentity(payload, flow) {
  if (payload.nonce!==flow.nonce || payload.email_verified!==true || typeof payload.sub!=='string' || !payload.sub ||
      payload.email?.toLowerCase()!==MAILBOXES[flow.company] ||
      (flow.google_account_id && payload.sub!==flow.google_account_id)) throw new Failure('account_mismatch');
}
export function authorizationURL(config, flow) {
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',
    scope:SCOPES.join(' '),access_type:'offline',prompt:'consent select_account',state:flow.state,
    nonce:flow.nonce,login_hint:MAILBOXES[flow.company],code_challenge:flow.challenge,code_challenge_method:'S256'}).toString();
  return url.href;
}
export function handlers(deps) {
 const {config,rpc,authenticate,verifyIdToken,fetch:request}=deps;
 const headers={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json','Access-Control-Allow-Origin':config.origin,'Vary':'Origin'}});
 const db=async(action,user,co=null,data={})=>{
   const result=await rpc(action,user,co,data);
   if(result?.error) throw new Failure(result.error,result.error==='not_authorized'?403:400);
   return result;
 };
 const post=async(url,body)=>{
   const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok) throw new Failure(data.error==='invalid_grant'?'reauthorize':'google_unavailable',502);
   return data;
 };
 const checkProfile=async(token,email)=>{
   const res=await request('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
   if(!res.ok) throw new Failure(res.status===401?'reauthorize':'google_unavailable',502);
   const profile=await res.json();
   if(profile.emailAddress?.toLowerCase()!==email) throw new Failure('account_mismatch');
 };
 const tokenExpiry=t=>{
   if(typeof t.access_token!=='string'||!t.access_token||!Number.isFinite(t.expires_in)||t.expires_in<=0||t.token_type?.toLowerCase()!=='bearer') throw new Failure('invalid_token_response',502);
   return new Date(Date.now()+t.expires_in*1000).toISOString();
 };
 async function accounts(req) {
  try {
   if(req.headers.get('Origin') && req.headers.get('Origin')!==config.origin) throw new Failure('origin_denied',403);
   if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Origin':config.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}});
   if(req.method!=='POST') throw new Failure('method_not_allowed',405);
   const user=await authenticate(req);
   if(Number(req.headers.get('Content-Length')||0)>2048) throw new Failure('invalid_request');
   const raw=await req.text(); if(raw.length>2048) throw new Failure('invalid_request');
   let body; try{body=JSON.parse(raw);}catch{throw new Failure('invalid_request');}
   if(body.action==='list') return json({accounts:await db('accounts',user)});
   const co=company(body.company);
   if(body.action==='connect') {
     const state=random(),verifier=random(),nonce=random();
     const challenge=base64url(await digest(verifier));
     await db('start',user,co,{state_hash:await stateHash(state),verifier,nonce});
     return json({authorization_url:authorizationURL(config,{state,nonce,company:co,challenge})});
   }
   if(body.action==='check') {
     let credentials=await db('credentials',user,co);
     try {
       if(new Date(credentials.expires_at).getTime()<Date.now()+60000) {
         const token=await post('https://oauth2.googleapis.com/token',{grant_type:'refresh_token',refresh_token:credentials.refresh_token,client_id:config.clientId,client_secret:config.clientSecret});
         if(token.scope && !token.scope.split(' ').includes(GMAIL_SCOPE)) throw new Failure('reauthorize');
         await db('refresh',user,co,{revision:credentials.revision,access_token:token.access_token,refresh_token:token.refresh_token,expires_at:tokenExpiry(token)});
         credentials=await db('credentials',user,co);
       }
       await checkProfile(credentials.access_token,MAILBOXES[co]);
       await db('checked',user,co,{revision:credentials.revision});
     } catch(error) {
       if(error.code==='reauthorize'||error.code==='account_mismatch') await db('invalid',user,co,{revision:credentials.revision});
       throw error;
     }
     return json({ok:true,accounts:await db('accounts',user)});
   }
   throw new Failure('invalid_action');
  } catch(error) { return json({error:error instanceof Failure?error.code:'internal_error'},error instanceof Failure?error.status:500); }
 }
 async function callback(req) {
   // No HTML/third-party resources and no provider errors, codes or tokens in redirects.
   let result='failed';
   try {
     if(req.method!=='GET') return new Response('Method not allowed',{status:405,headers});
     const url=new URL(req.url),state=url.searchParams.get('state');
     if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Failure('invalid_state');
     const flow=await db('consume',null,null,{state_hash:await stateHash(state)});
     if(url.searchParams.has('error')) throw new Failure('consent_denied');
     const code=url.searchParams.get('code');
     if(!code||code.length>4096) throw new Failure('invalid_code');
     const token=await post('https://oauth2.googleapis.com/token',{grant_type:'authorization_code',code,
       client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code_verifier:flow.verifier});
     const expires_at=tokenExpiry(token);
     const payload=await verifyIdToken(token.id_token,config.clientId);
     verifyIdentity(payload,flow);
     if(!token.scope?.split(' ').includes(GMAIL_SCOPE)) throw new Failure('missing_scope');
     if(!token.refresh_token) throw new Failure('missing_refresh_token');
     await checkProfile(token.access_token,MAILBOXES[flow.company]);
     await db('finish',{id:flow.user_id,session_id:flow.session_id},flow.company,{flow_id:flow.flow_id,email:payload.email,
       sub:payload.sub,access_token:token.access_token,refresh_token:token.refresh_token,expires_at,scopes:token.scope.split(' ')});
     result='connected';
   } catch(error) {
     if(error instanceof Failure && ['account_mismatch','consent_denied','missing_scope','missing_refresh_token','expired_state','invalid_state','superseded','not_authorized'].includes(error.code)) result=error.code;
   }
   return new Response(null,{status:303,headers:{...headers,Location:`${config.origin}/gmail.html?oauth=${result}`}});
 }
 return {accounts,callback};
}
