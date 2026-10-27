const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const styles=[...fs.readFileSync('index.html','utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 await page.setContent('<html data-mode="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+styles+'</style></head><body><div class="layout"><aside><button data-section-target="contratos-ativos">Contratos</button></aside><main class="content"></main></div></body></html>');
 await page.addStyleTag({path:'work/org-registry.css'});
 await page.evaluate(()=>{
  window.testState={orgs:[],links:[],writes:0,auth:false};window.changeSession=null;
  window.KMEmailSession={has:()=>testState.auth,onChange:fn=>changeSession=fn,signIn:async()=>{testState.auth=true;},api:async(action,company,{data})=>{if(action==='list')return{orgaos:testState.orgs,links:testState.links,companies:['HAMATE','GADITA']};testState.writes++;if(action==='save'){const org={...data,id:'org1',revision:1};testState.orgs=[org];return{orgao:org};}if(action==='bind'){testState.links=[{...data,revision:1}];return{ok:true};}if(action==='unbind'){testState.links=[];return{ok:true};}}};
  window.testContracts=[{id:'c1',orgao:'CIDADE TESTE/MG',empresa:'Gadita',contrato:'01/2026',uf:'MG',valor:1000}];window.testEntries=[{id:'e1',contratoId:'c1',orgao:'CIDADE TESTE/MG',empresa:'Gadita',numero:'1',status:'Paga',valor:100,dataEntrega:'2026-01-01',dataPagamento:'2026-01-11'}];
 });
 await page.addScriptTag({path:'org-registry-model.js'});await page.addScriptTag({path:'org-registry-ui.js'});
 await page.evaluate(()=>{KMOrgaos.mount({contracts:()=>testContracts,entries:()=>testEntries,finance:()=>({vlCompraReal:40,custoReal:10,lucroReal:50,temCompra:true,temValores:true}),open:()=>{},changed:()=>{}});document.querySelector('#org-registry').classList.remove('hidden');});
 assert.ok(await page.locator('#orLogin').isVisible());await page.fill('#orLoginEmail','test@example.com');await page.fill('#orLoginPassword','test-only');await page.locator('#orLogin button').click();await page.locator('#orNew').click();
 await page.fill('#or_nome','Prefeitura Teste');await page.fill('#or_municipio','Cidade Teste');await page.selectOption('#or_uf','MG');await page.selectOption('#or_tipo','Prefeitura');await page.fill('#or_cnpj','00.000.000/0001-90');await page.click('#orSave');assert.equal(await page.evaluate(()=>testState.writes),0);assert.ok((await page.locator('#orEditError').innerText()).includes('CNPJ'));
 await page.fill('#or_cnpj','00.000.000/0001-91');await page.fill('#orContact0nome','Comprador <teste>');await page.click('#orSave');await page.locator('#orEditor').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>testState.writes),1);
 await page.click('[data-or-tab="records"]');await page.locator('[data-bind-kind="contrato"]').click();await page.selectOption('#orBindSelect','org1');await page.click('#orConfirmBind');assert.equal(await page.evaluate(()=>testState.writes),1);await page.check('#orBindConfirm');await page.click('#orConfirmBind');await page.locator('#orBind').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>testState.writes),2);assert.ok((await page.locator('#orBody').innerText()).toUpperCase().includes('NENHUM REGISTRO'));
 await page.uncheck('#orPending');assert.ok((await page.locator('#orBody').innerText()).toUpperCase().includes('HERDADO'));assert.equal(await page.evaluate(()=>KMOrgaos.identity(testEntries[0])),JSON.stringify(['GADITA','registry','org1']));
 await page.click('[data-or-tab="entities"]');await page.click('[data-open="org1"]');await page.selectOption('#orCompany','GADITA');assert.ok((await page.locator('#orDetail').innerText()).toUpperCase().includes('SEM HISTÓRICO SUFICIENTE'));assert.equal(await page.locator('#orDetail teste').count(),0);
 await page.evaluate(()=>document.querySelector('#org-registry').scrollTop=0);await page.screenshot({path:'org-registry-desktop.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:768,height:900});await page.screenshot({path:'org-registry-tablet.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.evaluate(()=>{testState.auth=false;changeSession(false);});assert.ok(await page.locator('#orLogin').isVisible());assert.equal(await page.locator('#orDetail').innerHTML(),'');assert.equal(await page.evaluate(()=>KMOrgaos.identity(testEntries[0])),null);
 assert.deepEqual(errors,[]);await browser.close();console.log('UI: login, cadastro, validação de CNPJ, confirmação, herança, detalhe, escape HTML, logout e layout aprovados.');
})().catch(e=>{console.error(e);process.exit(1);});

