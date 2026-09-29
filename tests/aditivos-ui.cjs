const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.ADITIVOS_ROOT||'.';
const c={id:'test-contract',data:'2025-12-11',data_fim:'2026-12-11',valor:1000,orgao:'ÓRGÃO TESTE',contrato:'123/2025',empresa:'Empresa Teste',status:'Vigente',compra:600,itens_lotes:[]};
const treatments=[{id:'11111111-1111-4111-8111-111111111111',contrato_id:c.id,tipo:'CANCELAMENTO',situacao:'AGUARDANDO RESPOSTA',descricao:'Teste',data_ocorrencia:'2026-09-29',versao:1},{id:'22222222-2222-4222-8222-222222222222',contrato_id:'another',tipo:'NOTIFICAÇÃO',situacao:'AGUARDANDO RESPOSTA'}];
const treatmentBefore=JSON.stringify(treatments);let rows=[],bases=[],hist=[],writes=[],fail=false,conflict=false;
function recalc(){const b=bases[0];if(!b)return;b.vencimento_atual=b.vencimento_original;b.valor_atual=b.valor_original;for(const a of rows.filter(x=>!x.excluido&&x.status==='Formalizado').sort((a,b)=>a.data_aditivo.localeCompare(b.data_aditivo)||a.created_at.localeCompare(b.created_at))){if(a.nova_vigencia)b.vencimento_atual=a.nova_vigencia;if(a.novo_valor!==null)b.valor_atual+=a.novo_valor-a.valor_anterior;}c.data_fim=b.vencimento_atual;c.valor=b.valor_atual;}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const p=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').pop(),method=req.method();
  if(!u.pathname.includes('/rest/v1/'))return route.abort();let data=[];
  if(method!=='GET')writes.push({table,method});
  if(table==='contrato_aditivos'){
   if(method==='GET')data=rows;else{
    if(fail)return route.fulfill({status:500,json:{message:'Falha simulada'}});
    if(conflict)return route.fulfill({json:[]});
    const d=req.postDataJSON(),old=rows.find(a=>a.id===(u.searchParams.get('id')||'').slice(3));
    if(!bases.length)bases=[{contrato_id:c.id,data_original:c.data,vencimento_original:c.data_fim,valor_original:c.valor}];
    const saved={...old,...d,id:old?.id||d.id,versao:(old?.versao||0)+1,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),excluido:d.excluido||false};
    rows=rows.filter(x=>x.id!==saved.id).concat(saved);hist.push({acao:old?'Editado':'Criado',criado_em:saved.updated_at,antes:old,depois:saved});recalc();data=[saved];
   }
  }else if(table==='contrato_aditivos_base')data=bases;
  else if(table==='contrato_aditivos_historico')data=hist;
  else if(table==='contratos_ativos')data=[c];
  else if(table==='tratativas_administrativas')data=treatments;
  return route.fulfill({json:data});
 });
 await p.goto('file:///'+path.resolve(root,'index.html').replaceAll('\\','/'));
 await p.waitForFunction(()=>window.KMAditivos&&contratosAtivos.length);
 await p.evaluate(()=>{document.getElementById('kmCloudLoadingOverlay')?.remove();document.documentElement.setAttribute('data-mode','light');showSection('contratos-ativos');abrirConView('test-contract','ativo');});
 await p.locator('[data-ad-action="new"]').waitFor({state:'visible'});
 await p.waitForFunction(()=>!document.querySelector('[data-ad-action="new"]').disabled);
 assert.match(await p.locator('#conViewAditivos').innerText(),/NENHUM ADITIVO/);
 assert(await p.locator('#conViewAditivos').evaluate(e=>e.previousElementSibling.querySelector('#conViewEmpGrid')&&e.nextElementSibling.id==='conViewTratativas'));
 async function create(type,state,fields={}){
  await p.locator('[data-ad-action="new"]').click();await p.selectOption('#adForm [name="tipo"]',type);await p.selectOption('#adForm [name="status"]',state);
  for(const [k,v] of Object.entries(fields))await p.fill('#adForm [name="'+k+'"]',String(v));
 }
 async function save(){await p.locator('#adForm button[type="submit"]').click();await p.waitForFunction(()=>!document.querySelector('#adEditor').open);await p.waitForFunction(()=>!document.querySelector('[data-ad-action="new"]').disabled);}
 async function values(end,value){await p.waitForFunction(({end,value})=>contratosAtivos[0].dataFim===end&&contratosAtivos[0].valor===value,{end,value});}
 await create('Prorrogação de vigência','Aguardando formalização',{numero_aditivo:'1º Termo',nova_vigencia:'2027-12-11'});
 assert.equal(await p.locator('#adForm [name="valor_anterior"]').isVisible(),false);
 assert.equal(await p.locator('#adForm [name="tratativa_id"] option').count(),2);
 await p.selectOption('#adForm [name="tratativa_id"]',treatments[0].id);await save();
 await values('2026-12-11',1000);assert.match(await p.locator('#conViewMetrics1').innerText(),/PRORROGAÇÃO EM ANDAMENTO/);
 const first=rows[0].id;
 await p.locator('[data-ad-action="edit"][data-id="'+first+'"]').click();await p.selectOption('#adForm [name="status"]','Formalizado');
 const before=writes.length;await p.locator('#adForm button[type="submit"]').click();assert.equal(writes.length,before);assert.equal(await p.locator('#adEditor').evaluate(e=>e.open),true);
 await p.fill('#adForm [name="data_aditivo"]','2026-12-05');await save();await values('2027-12-11',1000);
 assert.match(await p.locator('#conViewInfo').innerText(),/1 ADITIVO/);assert.match(await p.locator('#conViewMetrics1').innerText(),/PRORROGADO POR ADITIVO/);
 await create('Prorrogação de vigência','Formalizado',{numero_aditivo:'2º Termo',data_aditivo:'2027-12-05',nova_vigencia:'2028-12-11'});await save();await values('2028-12-11',1000);
 const second=rows.find(a=>a.id!==first).id;
 p.once('dialog',d=>d.dismiss());await p.locator('[data-ad-action="delete"][data-id="'+first+'"]').click();assert.equal(rows[0].excluido,false);
 p.once('dialog',d=>d.accept());await p.locator('[data-ad-action="delete"][data-id="'+first+'"]').click();await p.waitForFunction(()=>document.querySelectorAll('#conViewAditivos article').length===1);await values('2028-12-11',1000);
 p.once('dialog',d=>d.accept());await p.locator('[data-ad-action="delete"][data-id="'+second+'"]').click();await values('2026-12-11',1000);
 await create('Acréscimo quantitativo','Formalizado',{data_aditivo:'2026-01-01',valor_acrescimo:200});
 assert.equal(await p.inputValue('#adForm [name="novo_valor"]'),'1200.00');assert.equal(await p.locator('#adForm [name="nova_vigencia"]').isVisible(),false);
 await save();await values('2026-12-11',1200);const addition=rows.find(a=>a.tipo==='Acréscimo quantitativo').id;
 await create('Reajuste','Formalizado',{data_aditivo:'2026-02-01',novo_valor:1320});await save();await values('2026-12-11',1320);
 await create('Supressão quantitativa','Formalizado',{data_aditivo:'2026-03-01',valor_supressao:20});await save();await values('2026-12-11',1300);
 p.once('dialog',d=>d.accept());await p.locator('[data-ad-action="delete"][data-id="'+addition+'"]').click();await values('2026-12-11',1100);
 assert.equal(bases[0].valor_original,1000);assert.equal(bases[0].vencimento_original,'2026-12-11');assert.equal(bases[0].data_original,'2025-12-11');
 await p.locator('#conViewAditivos summary').first().click();await p.locator('[data-ad-action="history"]').click();await p.waitForFunction(()=>document.querySelector('#adHistory .trat-history-entry'));assert.equal(await p.locator('#adHistory .trat-history-entry').count(),hist.length);
 await create('Alteração contratual','Em tratativa');assert.equal(await p.locator('#adForm [name="nova_vigencia"]').isVisible(),true);
 fail=true;await p.locator('#adForm button[type="submit"]').click();await p.waitForFunction(()=>document.querySelector('#adError').textContent.includes('Falha'));fail=false;conflict=true;await p.locator('#adForm button[type="submit"]').click();await p.waitForFunction(()=>document.querySelector('#adError').textContent.includes('alterado'));conflict=false;
 await p.setViewportSize({width:390,height:844});assert(await p.locator('#adEditor').evaluate(e=>e.getBoundingClientRect().width<=390));await p.screenshot({path:path.resolve(root,'mobile.png')});
 await p.locator('#adEditor [data-ad-action="cancel"]').first().click();await p.setViewportSize({width:1366,height:900});await p.screenshot({path:path.resolve(root,'details.png')});
 assert.equal(JSON.stringify(treatments),treatmentBefore);
 assert(!writes.some(w=>w.table!=='contrato_aditivos'),'No writes to commitments, treatments or contracts from module');
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: CRUD, conditional fields, required validation, successive extensions/financial terms, recalculation, history, unchanged treatments/commitments, conflict, failure and mobile.');
})().catch(e=>{console.error(e);process.exit(1);});
