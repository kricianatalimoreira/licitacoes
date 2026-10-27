const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/org-registry/index.ts','utf8').replace("import './model.js';",''));
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token='header.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')+'.signature';
let handler,calls=[],user={id:uid,email_confirmed_at:'2026-01-01'},authStatus=200,rpcResult={orgaos:[],links:[],companies:['GADITA']};
const context={Request,Response,URL,atob,AbortSignal,KMOrgRegistryModel:require('../org-registry-model.js'),Deno:{env:{get:n=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-only',APP_ORIGIN:'https://site.test/'}[n])},serve:fn=>handler=fn},fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/user')?user:rpcResult),{status:url.endsWith('/user')?authStatus:200});}};vm.runInNewContext(source,context);
const req=(body,auth=true,origin='https://site.test')=>new Request('https://test.invalid',{method:'POST',headers:{Origin:origin,...(auth?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 assert.equal((await handler(req({action:'list'},false))).status,401);assert.equal(calls.length,0);
 assert.equal((await handler(req({action:'list'},true,'https://evil.test'))).status,403);assert.equal(calls.length,0);
 authStatus=401;assert.equal((await handler(req({action:'list'}))).status,401);assert.equal(calls.length,1);authStatus=200;
 user.is_anonymous=true;assert.equal((await handler(req({action:'list'}))).status,403);delete user.is_anonymous;
 let r=await handler(req({action:'list'}));assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://site.test');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(JSON.parse(calls.at(-1).options.body).p_session_id,sid);assert.equal((await r.text()).includes('server-only'),false);
 assert.equal((await handler(req({action:'bind',data:{}}))).status,400);
 assert.equal((await handler(req({action:'save',data:{nome:'A',municipio:'B',uf:'MG',tipo:'Prefeitura',cnpj:'invalid',contatos:[]}}))).status,400);
 rpcResult={error:'forbidden'};assert.equal((await handler(req({action:'list'}))).status,403);
 rpcResult={error:'login_required'};assert.equal((await handler(req({action:'list'}))).status,401);
 console.log('Backend: origem, sessão, usuário anônimo, identidade verificada, validação, propagação de autorização e ausência de segredo nas respostas aprovados.');
})().catch(e=>{console.error(e);process.exit(1)});

