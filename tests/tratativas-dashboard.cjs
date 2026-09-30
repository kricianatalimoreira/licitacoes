const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.TRATATIVAS_ROOT||'.';
const contract={id:'dashboard-contract',orgao:'ÓRGÃO DE TESTE',contrato:'123/2026',empresa:'Empresa Teste',status:'Vigente',valor:100,data:'2026-01-01',data_fim:'2027-12-31',itens_lotes:[]};
const empenhos=[1,2].map(n=>({id:'emp-'+n,contrato_id:contract.id,numero:'2026NE00'+n,status:'Pendente',valor:100,itens_empenhados:[]}));
const initial={id:'11111111-1111-4111-8111-111111111111',contrato_id:contract.id,tipo:'SUBSTITUIÇÃO DE PRODUTO',tipo_tratativa:'Substituição de produto',situacao:'AGUARDANDO RESPOSTA',status:'Aguardando órgão',empenho_ids:empenhos.map(e=>e.id),abrangencia:'empenhos',descricao:'Registro de teste',proxima_acao:'Enviar documentação',acompanhar_em:'2026-10-02',criado_em:'2026-09-20T12:00:00Z',atualizado_em:'2026-09-30T10:00:00Z',versao:2};
let rows=[{...initial},{...initial,id:'22222222-2222-4222-8222-222222222222',excluida:true}],history=[{tratativa_id:initial.id,data_hora:initial.criado_em,antes:null,depois:{...initial}},{tratativa_id:initial.id,data_hora:initial.atualizado_em,antes:{...initial},depois:{...initial,link_gmail:'https://mail.google.com/test',versao:3}}];
let failRows=false,failHistory=false,writes=[],contracts=[contract],emps=empenhos;
if(process.env.TRATATIVAS_REAL_PROJECTION){
 const projection=JSON.parse(fs.readFileSync(process.env.TRATATIVAS_REAL_PROJECTION,'utf8'));
 rows=projection.map(t=>({...t,versao:1}));
 contracts=[...new Map(projection.map(t=>[t.contrato_id,{id:t.contrato_id,orgao:t.orgao,contrato:t.contrato,empresa:t.empresa,status:'Vigente',itens_lotes:[]}])).values()];
 emps=[...new Map(projection.flatMap(t=>(t.empenhos_exibidos||[]).map(e=>[e.id,{...e,itens_empenhados:[]}]))).values()];
 history=projection.map(t=>({tratativa_id:t.id,data_hora:t.ultima_relevante||t.criado_em,antes:null,depois:{}}));
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Sao_Paulo'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-09-30T15:00:00Z')});
 await page.route('https://**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop();
  if(!url.pathname.includes('/rest/v1/'))return route.abort();
  let data=[];
  if(req.method()!=='GET'){
   writes.push({table,method:req.method()});assert.equal(table,'tratativas_administrativas');
   const input=req.postDataJSON(),saved={...input,id:input.id,versao:1,criado_em:'2026-09-30T15:00:00Z',atualizado_em:'2026-09-30T15:00:00Z'};
   rows.push(saved);history.push({tratativa_id:saved.id,data_hora:saved.atualizado_em,antes:null,depois:saved});
   return route.fulfill({json:[saved]});
  }
  if(table==='tratativas_administrativas'){if(failRows)return route.fulfill({status:503,body:'Indisponível'});data=rows;}
  if(table==='tratativas_historico'){if(failHistory)return route.fulfill({status:503,body:'Indisponível'});data=history;}
  if(table==='contratos_ativos')data=contracts;
  if(table==='empenhos')data=emps;
  return route.fulfill({json:data});
 });
 await page.goto('file:///'+path.resolve(root,'index.html').replaceAll('\\','/'));
 await page.waitForSelector('#dashTratativasList tbody tr');
 await page.evaluate(()=>document.getElementById('kmCloudLoadingOverlay')?.remove());
 const body=page.locator('#dashTratativasList');
 assert.equal(await body.locator('tbody tr').count(),rows.filter(t=>!t.excluida).length);
 assert.equal(await body.locator('th').count(),8);
 assert.equal(await body.locator('a[href*="gmail"],a[href*="mail.google"]').count(),0);
 assert.equal(await body.locator('.trat-gmail-placeholder:not([disabled])').count(),0);
 assert.equal(await page.locator('#dashBlocoDisputas .dash-kpi-card').count(),4);
 assert.equal(await page.locator('#dashTratativasCard .dash-kpi-card').count(),0);
 for(const width of [1024,390,1440]){
  await page.setViewportSize({width,height:1000});
  const bounds=await page.locator('#dashTratativasCard').boundingBox();
  assert(bounds.x+bounds.width<=width+1,'Card deve permanecer dentro da tela');
  const columns=await body.locator('table').evaluate(table=>[...table.tHead.rows[0].cells].map((cell,i)=>Math.abs(cell.getBoundingClientRect().x-table.tBodies[0].rows[0].cells[i].getBoundingClientRect().x)));
  assert(columns.every(d=>d<1),'Cabeçalhos e células devem permanecer alinhados');
 }
 if(process.env.TRATATIVAS_REAL_PROJECTION){
  for(const mode of ['light','dark']){
   await page.evaluate(mode=>document.documentElement.setAttribute('data-mode',mode),mode);
   await page.screenshot({path:path.join(process.env.TRATATIVAS_SCREENSHOT_DIR||'.','dashboard-tratativas-'+mode+'.png'),fullPage:true});
  }
  assert.equal(writes.length,0);assert.deepEqual(errors,[]);await browser.close();
  console.log('PASS: card renderizado com projeção dos registros reais, sem escritas.');return;
 }
 assert.equal(await body.locator('tbody tr').first().locator('td').nth(6).innerText(),'10');
 assert.match(await body.innerText(),/2026NE001/);assert.match(await body.innerText(),/2026NE002/);
 assert.match(await body.locator('.trat-badge').innerText(),/Aguardando órgão/i);
 await page.locator('#dashTratativasCard [data-trat-action="view-all"]').click();
 assert.equal(await page.locator('#tratativas-todas').isVisible(),true);
 assert.equal(await page.locator('#tratTodasLista tbody tr').count(),1);
 assert.equal(await page.locator('#menuGroupTratativas').evaluate(e=>e.classList.contains('is-open')),true);
 await page.locator('#menuDashboard').click();
 await page.locator('#dashTratativasCard [data-trat-action="new-global"]').click();
 assert.equal(await page.locator('#tratChooseContract').isVisible(),true);
 await page.selectOption('#tratChooseContract select',contract.id);
 await page.locator('#tratChooseContract button[type="submit"]').click();
 await page.locator('#tratForm').waitFor({state:'visible'});
 await page.fill('#tratForm [name="descricao"]','Cadastro iniciado no Dashboard');
 await page.locator('#tratForm button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('tratEditor').open);
 assert.equal(await body.locator('tbody tr').count(),2);
 assert.equal(writes.length,1);
 assert.equal(await body.locator('tbody tr').first().locator('td').nth(6).innerText(),'0');
 // Uma alteração administrativa reinicia a contagem; uma atualização apenas técnica não.
 const changed={...initial,proxima_acao:'Aguardar resposta'};
 history.push({tratativa_id:initial.id,data_hora:'2026-09-29T23:00:00-03:00',antes:{...initial},depois:changed});
 await page.evaluate(()=>KMTratativas.load());
 assert.equal(await body.locator(`[data-tratativa-id="${initial.id}"] td`).nth(6).innerText(),'1');
 await page.clock.setSystemTime(new Date('2026-10-01T03:01:00Z'));
 await page.evaluate(()=>KMTratativas.load());
 assert.equal(await body.locator(`[data-tratativa-id="${initial.id}"] td`).nth(6).innerText(),'2');
 history.push({tratativa_id:initial.id,data_hora:'2026-10-01T00:00:00-03:00',antes:{...changed},depois:{...changed,nota_atualizacao:'Contato telefônico registrado'}});
 await page.evaluate(()=>KMTratativas.load());
 assert.equal(await body.locator(`[data-tratativa-id="${initial.id}"] td`).nth(6).innerText(),'0');
 failHistory=true;await page.evaluate(()=>KMTratativas.load());
 assert.equal(await body.locator('tbody tr').count(),2);
 assert.match(await body.innerText(),/histórico/i);
 assert.equal(await body.locator('tbody tr').first().locator('td').nth(6).innerText(),'—');
 failHistory=false;failRows=true;await page.evaluate(()=>KMTratativas.load());
 assert.match(await body.innerText(),/Não foi possível carregar/i);
 assert.equal(await body.locator('tbody tr').count(),0);
 failRows=false;rows=[];history=[];await page.evaluate(()=>KMTratativas.load());
 assert.match(await body.innerText(),/Nenhuma tratativa cadastrada/i);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: tabela, dados, N:N, badges, DIAS, histórico relevante, virada do dia, cadastro, navegação, estados vazio/erro e ausência de Gmail.');
})().catch(error=>{console.error(error);process.exit(1)});
