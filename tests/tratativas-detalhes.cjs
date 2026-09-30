const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.TRATATIVAS_ROOT||'.';
const c={id:'detail-contract',orgao:'ÓRGÃO TESTE',contrato:'123/2026',processo:'PROC-456',empresa:'Empresa Teste',status:'Vigente',itens_lotes:[]};
let t={id:'11111111-1111-4111-8111-111111111111',contrato_id:c.id,tipo:'NOTIFICAÇÃO',tipo_tratativa:'Resposta à notificação',situacao:'AGUARDANDO RESPOSTA',status:'Aguardando órgão',prioridade:'Alta',empenho_ids:['emp-1','emp-2'],abrangencia:'empenhos',descricao:'Situação <img src=x onerror=alert(1)>',observacoes:'Documentos em análise',proxima_acao:'Enviar documentação',acompanhar_em:'2026-10-02',data_ocorrencia:'2026-09-01',criado_em:'2026-09-20T12:00:00Z',atualizado_em:'2026-09-29T10:00:00Z',versao:2,excluida:false};
let history=[{id:'event-b',tratativa_id:t.id,data_hora:'2026-09-29T12:00:00Z',ocorrida_em:'2026-09-29T10:00:00Z',descricao:'Contato anterior',tipo_movimentacao:'ligacao',origem:'manual',antes:{...t},depois:{...t},novo_status:t.situacao},{id:'event-a',tratativa_id:t.id,data_hora:t.criado_em,ocorrida_em:t.criado_em,descricao:'Abertura preservada',tipo_movimentacao:'observacao',origem:'sistema',antes:null,depois:{...t},novo_status:t.situacao}];
let calls=[],replies=new Map(),loseResponse=false,conflict=false,failHistory=false;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},timezoneId:'America/Sao_Paulo'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-09-30T15:00:00Z')});
 await page.route('https://**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').pop();
  if(!u.pathname.includes('/rest/v1/'))return route.abort();
  if(req.method()!=='GET'){
   assert.equal(table,'registrar_movimentacao_tratativa');const p=req.postDataJSON();calls.push(p);
   if(conflict)return route.fulfill({status:409,json:{code:'40001',message:'Conflito'}});
   if(replies.has(p.p_requisicao_id))return route.fulfill({json:replies.get(p.p_requisicao_id)});
   assert.equal(p.p_versao,t.versao);const before={...t},id='event-'+history.length;
   t={...t,versao:t.versao+1,nota_atualizacao:p.p_descricao,atualizado_em:'2026-09-30T15:00:00Z',...(p.p_status?{status:p.p_status,situacao:'EM ANÁLISE'}:{})};
   history.push({id,tratativa_id:t.id,data_hora:t.atualizado_em,ocorrida_em:p.p_ocorrida_em,tipo_movimentacao:p.p_tipo,origem:'manual',descricao:p.p_descricao,link_referencia:p.p_link_referencia,status_anterior:before.situacao,novo_status:t.situacao,antes:before,depois:{...t}});
   replies.set(p.p_requisicao_id,id);if(loseResponse){loseResponse=false;return route.abort();}return route.fulfill({json:id});
  }
  let data=[];
  if(table==='tratativas_administrativas')data=[t];
  if(table==='tratativas_historico'){if(failHistory)return route.fulfill({status:503,json:{message:'Erro'}});data=history;}
  if(table==='contratos_ativos')data=[c];
  if(table==='empenhos')data=[1,2].map(n=>({id:'emp-'+n,contrato_id:c.id,numero:'NE00'+n,status:'Pendente',itens_empenhados:[]}));
  return route.fulfill({json:data});
 });
 await page.goto('file:///'+path.resolve(root,'index.html').replaceAll('\\','/'));
 await page.waitForSelector('#dashTratativasList [data-trat-action="detail"]');
 await page.evaluate(()=>document.getElementById('kmCloudLoadingOverlay')?.remove());
 await page.locator('#dashTratativasList [data-trat-action="detail"]').click();
 await page.locator('#tratDetailAdd:enabled').waitFor();
 const detail=page.locator('#tratDetailContent');
 assert.equal(await detail.locator('dt').count(),8);
 for(const value of ['Empresa Teste','ÓRGÃO TESTE','PROC-456','123/2026','NE001, NE002','Não atribuído','Aguardando órgão','Alta','SITUAÇÃO ATUAL','PRÓXIMA AÇÃO','Enviar documentação','02/10/2026'])assert.match(await detail.innerText(),new RegExp(value,'i'));
 assert.equal(await detail.locator('img').count(),0);
 assert.deepEqual(await detail.locator('[data-event-id]').evaluateAll(es=>es.map(e=>e.dataset.eventId)),['event-a','event-b']);
 await page.locator('#tratDetailAdd').click();
 assert.equal(await page.locator('#tratMovementForm [name="tipo"] option').count(),9);
 await page.selectOption('#tratMovementForm [name="tipo"]','email_enviado');
 assert.equal(await page.locator('#tratMovementEmailNote').isVisible(),true);
 await page.selectOption('#tratMovementForm [name="tipo"]','observacao');
 await page.fill('#tratMovementForm [name="descricao"]','Nova observação preserva histórico');
 loseResponse=true;
 await page.locator('#tratMovementForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.getElementById('tratMovementError').textContent.length>0);
 assert.equal(history.length,3);
 await page.locator('#tratMovementForm button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('tratMovementDialog').open);
 await page.locator('#tratDetailAdd:enabled').waitFor();
 assert.equal(calls[0].p_requisicao_id,calls[1].p_requisicao_id);
 assert.equal(await detail.locator('[data-event-id]').count(),3);
 assert.match(await detail.innerText(),/Abertura preservada/i);assert.match(await detail.innerText(),/Contato anterior/i);
 await page.locator('#tratDetailAdd').click();
 await page.selectOption('#tratMovementForm [name="tipo"]','alteracao_status');
 await page.selectOption('#tratMovementForm [name="status"]','Em análise');
 await page.fill('#tratMovementForm [name="descricao"]','Iniciada análise');
 await page.locator('#tratMovementForm button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('tratMovementDialog').open);
 await page.locator('#tratDetailAdd:enabled').waitFor();
 assert.equal(await detail.locator('[data-event-id]').count(),4);
 assert.match(await detail.locator('.trat-detail-header').innerText(),/Em análise/i);
 await page.locator('#tratDetailAdd').click();
 await page.fill('#tratMovementForm [name="descricao"]','Rascunho não perdido');conflict=true;
 await page.locator('#tratMovementForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.getElementById('tratMovementError').textContent.includes('outra pessoa'));
 assert.equal(await page.inputValue('#tratMovementForm [name="descricao"]'),'RASCUNHO NÃO PERDIDO');assert.equal(history.length,4);
 await page.locator('#tratMovementForm [data-trat-action="cancel-movement"]').first().click();
 // O relógio está congelado; remove avisos transitórios antes da navegação mobile.
 await page.evaluate(()=>document.querySelectorAll('#toastContainer .km-toast').forEach(e=>e.remove()));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1100});
  const bounds=await detail.boundingBox();assert(bounds.x+bounds.width<=width+1);
  if(process.env.TRATATIVAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TRATATIVAS_SCREENSHOT_DIR,'tratativa-detalhe-'+width+'.png'),fullPage:true});
 }
 await page.locator('#tratativas-detalhes [data-trat-action="view-all"]').click();
 failHistory=true;await page.locator('#tratTodasLista [data-trat-action="detail"]').click();
 await page.locator('#tratDetailContent [data-trat-action="reload-detail"]').waitFor();
 assert.equal(await page.locator('#tratDetailAdd').isDisabled(),true);
 failHistory=false;await page.locator('#tratDetailContent [data-trat-action="reload-detail"]').click();
 await page.locator('#tratDetailAdd:enabled').waitFor();assert.equal(await detail.locator('[data-event-id]').count(),4);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: cabeçalho, situação, próxima ação, cronologia, escape, nove tipos, persistência, repetição segura, status, conflito, responsividade e erro/recuperação.');
})().catch(e=>{console.error(e);process.exit(1)});
