const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const c={id:'contract-test',orgao:'MUNICÍPIO EXEMPLO/UF',empresa:'Empresa Exemplo',contrato:'001/2026',processo:'PREGÃO 001/2026',status:'Vigente',valor:10000,compra:6000,data:'2026-05-04',data_fim:'2027-05-04',itens_lotes:[]};
const e={id:'emp-test',contrato_id:c.id,numero:'OF',orgao:c.orgao,empresa:c.empresa,contrato:c.contrato,status:'Pendente',valor:800,data:'2026-09-01',itens_empenhados:[{qtdEmp:8,vlUnit:100,descricao:'Equipamento',itemId:'item-test'}]};
let rows=[],hist=[],calls=[],failSave=false,conflict=false;
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1366,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**/*',async r=>{
  const u=new URL(r.request().url()),table=u.pathname.split('/').pop(),method=r.request().method();
  if(!u.pathname.includes('/rest/v1/'))return r.abort();
  calls.push({table,method});let data=[];
  if(table==='tratativas_administrativas') {
   if(method==='GET')data=rows;
   else if(failSave)return r.fulfill({status:500,body:'failure'});
   else if(conflict)return r.fulfill({json:[]});
   else {const d=r.request().postDataJSON(),old=rows.find(x=>x.id===(u.searchParams.get('id')||'').slice(3));const saved={...old,...d,id:old?.id||d.id,versao:(old?.versao||0)+1,criado_em:old?.criado_em||new Date().toISOString(),atualizado_em:new Date().toISOString()};rows=rows.filter(x=>x.id!==saved.id).concat(saved);hist.push({id:String(hist.length),tratativa_id:saved.id,data_hora:new Date().toISOString(),descricao:d.nota_atualizacao,status_anterior:old?.situacao,novo_status:saved.situacao,observacao:saved.observacoes,link_documento:saved.link_documento,depois:{...saved},antes:old});data=[saved];}
  }else if(table==='tratativas_historico')data=hist.filter(h=>h.tratativa_id===(u.searchParams.get('tratativa_id')||'').slice(3));
  else if(table==='contratos_ativos')data=[c];else if(table==='empenhos')data=[e];
  return r.fulfill({json:data});
 });
 await p.goto('file:///'+path.resolve(process.env.TRATATIVAS_ROOT || '.', 'index.html').replaceAll('\\','/'));
 await p.waitForFunction(()=>window.KMTratativas && contratosAtivos.length && !document.querySelector('#tratFiltroTipoA')?.disabled);
 await p.evaluate(()=>{document.getElementById('kmCloudLoadingOverlay').remove();document.documentElement.setAttribute('data-mode','light');showSection('contratos-ativos');abrirConView('contract-test','ativo');});
 assert.match(await p.locator('#conViewTratativas').innerText(),/NENHUMA TRATATIVA|Nenhuma tratativa/i);
 await p.locator('[data-trat-action="new"]').click();
 await p.selectOption('[name="situacao"]','AGUARDANDO RESPOSTA');await p.fill('[name="data_ocorrencia"]','2026-09-28');
 await p.selectOption('[name="abrangencia"]','contrato_empenhos');await p.check('[name="empenho_ids"]');
 assert.match(await p.locator('#tratEmpenhos').innerText(),/8 unidades/i);
 await p.fill('[name="descricao"]','Solicitada extinção consensual do contrato e cancelamento do pedido.');
 await p.fill('[name="link_gmail"]','https://mail.google.com/mail/u/0/#inbox/example');await p.fill('[name="link_documento"]','https://drive.google.com/file/d/example/view');
 await p.fill('[name="proxima_acao"]','Cobrar resposta');await p.fill('[name="acompanhar_em"]','2026-09-28');
 await p.locator('#tratForm button[type="submit"]').click();await p.waitForFunction(()=>!document.querySelector('#tratEditor').open);
 assert.equal(rows.length,1);assert.equal(hist.length,1);assert.deepEqual(rows[0].empenho_ids,['emp-test']);
 const state=await p.evaluate(()=>({c:contratosAtivos[0].status,e:empenhos[0].status,v:contratosAtivos[0].valor}));assert.deepEqual(state,{c:'Vigente',e:'Pendente',v:10000});
 assert.match(await p.locator('#conAtivosBody').innerText(),/EXTINÇÃO SOLICITADA/i);assert.match(await p.locator('#empPendTableBody').innerText(),/CANCELAMENTO SOLICITADO/i);
 const links=await p.locator('#conViewTratativas a').evaluateAll(es=>es.map(e=>({target:e.target,rel:e.rel,href:e.href})));assert.equal(links.length,2);assert(links.every(a=>a.target==='_blank'&&a.rel.includes('noopener')));
 await p.locator('[data-trat-action="update"]').click();await p.fill('[name="nota_atualizacao"]','Órgão encaminhou à análise jurídica.');await p.selectOption('[name="situacao"]','EM ANÁLISE PELO ÓRGÃO');await p.locator('#tratForm button[type="submit"]').click();await p.waitForFunction(()=>!document.querySelector('#tratEditor').open);assert.equal(hist.length,2);assert.equal(hist[1].status_anterior,'AGUARDANDO RESPOSTA');
 await p.locator('[data-trat-action="history"]').click();await p.waitForFunction(()=>document.querySelector('.trat-history-entry'));assert.equal(await p.locator('.trat-history-entry').count(),2);
 await p.screenshot({path:'details.png'});
 await p.locator('[data-trat-action="edit"]').click();await p.fill('[name="nota_atualizacao"]','Teste de falha');failSave=true;await p.locator('#tratForm button[type="submit"]').click();await p.waitForFunction(()=>document.querySelector('#tratFormError').textContent);assert.equal(rows[0].versao,2);failSave=false;conflict=true;await p.locator('#tratForm button[type="submit"]').click();await p.waitForFunction(()=>document.querySelector('#tratFormError').textContent.includes('Outra pessoa'));conflict=false;await p.locator('#tratEditor [data-trat-action="cancel"]').first().click();
 await p.locator('[data-trat-action="close"]').click();await p.fill('[name="resultado"]','Decisão formal registrada em teste.');await p.fill('[name="nota_atualizacao"]','Tratativa concluída.');await p.locator('#tratForm button[type="submit"]').click();await p.waitForFunction(()=>!document.querySelector('#tratEditor').open);assert.equal(rows[0].situacao,'CONCLUÍDO');assert.equal(hist.length,3);
 assert.equal(await p.evaluate(()=>KMTratativas.active({situacao:'CONCLUÍDO'})),false);
 assert.equal(await p.evaluate(()=>contratosAtivos[0].status),'Vigente');assert.equal(await p.evaluate(()=>empenhos[0].status),'Pendente');
 await p.evaluate(()=>fecharConView());await p.selectOption('#tratFiltroTipoA','ativa');assert.match(await p.locator('#conAtivosBody').innerText(),/Nenhum contrato/i);await p.selectOption('#tratFiltroTipoA','EXTINÇÃO CONSENSUAL');await p.selectOption('#tratFiltroStatusA','CONCLUÍDO');assert.match(await p.locator('#conAtivosBody').innerText(),/MUNICÍPIO EXEMPLO/);await p.selectOption('#tratFiltroTipoA','sem');assert.match(await p.locator('#conAtivosBody').innerText(),/Nenhum contrato/i);
 await p.evaluate(()=>limparFiltrosConAtivos());assert.equal(await p.inputValue('#tratFiltroTipoA'),'');
 const follow=await p.evaluate(()=>{const now=new Date(),fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return [-1,0,2].map(n=>{const d=new Date(now);d.setDate(d.getDate()+n);return KMTratativas.followup({situacao:'AGUARDANDO RESPOSTA',acompanhar_em:fmt(d)});});});assert.deepEqual(follow.map(x=>x.days),[-1,0,2]);
 await p.evaluate(()=>abrirConView('contract-test','ativo'));await p.locator('[data-trat-action="new"]').click();await p.setViewportSize({width:390,height:844});await p.screenshot({path:'mobile.png'});assert(await p.locator('#tratEditor').evaluate(e=>e.getBoundingClientRect().width<=390));
 assert(!calls.some(c=>c.method!=='GET'&&c.table!=='tratativas_administrativas'),'No writes to contracts, commitments or financial data');assert.deepEqual(errors,[]);
 console.log('PASS: create, edit, history, links, scoped commitments, filter combinations, follow-up boundaries, close, conflict, network failure, mobile, unchanged financial/status data.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});

