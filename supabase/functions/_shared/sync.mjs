import {company,MAILBOXES,GMAIL_SCOPE,Failure} from './oauth.mjs';
export function metadata(message) {
 const headers=message.payload?.headers||[];
 const all=name=>headers.filter(h=>h.name?.toLowerCase()===name).map(h=>String(h.value||'').slice(0,32000));
 const first=name=>all(name)[0]||null;
 const labels=message.labelIds||[];
 const date=Number(message.internalDate);
 if(!message.id||!Number.isSafeInteger(date)||date<0||date>8640000000000000)throw new Failure('invalid_message',502);
 return {gmail_message_id:message.id,gmail_thread_id:message.threadId||null,history_id:message.historyId||null,
  message_id:first('message-id'),in_reply_to:first('in-reply-to'),reference_ids:(all('references').join(' ').match(/<[^>]+>/g)||[]),
  sender:first('from'),recipients:all('to'),cc:all('cc'),subject:first('subject'),internal_date:String(date),
  message_date:new Date(date).toISOString(),preview:String(message.snippet||'').slice(0,8000),is_read:!labels.includes('UNREAD'),
  in_inbox:labels.includes('INBOX')&&!labels.includes('TRASH')&&!labels.includes('SPAM'),labels};
}
export function historyIDs(page) {
 const ids=new Set();
 for(const h of page.history||[]) {
  for(const m of h.messages||[])if(m.id)ids.add(m.id);
  for(const key of ['messagesAdded','messagesDeleted','labelsAdded','labelsRemoved'])for(const change of h[key]||[])if(change.message?.id)ids.add(change.message.id);
 }
 return [...ids];
}
export function syncHandler(deps) {
 const {config,fetch:request,authenticate,rpc}=deps;
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':config.origin,'Vary':'Origin','X-Content-Type-Options':'nosniff'}});
 return async req=>{
  let user,co,lease;
  const db=async(action,data={})=>{const r=await rpc(action,user,co,data,'gmail_sync_backend');if(r?.error)throw new Failure(r.error,r.error==='not_authorized'?403:r.error==='sync_busy'?409:400);return r;};
  const account=async(action,data={})=>{const r=await rpc(action,user,co,data);if(r?.error)throw new Failure(r.error,r.error==='not_authorized'?403:400);return r;};
  try {
   if(req.headers.get('Origin')&&req.headers.get('Origin')!==config.origin)throw new Failure('origin_denied',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':config.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}});
   if(req.method!=='POST')throw new Failure('method_not_allowed',405);
   user=await authenticate(req);
   const raw=await req.text();if(raw.length>2048)throw new Failure('invalid_request');
   let body;try{body=JSON.parse(raw);}catch{throw new Failure('invalid_request');}
   co=company(body?.company);
   if(body.action==='messages')return response(await db('list',{before_date:body.before_date,before_id:body.before_id}));
   if(body.action!=='sync')throw new Failure('invalid_action');
   const claimed=await db('claim');lease=claimed.lease_id;
   let state=structuredClone(claimed.state),creds=await account('credentials');
   async function refresh(){
    const res=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'refresh_token',refresh_token:creds.refresh_token,client_id:config.clientId,client_secret:config.clientSecret}),signal:AbortSignal.timeout(12000)});
    const t=await res.json();
    if(!res.ok){if(t.error==='invalid_grant'){await account('invalid',{revision:creds.revision});throw new Failure('reauthorize',401);}throw new Failure('google_unavailable',502);}
    if(!t.access_token||!Number.isFinite(t.expires_in)||t.expires_in<=0||t.token_type?.toLowerCase()!=='bearer'||(t.scope&&!t.scope.split(' ').includes(GMAIL_SCOPE)))throw new Failure('invalid_token_response',502);
    await account('refresh',{revision:creds.revision,access_token:t.access_token,refresh_token:t.refresh_token,expires_at:new Date(Date.now()+t.expires_in*1000).toISOString()});
    creds=await account('credentials');
   }
   if(new Date(creds.expires_at).getTime()<Date.now()+60000)await refresh();
   async function gmail(path,allow404=false,retry=true){
    const res=await request(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${creds.access_token}`},signal:AbortSignal.timeout(12000)});
    if(res.status===401&&retry){await refresh();return gmail(path,allow404,false);}
    if(res.status===404&&allow404)return null;
    if(!res.ok)throw new Failure(res.status===429?'rate_limited':res.status===400?'invalid_page':'google_unavailable',502);
    return res.json();
   }
   let messages=[],full_complete=false,generation=state.generation||null;
   if(state.phase==='idle')state=state.cursor?{phase:'history',cursor:state.cursor}:{phase:'full'};
   if(state.phase==='full'&&!state.generation){
    const profile=await gmail('profile');
    if(profile.emailAddress?.toLowerCase()!==MAILBOXES[co])throw new Failure('account_mismatch');
    if(typeof profile.historyId!=='string')throw new Failure('invalid_history',502);
    state={phase:'full',generation:crypto.randomUUID(),baseline:profile.historyId,page_token:null};
   }
   generation=state.generation||null;
   let ids=[];
   if(state.phase==='full'){
    let page;
    try{page=await gmail(`messages?labelIds=INBOX&maxResults=20${state.page_token?'&pageToken='+encodeURIComponent(state.page_token):''}`);}
    catch(e){if(e.code==='invalid_page'&&state.page_token){const result=await db('commit',{lease_id:lease,state:{phase:'full'},messages:[]});lease=null;return response({...result,restarting:true});}throw e;}
    ids=(page.messages||[]).map(m=>m.id);
    if(page.nextPageToken)state.page_token=page.nextPageToken;
    else{full_complete=true;state={phase:'history',cursor:state.baseline};}
   }else if(state.phase==='history'){
    if(!state.pending?.length){
     const page=await gmail(`history?maxResults=20&startHistoryId=${encodeURIComponent(state.cursor)}${state.page_token?'&pageToken='+encodeURIComponent(state.page_token):''}`,true);
     if(page===null){const result=await db('commit',{lease_id:lease,state:{phase:'full'},messages:[]});lease=null;return response({...result,restarting:true});}
     state.pending=historyIDs(page);state.page_token=page.nextPageToken||null;state.latest=page.historyId;
     if(typeof state.latest!=='string')throw new Failure('invalid_history',502);
    }
    ids=state.pending.splice(0,20);
    if(!state.pending.length&&!state.page_token)state={phase:'idle',cursor:state.latest};
   }else throw new Failure('invalid_sync_state',500);
   // Bounded concurrency and batch size prevent long-running edge invocations.
   for(let i=0;i<ids.length;i+=5){
    const batch=await Promise.all(ids.slice(i,i+5).map(async id=>{
     const m=await gmail(`messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Date`,true);
     return m?metadata(m):{gmail_message_id:id,in_inbox:false};
    }));messages.push(...batch);
   }
   const result=await db('commit',{lease_id:lease,state,messages,full_complete,generation});lease=null;
   return response(result);
  }catch(e){
   if(lease)try{await db('fail',{lease_id:lease});}catch{/* Leave lease to expire; never log tokens/messages. */}
   return response({error:e instanceof Failure?e.code:'sync_failed'},e instanceof Failure?e.status:500);
  }
 };
}
