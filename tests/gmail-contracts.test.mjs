import test from 'node:test';import assert from 'node:assert/strict';
import {contractHandler} from '../supabase/functions/_shared/contracts.mjs';
import {robotHandler} from '../supabase/functions/_shared/robot.mjs';
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
function fixture(){const calls=[];return {calls,handler:contractHandler({config:{origin:'https://site.test'},authenticate:async()=>({id:'user',session_id:'session'}),rpc:async(...a)=>{calls.push(a);return {ok:true};}})};}
test('link requires explicit boolean confirmation',async()=>{const f=fixture();for(const confirmed of [undefined,false,'true'])assert.equal((await f.handler(request({action:'link',company:'HAMATE',message_id:'m',contract_id:'c',confirmed}))).status,400);assert.equal(f.calls.length,0);});
test('confirmed link forwards validated identifiers and identity',async()=>{const f=fixture();assert.equal((await f.handler(request({action:'link',company:'HAMATE',message_id:'m',contract_id:'c',confirmed:true,_robot_key:'injected',user_id:'fake'}))).status,200);assert.deepEqual(f.calls[0],['link',{id:'user',session_id:'session'},'HAMATE',{message_id:'m',contract_id:'c',confirmed:true},'gmail_contract_backend']);});
test('client cannot call worker routes',async()=>{const f=fixture();for(const action of ['scan','robot_check','credentials'])assert.equal((await f.handler(request({action,company:'HAMATE'}))).status,400);assert.equal(f.calls.length,0);});
test('invalid company rejected',async()=>{const f=fixture();assert.equal((await f.handler(request({action:'contracts',company:'OTHER'}))).status,400);});
test('robot rejects requests without key before database or Google',async()=>{let calls=0;const h=robotHandler({rpc:async()=>{calls++;}});assert.equal((await h(request({company:'HAMATE'}))).status,401);assert.equal(calls,0);});
test('robot rejects wrong secret',async()=>{const h=robotHandler({rpc:async()=>({ok:false})});const r=new Request('https://test',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)},body:'{}'});assert.equal((await h(r)).status,401);});
