import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handlers, Failure } from './oauth.mjs';
const env=name=>{const v=Deno.env.get(name);if(!v)throw new Error('Backend configuration missing');return v;};
const supabaseURL=env('SUPABASE_URL');
const keys=Deno.env.get('SUPABASE_SECRET_KEYS');
const serviceKey=keys?JSON.parse(keys).default:env('SUPABASE_SERVICE_ROLE_KEY');
const config={origin:env('APP_ORIGIN').replace(/\/$/,''),clientId:env('GOOGLE_CLIENT_ID'),clientSecret:env('GOOGLE_CLIENT_SECRET'),redirectUri:env('GOOGLE_REDIRECT_URI')};
if(new URL(config.origin).protocol!=='https:' || config.redirectUri!==`${supabaseURL}/functions/v1/gmail-oauth-callback`) throw new Error('Invalid OAuth configuration');
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const deps={config,fetch,
 async authenticate(req) {
   const bearer=req.headers.get('Authorization');
   if(!bearer?.startsWith('Bearer '))throw new Failure('login_required',401);
   const response=await fetch(`${supabaseURL}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:bearer},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Failure('login_required',401);
   const user=await response.json();
   if(!user.id||!user.email_confirmed_at||user.is_anonymous)throw new Failure('login_required',401);
   // Decode only AFTER the Auth server has validated this exact access token.
   let claims;try{claims=JSON.parse(atob(bearer.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new Failure('login_required',401);}
   if(claims.sub!==user.id || typeof claims.session_id!=='string')throw new Failure('login_required',401);
   return {id:user.id,session_id:claims.session_id};
 },
 async rpc(action,user,company,data,procedure='gmail_backend') {
   const response=await fetch(`${supabaseURL}/rest/v1/rpc/${procedure}`,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action,p_user_id:user?.id??null,p_session_id:user?.session_id??null,p_company:company,p_data:data}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Failure('storage_unavailable',503);
   return response.json();
 },
 async verifyIdToken(token,audience) {
   if(typeof token!=='string')throw new Failure('invalid_identity');
   const {payload}=await jwtVerify(token,jwks,{audience,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256'],requiredClaims:['exp','iat','sub','email','email_verified','nonce'],clockTolerance:5});
   if(payload.azp && payload.azp!==audience)throw new Failure('invalid_identity');
   return payload;
 }
};
export const app=handlers(deps);
