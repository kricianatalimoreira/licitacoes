import './model.js';
const env=(name:string)=>Deno.env.get(name)||'';
const base=env('SUPABASE_URL');
let secret=env('SUPABASE_SERVICE_ROLE_KEY');
try{secret=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||secret;}catch{}
const origin=(env('APP_ORIGIN')||'https://km-licitacoes.vercel.app').replace(/\/$/,'');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply({error:'forbidden'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply({error:'login_required'},401);
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:secret,Authorization:authorization}});
  if(!auth.ok)return reply({error:auth.status>=500?'network_error':'login_required'},auth.status>=500?503:401);
  const user=await auth.json();
  if(!uuid(user.id)||user.is_anonymous||!user.email_confirmed_at)return reply({error:'forbidden'},403);
  // Claims are used only after Auth has verified this exact bearer token.
  const encoded=authorization.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
  if(claims.sub!==user.id||!uuid(claims.session_id))return reply({error:'login_required'},401);
  const raw=await req.text();if(raw.length>20000)return reply({error:'invalid_request'},400);
  const body=JSON.parse(raw);let data=body.data||{};
  if(!['list','save','bind','unbind'].includes(body.action))return reply({error:'invalid_action'},400);
  if(body.action==='save'){
   try{data={...globalThis.KMOrgRegistryModel.validate(data),id:data.id||null,revision:data.revision};}catch(e){return reply({error:'invalid_data',message:(e as Error).message},400);}
   if(data.id&&(!uuid(data.id)||!Number.isInteger(data.revision)||data.revision<1))return reply({error:'invalid_request'},400);
  }
  if(['bind','unbind'].includes(body.action)){
   if(!['contrato','empenho'].includes(data.kind)||!['HAMATE','GADITA'].includes(data.company)||typeof data.record_id!=='string'||!data.record_id||data.record_id.length>200||typeof data.source_name!=='string'||data.source_name.length>1000||!Number.isInteger(data.revision)||data.revision<0||data.confirmed!==true||(body.action==='bind'&&!uuid(data.orgao_id)))return reply({error:'invalid_request'},400);
  }
  const r=await fetch(base+'/rest/v1/rpc/org_registry_backend',{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_user_id:user.id,p_session_id:claims.session_id,p_data:data})});
  if(!r.ok)return reply({error:'storage_error'},503);
  const result=await r.json();return reply(result,result.error?(result.error==='login_required'?401:result.error==='forbidden'?403:409):200);
 }catch{return reply({error:'network_error'},503);}
});

