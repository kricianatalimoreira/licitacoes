import {company,MAILBOXES,GMAIL_SCOPE,Failure} from './oauth.mjs';
import {classifyReply} from './reply-classifier.mjs';
export function replyHandler(deps){return async req=>{
 const {config,fetch:request}=deps;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':config.origin,'Vary':'Origin'};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 let user,co,robotKey;
 const db=async(action,data={},proc='gmail_reply_backend')=>{
  const r=await deps.rpc(action,user,co,{...data,...(robotKey?{_robot_key:robotKey}:{})},proc);
  if(r?.error)throw new Failure(r.error,r.error==='not_authorized'?403:400);return r;
 };
 try{
  if(req.headers.get('Origin')&&req.headers.get('Origin')!==config.origin)throw new Failure('origin_denied',403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});
  if(req.method!=='POST')throw new Failure('method_not_allowed',405);
  const raw=await req.text();if(raw.length>4096)throw new Failure('invalid_request');
  let b;try{b=JSON.parse(raw);}catch{throw new Failure('invalid_request');}
  co=company(b.company);
  const bearer=req.headers.get('X-Monitor-Key');
  if(/^[a-f0-9]{64}$/.test(bearer||'')){robotKey=bearer;if(b.action!=='poll')throw new Failure('not_authorized',403);}
  else user=await deps.authenticate(req);
  const list=await db('list');
  if(b.action==='list')return response(list);
  if(!['search','bind','poll'].includes(b.action))throw new Failure('invalid_action');
  const treatment=b.action!=='poll'?list.treatments.find(t=>t.id===b.tratativa_id):null;
  if(b.action!=='poll'&&!treatment)throw new Failure('invalid_treatment');
  let creds=await db('credentials',{},'gmail_reply_backend');
  async function refresh(){
   const res=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:creds.refresh_token,client_id:config.clientId,client_secret:config.clientSecret}),signal:AbortSignal.timeout(12000)});
   const t=await res.json();
   if(!res.ok){if(t.error==='invalid_grant'){await db('invalid',{revision:creds.revision},'gmail_reply_backend');throw new Failure('reauthorize',401);}throw new Failure('google_unavailable',502);}
   if(!t.access_token||!Number.isFinite(t.expires_in)||t.expires_in<=0||t.token_type?.toLowerCase()!=='bearer'||(t.scope&&!t.scope.split(' ').includes(GMAIL_SCOPE)))throw new Failure('invalid_token_response',502);
   await db('refresh',{revision:creds.revision,access_token:t.access_token,refresh_token:t.refresh_token,expires_at:new Date(Date.now()+t.expires_in*1000).toISOString()},'gmail_reply_backend');
   creds=await db('credentials',{},'gmail_reply_backend');
  }
  if(new Date(creds.expires_at).getTime()<Date.now()+60000)await refresh();
  async function gmail(path,retry=true){
   const r=await request('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+creds.access_token},signal:AbortSignal.timeout(12000)});
   if(r.status===401&&retry){await refresh();return gmail(path,false);}
   if(!r.ok)throw new Failure(r.status===404?'thread_missing':r.status===429?'rate_limited':'google_unavailable',502);
   return r.json();
  }
  const profile=await gmail('profile');
  if(profile.emailAddress?.toLowerCase()!==MAILBOXES[co])throw new Failure('account_mismatch',403);
  const threadId=id=>{if(typeof id!=='string'||!(/^[a-f0-9]{1,64}$/).test(id))throw new Failure('invalid_thread');return id;};
  const getThread=id=>gmail('threads/'+threadId(id)+'?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Auto-Submitted&metadataHeaders=X-Autoreply&metadataHeaders=X-Autorespond');
  const header=(m,n)=>(m.payload?.headers||[]).find(h=>h.name.toLowerCase()===n)?.value||'';
  const addr=s=>{const v=String(s).trim().toLowerCase();const a=v.match(/<([^<>]+)>\s*$/)?.[1]||v;return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(a)?a:null;};
  const participants=m=>['from','to','cc'].flatMap(n=>(header(m,n).toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[]));
  const usable=m=>!['SPAM','TRASH','DRAFT'].some(l=>m.labelIds?.includes(l));
  if(b.action==='search'){
   if(typeof b.query!=='string'||!b.query.trim()||b.query.length>300)throw new Failure('invalid_query');
   const page=await gmail('threads?maxResults=10&includeSpamTrash=false&q='+encodeURIComponent('('+b.query.trim()+') -in:spam -in:trash'));
   const threads=[];
   for(const entry of page.threads||[]){
    const t=await getThread(entry.id),ms=(t.messages||[]).filter(usable).sort((a,b)=>Number(a.internalDate)-Number(b.internalDate));
    if(!ms.length)continue;
    const senders=[...new Set(ms.flatMap(participants).filter(a=>a&&a!==MAILBOXES[co]))];
    threads.push({id:t.id,subject:header(ms[0],'subject'),date:new Date(Number(ms.at(-1).internalDate)).toISOString(),senders,
      gmail_url:'https://mail.google.com/mail/?authuser='+encodeURIComponent(MAILBOXES[co])+'#all/'+t.id});
   }
   return response({threads,has_more:!!page.nextPageToken});
  }
  if(b.action==='bind'){
   const t=await getThread(b.thread_id);
   if(!Array.isArray(b.counterparts)||!b.counterparts.length||b.counterparts.length>20)throw new Failure('invalid_participants');
   const counterparts=[...new Set(b.counterparts.map(addr))];
   if(counterparts.includes(null)||counterparts.includes(MAILBOXES[co]))throw new Failure('invalid_participants');
   const actual=new Set((t.messages||[]).filter(usable).flatMap(participants));
   if(counterparts.some(a=>!actual.has(a)))throw new Failure('invalid_participants');
   classifyReply(t,{threadId:t.id,ownAddresses:[MAILBOXES[co]],counterpartAddresses:counterparts});
   await db('bind',{tratativa_id:treatment.id,thread_id:t.id,counterparts});
   return response({ok:true});
  }
  const targets=list.treatments.filter(t=>t.watch).sort((a,b)=>(Date.parse(a.watch.last_attempt_at)||0)-(Date.parse(b.watch.last_attempt_at)||0)).slice(0,10);
  let checked=0,failed=0;
  for(const t of targets){
   const w=t.watch,observed_at=new Date().toISOString();
   try{
    if(w.source_link!==t.link_gmail)throw new Failure('link_changed');
    const thread=await getThread(w.thread_id);
    const result=classifyReply(thread,{threadId:w.thread_id,ownAddresses:[MAILBOXES[co]],counterpartAddresses:w.counterpart_addresses});
    const iso=n=>n===null?null:new Date(n).toISOString();
    await db('save',{tratativa_id:t.id,revision:w.revision,observed_at,pending:result.pending,pending_since:iso(result.pendingSince),
     received_id:result.lastReceivedId,received_at:iso(result.lastReceivedAt),sent_id:result.lastSentId,sent_at:iso(result.lastSentAt)});
    checked++;
   }catch(e){failed++;await db('fail',{tratativa_id:t.id,revision:w.revision,error:e.code||'check_failed'}).catch(()=>{});}
  }
  return response({checked,failed,remaining:Math.max(0,list.treatments.filter(t=>t.watch).length-targets.length)});
 }catch(e){return response({error:e instanceof Failure?e.code:'reply_check_failed'},e instanceof Failure?e.status:500);}
};}
