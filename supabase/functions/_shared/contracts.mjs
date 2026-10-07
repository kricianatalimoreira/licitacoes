import {company,Failure} from './oauth.mjs';
export function contractHandler({config,authenticate,rpc}) {
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':config.origin,'Vary':'Origin'};
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try {
   if(req.headers.get('Origin')&&req.headers.get('Origin')!==config.origin)throw new Failure('origin_denied',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}});
   if(req.method!=='POST')throw new Failure('method_not_allowed',405);
   const user=await authenticate(req),raw=await req.text();
   if(raw.length>2048)throw new Failure('invalid_request');
   let body;try{body=JSON.parse(raw);}catch{throw new Failure('invalid_request');}
   const co=company(body.company);
   if(!['contracts','suggestions','message','link','reject','unlink'].includes(body.action))throw new Failure('invalid_action');
   for(const key of ['message_id','contract_id'])if(body[key]!==undefined&&(typeof body[key]!=='string'||!body[key]||body[key].length>200))throw new Failure('invalid_request');
   if(['message','link','reject','unlink'].includes(body.action)&&!body.message_id)throw new Failure('invalid_request');
   if(['link','reject'].includes(body.action)&&!body.contract_id)throw new Failure('invalid_request');
   if(body.action==='link'&&body.confirmed!==true)throw new Failure('confirmation_required');
   const result=await rpc(body.action,user,co,{message_id:body.message_id,contract_id:body.contract_id,confirmed:body.confirmed===true},'gmail_contract_backend');
   if(result.error)throw new Failure(result.error,result.error==='not_authorized'?403:400);
   return response(result);
  }catch(e){return response({error:e instanceof Failure?e.code:'request_failed'},e instanceof Failure?e.status:500);}
 };
}
