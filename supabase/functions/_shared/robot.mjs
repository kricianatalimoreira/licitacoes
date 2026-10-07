import {syncHandler} from './sync.mjs';
import {company} from './oauth.mjs';
export function robotHandler(deps){return async req=>{
 const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 try{
  if(req.method!=='POST')return answer({error:'method_not_allowed'},405);
  const key=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!key||!/^[a-f0-9]{64}$/.test(key))return answer({error:'not_authorized'},401);
  const allowed=await deps.rpc('robot_check',null,null,{_robot_key:key},'gmail_contract_backend');
  if(!allowed.ok)return answer({error:'not_authorized'},401);
  const body=await req.text();if(body.length>256)return answer({error:'invalid_request'},400);
  const co=company(JSON.parse(body).company);
  const worker={...deps,authenticate:async()=>null,rpc:(action,user,c,data={},proc)=>deps.rpc(action,null,c,{...data,_robot_key:key},proc)};
  // One durable batch per invocation; no Google credentials leave this function.
  const result=await syncHandler(worker)(new Request('https://internal/sync',{method:'POST',body:JSON.stringify({action:'sync',company:co})}));
  const sync=await result.json();
  const scan=await worker.rpc('scan',null,co,{},'gmail_contract_backend');
  return answer({company:co,sync,scan},result.status);
 }catch{return answer({error:'robot_failed'},500);}
};}
