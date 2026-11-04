(function(){
 'use strict';
 const M=window.KMOrgRegistryModel,S=window.KMEmailSession,$=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),days=v=>v===null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias';
 let adapter,orgs=[],links=[],companies=[],ready=false,loading=false,epoch=0,tab='entities',selected=null,editing=null,binding=null;
 const checked=new Set();let visibleIds=[],columnFilter={name:'',city:''},sortKey='',sortDirection=1;
 const filterButton=(label,key)=>label+' <button class="or-head-button" data-filter="'+key+'" aria-label="Filtrar '+label+'" title="Filtrar '+label+'"'+(columnFilter[key]?' data-active="true"':'')+'><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M2 3h12L9 9v4H7V9z" fill="currentColor"/></svg></button>';
 const sortButton=(label,key)=>label+' <button class="or-head-button" data-sort="'+key+'" aria-label="Ordenar '+label+'" title="Ordenar '+label+'">'+(sortKey===key?(sortDirection===1?'↑':'↓'):'↕')+'</button>';
 const messages={login_required:'Entre com seu acesso do sistema.',login_failed:'Não foi possível entrar. Confira e-mail e senha.',forbidden:'Seu usuário não tem permissão para esta ação.',duplicate_cnpj:'Este CNPJ já está cadastrado. Use o cadastro existente.',conflict:'Este registro mudou em outra sessão. Atualize e confira novamente.',source_changed:'O registro original mudou ou ainda não foi salvo na nuvem. Atualize e confira antes de vincular.',network_error:'Não foi possível conectar. Tente novamente.',storage_error:'Não foi possível salvar no servidor. Tente novamente.'};
 const error=e=>messages[e.message]||'Não foi possível concluir. Confira os dados e tente novamente.';
 const data=()=>({contracts:adapter.contracts(),entries:adapter.entries()});
 function resolved(row,kind){return ready?M.resolve(row,kind,links,adapter.contracts()):null;}
 function identity(row){const r=resolved(row,'empenho');return r?JSON.stringify([M.norm(row.empresa),'registry',r.id]):null;}
 async function request(action,body={}){return S.api(action,null,{data:body},'org-registry');}
 async function refresh(){
  if(loading)return;loading=true;const version=epoch;$('orMessage').textContent='Carregando cadastro…';
  try{if(!S.has())throw Error('login_required');const result=await request('list');if(version!==epoch)return;orgs=result.orgaos;links=result.links;companies=result.companies;ready=true;$('orMessage').textContent='';adapter.changed();}
  catch(e){if(version===epoch){ready=false;orgs=[];links=[];$('orMessage').textContent=error(e);}}
  finally{loading=false;render();document.dispatchEvent(new Event('km-org-registry-change'));}
 }
 function clear(){checked.clear();columnFilter={name:'',city:''};sortKey='';if($('orFilter')?.open)$('orFilter').close();epoch++;ready=false;orgs=[];links=[];companies=[];selected=null;editing=null;binding=null;for(const id of ['orEditor','orBind']){const el=$(id);if(el?.open)el.close();}if($('orEditForm'))$('orEditForm').reset();render();adapter.changed();document.dispatchEvent(new Event('km-org-registry-change'));}
 const activeCompany=()=>$('orCompany').value;
 const sources=()=>M.sources(adapter.contracts(),adapter.entries());
 let capagImport;
 function loadCapag(){
  if(!capagImport)capagImport=(async()=>{
   const response=await fetch('/api/org-capag');
   if(!response.ok)throw new Error('CAPAG indisponível');
   const reference=response.headers.get('X-Capag-Reference');
   const workbook=XLSX.read(await response.arrayBuffer(),{type:'array'});
   const municipalities=new Map();
   for(const sheet of workbook.SheetNames){
    for(const [code,city,uf,grade] of XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,raw:false,blankrows:false})){
     const rating=String(grade||'').trim().toUpperCase();
     if(!/^\d{7}$/.test(String(code||'').trim())||!city||!M.states.includes(uf)||!['A+','A','B+','B','C','D'].includes(rating))continue;
     const key=M.norm(city)+'|'+uf;
     if(municipalities.has(key)&&municipalities.get(key)!==rating)municipalities.set(key,null);
     else municipalities.set(key,rating);
    }
   }
   if(!municipalities.size)throw new Error('Formato da CAPAG não reconhecido');
   return {municipalities,reference};
  })().catch(error=>{capagImport=null;throw error;});
  return capagImport;
 }
 function updateScoreReport(report){
  const parts=['internal','capag','pncp'].map(key=>report.dataset[key]);
  const available=parts.filter(value=>value!==undefined&&value!=='').length;
  const consolidated=available===3;
  const score=consolidated?Math.round(parts[0]*0.60+parts[1]*0.25+parts[2]*0.15):parts[0]===''?null:Number(parts[0]);
  const label=score===null?'Pouco histórico':score>=85?'Muito bom':score>=70?'Bom':score>=50?'Atenção':'Risco elevado';
  const color=score===null?'var(--muted)':score>=70?'#258258':score>=50?'#b47614':'#b42318';
  const ring=report.querySelector('[data-score-ring]');
  ring.style.background='conic-gradient('+color+' '+(score??0)+'%, var(--line) 0)';
  ring.firstElementChild.textContent=score===null?'—':score+'/100';
  report.querySelector('[data-score-label]').textContent=(consolidated?'Score consolidado':'Score interno')+' · '+label;
  report.querySelector('[data-score-coverage]').textContent=available+'/3 componentes disponíveis · Histórico '+(parts[0]||'—')+' · Tesouro '+(parts[1]||'—')+' · PNCP '+(parts[2]===undefined?'—':Math.round(parts[2]));
 }
 async function queryPncp(button){
   if(!button||button.disabled)return;
   const result=button.parentElement.querySelector('[data-org-pncp-result]');
   button.disabled=true;
   result.textContent='Consultando contratações publicadas no PNCP…';
   try{
    const response=await fetch('/api/org-pncp?cnpj='+encodeURIComponent(button.dataset.orgPncp));
    if(!response.ok)throw new Error('PNCP indisponível');
    const data=await response.json();
    const report=result.closest('[data-score-report]');
    if(Number.isFinite(data.score)&&data.score>=0&&data.score<=100)report.dataset.pncp=data.score;
    else delete report.dataset.pncp;
    updateScoreReport(report);
    result.textContent='PNCP · '+data.start+' a '+data.end+' · '+data.cancelled+' anuladas ou revogadas de '+data.total+' contratações · '+(data.score===null?'Amostra insuficiente (mínimo de 20).':'Nota de compras: '+Math.round(data.score)+'/100.');
   }catch{
    delete result.closest('[data-score-report]').dataset.pncp;
    updateScoreReport(result.closest('[data-score-report]'));
    result.textContent='Consulta ao PNCP indisponível. Tente novamente.';
   }finally{
    button.disabled=false;
   }
 }
 async function showCapag(org,target){
  try{
   const {municipalities,reference}=await loadCapag();
   const grade=municipalities.get(M.norm(org.municipio)+'|'+org.uf);
   const date=/^\d{8}$/.test(reference||'')?reference.slice(6)+'/'+reference.slice(4,6)+'/'+reference.slice(0,4):'';
   const report=target.closest('[data-score-report]');
   if(grade)report.dataset.capag={ 'A+':100,A:100,'B+':75,B:75,C:40,D:10 }[grade];
   updateScoreReport(report);
   target.textContent=grade?'CAPAG do município: '+grade+(date?' · base de '+date:''):'CAPAG municipal sem nota identificada nesta base.';
  }catch{
   target.textContent='Base municipal da CAPAG indisponível. Reabra os detalhes para tentar novamente.';
  }
 }
 function paymentScore(rows){
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  function day(value){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
   const date=new Date(value+'T00:00:00Z');
   return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?+date/86400000:null;
  }
  const now=day(today),paid=[],pending=[];
  let mature=0,slow=0;
  for(const row of rows){
   const status=M.norm(row.status),delivery=day(row.dataEntrega),payment=day(row.dataPagamento);
   if(row.kind!=='empenho'||['CANCELADO','CANCELADA'].includes(status)||delivery===null||delivery>now)continue;
   const settled=status==='PAGA';
   if(settled&&(payment===null||payment<delivery||payment>now))continue;
   if(!settled&&row.dataPagamento)continue;
   const days=(settled?payment:now)-delivery;
   (settled?paid:pending).push({row,days});
   if(now-delivery>=60){mature++;if(days>60)slow++;}
  }
  paid.sort((a,b)=>a.days-b.days);
  const n=paid.length;
  if(n<3)return {score:null,n,paid,pending};
  const median=(paid[Math.floor((n-1)/2)].days+paid[Math.floor(n/2)].days)/2;
  const marks=[[15,100],[30,85],[60,55],[90,25],[120,0]];
  let speed=median<=15?100:0;
  for(let i=1;i<marks.length;i++){
   const [end,low]=marks[i], [start,high]=marks[i-1];
   if(median>start&&median<=end)speed=high+(low-high)*(median-start)/(end-start);
  }
  const score=Math.round(mature?0.7*speed+30*(1-slow/mature):speed);
  return {score,n,median,paid,pending,mature,slow,label:score>=85?'Muito bom':score>=70?'Bom':score>=50?'Atenção':'Risco elevado'};
 }
 function stats(id){const summary=M.summary(id,links,adapter.contracts(),adapter.entries(),adapter.finance,activeCompany());return {...summary,paymentScore:paymentScore(summary.rows)};}
 function table(headers,body){return '<div class="or-table-wrap"><table class="or-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';}
 function render(){
  if(!$('org-registry'))return;
  $('orLogin').hidden=S.has();$('orControls').hidden=!ready;$('orNew').disabled=!ready;$('orSummary').hidden=!ready||tab==='records';$('orFooter').hidden=!ready;
  if(!ready){$('orDetail').close();$('orDetail').replaceChildren();$('orBody').innerHTML='<div class="or-empty">'+(S.has()?'Atualize para carregar o cadastro protegido.':'Entre para consultar órgãos, contatos e vínculos. Use o acesso do sistema; não é a senha do Gmail.')+'</div>';return;}
  const q=M.norm($('orSearch').value),match=o=>!q||M.norm([o.nome,o.cnpj,o.municipio,o.uf].join(' ')).includes(q);
  document.querySelectorAll('[data-or-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.orTab===tab)));
  const summaries=new Map(orgs.map(o=>[o.id,stats(o.id)]));
  const list=orgs.filter(o=>match(o)&&(!columnFilter.name||M.norm([o.nome,o.cnpj].join(' ')).includes(M.norm(columnFilter.name)))&&(!columnFilter.city||M.norm([o.municipio,o.uf,o.tipo].join(' ')).includes(M.norm(columnFilter.city)))&&(!$('orState').value||o.uf===$('orState').value)&&(!$('orType').value||o.tipo===$('orType').value)&&(!activeCompany()||summaries.get(o.id).rows.length)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')*($('orSort').value==='desc'?-1:1));
  if(tab==='entities'&&sortKey)list.sort((a,b)=>{const x=summaries.get(a.id),y=summaries.get(b.id),needsCoverage=['compra','custo','lucro'].includes(sortKey);if(sortKey==='score'){const aScore=x.paymentScore.score,bScore=y.paymentScore.score;if(aScore===null||bScore===null)return Number(aScore===null)-Number(bScore===null)||a.nome.localeCompare(b.nome,'pt-BR');return (aScore-bScore)*sortDirection||a.nome.localeCompare(b.nome,'pt-BR');}if(needsCoverage&&Boolean(x.covered)!==Boolean(y.covered))return x.covered?-1:1;return (x[sortKey]-y[sortKey])*sortDirection||a.nome.localeCompare(b.nome,'pt-BR');});
  visibleIds=list.map(o=>o.id);for(const id of checked)if(!visibleIds.includes(id))checked.delete(id);
  $('orStateLabel').hidden=$('orTypeLabel').hidden=tab==='records';$('orPending').parentElement.hidden=tab!=='records';
  const totals={contracts:0,contractValue:0,paid:0,paidValue:0,compra:0,custo:0,lucro:0,covered:0,estimated:0};
  for(const o of list){const v=summaries.get(o.id);for(const k of Object.keys(totals))totals[k]+=v[k];}
  const cards=[['Órgãos',list.length,'Na seleção'],['Contratos vinculados',totals.contracts,'Ativos e encerrados'],['Valor dos contratos',money(totals.contractValue),'Contratos vinculados'],['Empenhos pagos',money(totals.paidValue),totals.paid+' pagamentos'],['Compra dos pagos',totals.covered?money(totals.compra):'—','Valores disponíveis'],['Custo dos pagos',totals.covered?money(totals.custo):'—','Imposto + royalties'],['Lucro dos pagos',totals.covered?money(totals.lucro):'—',totals.estimated+' com valores previstos']];
  $('orSummary').innerHTML=cards.map(([label,value,note],i)=>'<div><span>'+label+'</span><strong class="'+(i===6?(totals.lucro<0?'or-negative':totals.lucro>0?'or-positive':''):'')+'">'+value+'</strong><small>'+note+'</small></div>').join('');
  $('orFooterTotals').textContent=list.length+' ÓRGÃOS · '+totals.contracts+' CONTRATOS: '+money(totals.contractValue)+' · LUCRO DOS PAGOS: '+(totals.covered?money(totals.lucro):'—')+' · '+totals.covered+'/'+totals.paid+' COM VALORES';
  if(tab==='entities'&&checked.size){const sum={contracts:0,contractValue:0,paid:0,covered:0,lucro:0};for(const id of checked){const v=summaries.get(id);for(const k of Object.keys(sum))sum[k]+=v[k];}$('orFooterTotals').textContent='SELECIONADO: '+checked.size+' ÓRGÃOS · '+sum.contracts+' CONTRATOS: '+money(sum.contractValue)+' · LUCRO DOS PAGOS: '+(sum.covered?money(sum.lucro):'—')+' · '+sum.covered+'/'+sum.paid+' COM VALORES';}else if(tab==='entities')$('orFooterTotals').textContent='FILTRADO: '+$('orFooterTotals').textContent;
  $('orBody').dataset.tab=tab;
  if(tab==='entities'){
   $('orBody').innerHTML=table(['<input type="checkbox" id="orSelectAll" aria-label="Selecionar todos os órgãos filtrados">',filterButton('Órgão / CNPJ','name'),sortButton('Contratos','contractValue'),sortButton('Empenhos pagos','paidValue'),sortButton('Compra dos pagos','compra'),sortButton('Custo dos pagos','custo'),sortButton('Lucro dos pagos','lucro'),sortButton('Score interno','score'),'Ações'],list.map(o=>{const v=summaries.get(o.id);return `<tr class="${checked.has(o.id)?'or-selected':''}"><td><input type="checkbox" data-select-org="${o.id}" aria-label="Selecionar ${esc(o.nome)}" ${checked.has(o.id)?'checked':''}></td><td><button class="or-link" data-open="${o.id}">${esc(o.nome)}</button><small>${esc(o.cnpj||'CNPJ não informado')}</small></td><td class="or-number">${money(v.contractValue)}<small>${v.contracts} contratos</small></td><td class="or-number">${money(v.paidValue)}<small>${v.paid} pagos</small></td><td class="or-number">${v.covered?money(v.compra):'—'}</td><td class="or-number">${v.covered?money(v.custo):'—'}</td><td class="or-number ${v.lucro<0?'or-negative':v.lucro>0?'or-positive':''}">${v.covered?money(v.lucro):'—'}<small>${v.covered}/${v.paid} com valores · ${v.estimated} previstos</small></td><td><button class="or-link" data-open="${o.id}">${v.paymentScore.score===null?'Pouco histórico':v.paymentScore.score+'/100 · '+v.paymentScore.label}</button><small>${v.paymentScore.n} pagamentos válidos</small></td><td style="white-space:nowrap!important"><button type="button" class="btn btn-light btn-sm" data-open="${o.id}" title="Ver detalhes e pagamentos" aria-label="Ver detalhes e pagamentos de ${esc(o.nome)}">👁</button> <button class="btn btn-light btn-sm" data-edit-org="${o.id}">Editar</button></td></tr>`;}).join('')||'<tr><td colspan="9">Nenhum órgão nesta seleção. Use Novo órgão ou Registros para vincular.</td></tr>');
  }else if(tab==='municipalities'){
   const groups=new Map();for(const o of list){const k=JSON.stringify([M.norm(o.municipio),o.uf]);if(!groups.has(k))groups.set(k,{name:o.municipio,uf:o.uf,orgs:[],contracts:0,paid:0,compra:0,custo:0,lucro:0,covered:0,estimated:0});const g=groups.get(k),s=stats(o.id);g.orgs.push(o);for(const field of ['contracts','paid','compra','custo','lucro','covered','estimated'])g[field]+=s[field];}
   $('orBody').innerHTML='<p class="or-note">Consolidação por município. Prefeitura, Câmara e fundos mantêm cadastros e classificações separados. Valores de compra, custo e lucro abaixo são dos empenhos pagos vinculados.</p>'+table(['Município / UF','Entidades','Contratos / pagos','Compras','Custo','Lucro / cobertura'],[...groups.values()].map(g=>`<tr><td>${esc(g.name)} / ${g.uf}</td><td>${g.orgs.map(o=>`<button class="or-link" data-open="${o.id}">${esc(o.nome)}</button>`).join('<br>')}</td><td>${g.contracts} contratos · ${g.paid} pagos</td><td>${money(g.compra)}</td><td>${money(g.custo)}</td><td class="${g.lucro<0?'or-negative':g.lucro>0?'or-positive':''}">${money(g.lucro)}<small>${g.covered}/${g.paid} com valores · ${g.estimated} previstos</small></td></tr>`).join('')||'<tr><td colspan="6">Nenhuma entidade nesta seleção.</td></tr>');
  }else if(tab==='records'){
   const rows=sources().filter(r=>(!activeCompany()||M.norm(r.empresa)===activeCompany())&&(!q||M.norm([r.orgao,r.numero,r.contrato,r.empresa].join(' ')).includes(q))&&(!$('orPending').checked||!resolved(r,r.kind))).sort((a,b)=>String(a.orgao).localeCompare(String(b.orgao),'pt-BR')*($('orSort').value==='desc'?-1:1));
   $('orFooterTotals').textContent=rows.length+' REGISTROS NA SELEÇÃO';
   $('orBody').innerHTML='<p class="or-note">Confira a entidade antes de confirmar. Contratos vinculados transmitem a identificação aos empenhos compatíveis da mesma empresa. Os nomes originais são preservados.</p>'+table(['Registro / empresa','Nome original','Órgão vinculado','Ação'],rows.map((r)=>{const ref=resolved(r,r.kind),o=orgs.find(o=>o.id===ref?.id);return `<tr><td>${r.kind==='contrato'?'Contrato':'Empenho'} ${esc(r.kind==='contrato'?r.contrato:r.numero)}<small>${esc(r.empresa)} · ${esc(r.processo||r.contrato||'')}</small></td><td>${esc(r.orgao)}</td><td>${o?esc(o.nome)+'<small>'+esc(o.cnpj||'Sem CNPJ')+(ref.inherited?' · herdado do contrato':' · confirmado')+'</small>':'Não vinculado'}</td><td><button class="btn btn-light" data-bind-kind="${r.kind}" data-bind-id="${esc(r.id)}" data-bind-company="${esc(M.norm(r.empresa))}">${ref?'Conferir vínculo':'Vincular'}</button></td></tr>`;}).join('')||'<tr><td colspan="4">Nenhum registro nesta seleção.</td></tr>');
  }
  if(tab==='entities'){const all=$('orSelectAll');all.disabled=!visibleIds.length;all.checked=!!visibleIds.length&&checked.size===visibleIds.length;all.indeterminate=checked.size>0&&checked.size<visibleIds.length;document.querySelectorAll('#orBody [data-sort]').forEach(b=>b.closest('th').setAttribute('aria-sort',b.dataset.sort===sortKey?(sortDirection===1?'ascending':'descending'):'none'));}
  if(selected)detail(selected);
 }
 function detail(id){
  const o=orgs.find(o=>o.id===id);if(!o){selected=null;$('orDetail').close();return;}selected=id;const s=stats(id);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  let totalDays=0, paymentCount=0, purchaseFallbacks=0, coveredRevenue=0;
  for(const row of s.rows){
   if(row.kind!=='empenho'||M.norm(row.status)!=='PAGA')continue;
   const finance=adapter.finance(row);
   if(finance.temValores!==false&&[finance.vlCompraReal,finance.custoReal,finance.lucroReal].every(value=>value!=null&&Number.isFinite(Number(value))))coveredRevenue+=Number(row.valor)||0;
   const start=row.dataEntrega||row.dataCompra, end=row.dataPagamento;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||end>today||end<start)continue;
   const from=new Date(start+'T00:00:00Z'), to=new Date(end+'T00:00:00Z');
   if(!Number.isFinite(+from)||!Number.isFinite(+to)||from.toISOString().slice(0,10)!==start||to.toISOString().slice(0,10)!==end)continue;
   totalDays+=(to-from)/86400000;
   paymentCount++;
   if(!row.dataEntrega)purchaseFallbacks++;
  }
  const paymentAverage=paymentCount?totalDays/paymentCount:null;
  const profitMargin=coveredRevenue>0?(s.lucro/coveredRevenue).toLocaleString('pt-BR',{style:'percent',maximumFractionDigits:2})+' de margem':'Margem indisponível';
  const classification=s.n<3?'Sem histórico suficiente':s.mean<=15?'Pagador rápido':s.mean<=30?'Pagador regular':s.mean<=60?'Pagador lento':'Pagador crítico';
  // Do not assign a cross-company payer classification in the combined financial view.
  const payment=s.n ? `${classification} · média ${days(s.mean)} · ${s.n} pagamentos válidos · menor ${days(s.min)} / maior ${days(s.max)}` : 'Nenhum pagamento com datas válidas.';
  $('orDetail').innerHTML=`<div class="or-toolbar"><h3 id="orDetailTitle">${esc(o.nome)}</h3><button class="btn btn-light" data-close-detail>Fechar detalhes</button><button class="btn btn-light" data-edit-org="${o.id}">Editar cadastro</button></div><p>${esc(o.cnpj||'CNPJ não informado')} · ${esc(o.municipio)} / ${o.uf} · ${esc(o.tipo)}</p><div class="or-kpis" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr))"><div>Contratos<strong>${s.contracts}</strong><small>${money(s.contractValue)}</small></div><div>Empenhos pagos<strong>${money(s.paidValue)}</strong><small>${s.paid} pagamentos</small></div><div>Lucro dos pagos<strong class="${s.lucro<0?'or-negative':s.lucro>0?'or-positive':''}">${s.covered?money(s.lucro):'—'}</strong><small>${profitMargin}</small></div><div>Média de pagamento<strong>${days(paymentAverage)}</strong><small>${paymentCount?paymentCount+' pagamentos · '+purchaseFallbacks+' desde a compra':'Sem datas válidas'}</small></div></div><p class="or-note">${s.covered} de ${s.paid} pagos com valores disponíveis · ${s.estimated} previstos. Fórmulas existentes preservadas. Totais de contratos não são somados aos empenhos.</p><section data-score-report data-internal="${s.paymentScore.score??''}" aria-label="Relatório de score">
  <div style="display:flex;align-items:center;gap:16px;margin:16px 0">
   <div data-score-ring style="display:grid;place-items:center;width:84px;height:84px;flex:none;border-radius:50%"><strong style="display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:var(--card);font-size:17px">—</strong></div>
   <div><h3 data-score-label></h3><p data-score-coverage role="status"></p></div>
  </div>
  <div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--primary-th1)">
   <strong>Resumo da nota</strong><p>${s.paymentScore.n} pagamentos válidos${s.paymentScore.median==null?'':' · mediana de '+s.paymentScore.median+' dias entre entrega e pagamento'}.</p>
   <strong>Pontos de atenção</strong><p>${s.paymentScore.pending.length} entregas aguardando pagamento · ${s.paymentScore.pending.filter(p=>p.days>60).length} há mais de 60 dias.</p>
  </div>
  <h4>Histórico de pagamentos · 60%</h4><p>${esc(payment)}</p>
  <h4>Saúde financeira do município · 25%</h4>
  <p><span data-org-capag role="status">Consultando base municipal…</span> · <a href="https://www.tesourotransparente.gov.br/ckan/dataset/capag-municipios" target="_blank" rel="noopener noreferrer">Fonte: Tesouro</a></p>
  <h4>Conduta em compras públicas · 15%</h4>
  <button type="button" class="btn btn-light" data-org-pncp="${M.cnpj(o.cnpj)}" ${M.validCnpj(o.cnpj)?'':'disabled'}>Atualizar consulta ao PNCP</button>
  <p data-org-pncp-result role="status">${M.validCnpj(o.cnpj)?'Consulte para incluir a nota de compras.':'Cadastre um CNPJ válido para consultar o PNCP.'}</p>
 </section><div class="or-contacts">${o.contatos.map(c=>`<div><b>${esc(c.setor)}</b><br>${esc(c.nome)}<br>${esc(c.email)}<br>${esc(c.telefone)}</div>`).join('')||'Nenhum contato cadastrado.'}</div><p>${['site','portal'].filter(k=>o[k]).map(k=>`<a href="${esc(o[k])}" target="_blank" rel="noopener noreferrer">${k==='site'?'Site oficial':'Portal de transparência'}</a>`).join(' · ')}</p>`+table(['Registro','Nome original','Empresa','Valor'],s.rows.map(r=>`<tr><td>${r.kind==='contrato'?'Contrato':'Empenho'} ${esc(r.kind==='contrato'?r.contrato:r.numero)}</td><td>${esc(r.orgao)}</td><td>${esc(r.empresa)}</td><td>${money(r.valor||0)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum registro vinculado nesta seleção.</td></tr>');
  const dialog=$('orDetail');
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  updateScoreReport(dialog.querySelector('[data-score-report]'));
  showCapag(o,dialog.querySelector('[data-org-capag]'));
  queryPncp(dialog.querySelector('[data-org-pncp]'));
 }
 function edit(id=null,prefill={}){
  editing=orgs.find(o=>o.id===id)||null;const o=editing||prefill;
  $('orEditForm').reset();for(const k of ['nome','cnpj','municipio','uf','tipo','site','portal'])$('or_'+k).value=o[k]||'';
  ['Compras','Financeiro','Recebimento'].forEach((setor,i)=>{const c=(o.contatos||[]).find(c=>c.setor===setor)||{};for(const k of ['nome','email','telefone'])$('orContact'+i+k).value=c[k]||'';});
  $('orEditTitle').textContent=editing?'Editar órgão':'Novo órgão';$('orEditError').textContent='';$('orEditor').showModal();
 }
 async function save(ev){ev.preventDefault();const b=$('orSave');b.disabled=true;
  try{const v=Object.fromEntries(['nome','cnpj','municipio','uf','tipo','site','portal'].map(k=>[k,$('or_'+k).value]));v.contatos=['Compras','Financeiro','Recebimento'].map((setor,i)=>({setor,...Object.fromEntries(['nome','email','telefone'].map(k=>[k,$('orContact'+i+k).value]))}));let clean;try{clean=M.validate(v);}catch(e){$('orEditError').textContent=e.message;return;}
   const result=await request('save',{...clean,id:editing?.id,revision:editing?.revision});$('orEditor').close();selected=result.orgao.id;await refresh();
  }catch(e){$('orEditError').textContent=error(e);}finally{b.disabled=false;}
 }
 function bind(kind,id,company){
  const row=sources().find(r=>r.kind===kind&&String(r.id)===id&&M.norm(r.empresa)===company);if(!row)return;binding=row;const ref=resolved(row,kind),direct=links.find(l=>l.kind===kind&&l.record_id===id&&l.company===company);
  $('orBindTitle').textContent=`${kind==='contrato'?'Contrato':'Empenho'} ${kind==='contrato'?row.contrato:row.numero} · ${company}`;
  $('orBindSource').textContent='Nome original: '+row.orgao;
  $('orBindSelect').innerHTML='<option value="">Selecione a entidade correta</option>'+orgs.map(o=>`<option value="${o.id}">${esc(o.nome)} · ${esc(o.cnpj||'sem CNPJ')} · ${esc(o.municipio)}/${o.uf}</option>`).join('');$('orBindSelect').value=ref?.id||'';
  $('orBindConfirm').checked=false;$('orBindError').textContent='';$('orUnbind').hidden=!direct;
  $('orBindNote').textContent=ref?.inherited?'Este vínculo vem do contrato. Para mudar todos os empenhos compatíveis, altere o vínculo do contrato. Aqui você cria uma exceção para este empenho.':'Ao vincular um contrato, seus empenhos compatíveis da mesma empresa também serão identificados. Confira o CNPJ e a unidade: Prefeitura, Câmara e fundos podem ser entidades distintas.';
  $('orBind').showModal();
 }
 async function confirmBind(action){
  if(!$('orBindConfirm').checked){$('orBindError').textContent='Confirme que conferiu a entidade e o registro.';return;}
  const row=binding;if(!row)return;const direct=links.find(l=>l.kind===row.kind&&l.record_id===String(row.id)&&l.company===M.norm(row.empresa));
  const buttons=$('orBind').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try{await request(action,{kind:row.kind,record_id:String(row.id),company:M.norm(row.empresa),source_name:row.orgao,orgao_id:$('orBindSelect').value,revision:direct?.revision||0,confirmed:true});$('orBind').close();await refresh();}
  catch(e){$('orBindError').textContent=error(e);}finally{buttons.forEach(b=>b.disabled=false);}
 }
 function mount(a){
  adapter=a;const section=document.createElement('section');section.id='org-registry';section.className='page-section hidden';
  section.innerHTML=`<div class="topbar"><h2>Órgãos públicos</h2><div><button class="btn btn-light" id="orRefresh">Atualizar</button> <button class="btn" id="orNew" disabled>Novo órgão</button></div></div><p id="orMessage" role="status"></p><form id="orLogin" class="or-login"><p>Acesso protegido aos cadastros e contatos</p><label>E-mail do sistema<input type="email" id="orLoginEmail" autocomplete="username" required></label><label>Senha do sistema<input type="password" id="orLoginPassword" autocomplete="current-password" required></label><button class="btn" type="submit">Entrar</button></form><div id="orSummary" class="or-summary" hidden></div><div id="orControls" hidden><div class="or-toolbar"><label>Empresa<select id="orCompany"><option value="">Todas</option><option>HAMATE</option><option>GADITA</option></select></label><label id="orStateLabel">UF<select id="orState"><option value="">Todas</option>${M.states.map(s=>'<option>'+s+'</option>').join('')}</select></label><label id="orTypeLabel">Tipo<select id="orType"><option value="">Todos</option>${M.types.map(s=>'<option>'+s+'</option>').join('')}</select></label><label class="or-search">Pesquisar<input type="search" id="orSearch" placeholder="Órgão, CNPJ, município ou registro"></label><button class="btn btn-light" data-or-tab="entities">Órgãos</button><button class="btn btn-light" data-or-tab="municipalities">Por município</button><button class="btn btn-light" data-or-tab="records">Registros para vincular</button><label><input type="checkbox" id="orPending" checked> Somente não vinculados</label></div></div><dialog id="orDetail" class="or-dialog" aria-labelledby="orDetailTitle" style="margin:auto;max-height:85dvh"></dialog><div id="orPanel"><div id="orBody"></div><div id="orFooter" hidden><button class="btn btn-light btn-sm" id="orClear">Limpar filtros</button><label>Ordenar <select id="orSort"><option value="asc">Órgão A → Z</option><option value="desc">Órgão Z → A</option></select></label><span id="orFooterTotals"></span></div></div>`;
  document.querySelector('main.content').append(section);
  const menu=document.createElement('button');menu.className='menu-child';menu.dataset.sectionTarget='org-registry';menu.innerHTML='<span class="menu-child-dot"></span><span class="menu-label">Órgãos públicos</span>';menu.addEventListener('click',()=>a.open(menu));document.querySelector('[data-section-target="contratos-ativos"]').insertAdjacentElement('beforebegin',menu);
  const dialog=document.createElement('dialog');dialog.id='orEditor';dialog.className='or-dialog';dialog.innerHTML=`<form id="orEditForm"><h3 id="orEditTitle"></h3><p>Cadastre a entidade, mantendo Prefeitura, Câmara e fundos separados. CNPJ pode ficar em branco quando não conhecido.</p><div class="or-form-grid"><label>Nome oficial<input id="or_nome" maxlength="250" required></label><label>CNPJ<input id="or_cnpj" maxlength="18" placeholder="Opcional"></label><label>Município<input id="or_municipio" maxlength="120" required></label><label>UF<select id="or_uf" required><option value="">Selecione</option>${M.states.map(s=>'<option>'+s+'</option>').join('')}</select></label><label>Tipo<select id="or_tipo" required><option value="">Selecione</option>${M.types.map(s=>'<option>'+s+'</option>').join('')}</select></label><label>Site oficial<input id="or_site" type="url" maxlength="1000" placeholder="https://"></label><label>Portal de transparência<input id="or_portal" type="url" maxlength="1000" placeholder="https://"></label></div>${['Compras','Financeiro','Recebimento'].map((s,i)=>`<fieldset><legend>${s}</legend><div class="or-form-grid"><label>Contato<input id="orContact${i}nome" maxlength="120"></label><label>E-mail<input id="orContact${i}email" type="email" maxlength="254"></label><label>Telefone<input id="orContact${i}telefone" maxlength="60"></label></div></fieldset>`).join('')}<p id="orEditError" role="alert"></p><div class="or-actions"><button class="btn btn-light" type="button" data-close="orEditor">Cancelar</button><button class="btn" id="orSave" type="submit">Salvar cadastro</button></div></form>`;document.body.append(dialog);
  const bd=document.createElement('dialog');bd.id='orBind';bd.className='or-dialog';bd.innerHTML=`<h3 id="orBindTitle"></h3><p id="orBindSource"></p><p class="or-note" id="orBindNote"></p><label>Órgão do cadastro<select id="orBindSelect"></select></label><button class="btn btn-light" id="orCreateFromSource">Cadastrar este órgão</button><p><label><input type="checkbox" id="orBindConfirm"> Conferi a entidade e confirmo esta alteração de vínculo.</label></p><p id="orBindError" role="alert"></p><div class="or-actions"><button class="btn btn-light" data-close="orBind">Cancelar</button><button class="btn btn-light" id="orUnbind">Remover vínculo direto</button><button class="btn" id="orConfirmBind">Confirmar vínculo</button></div>`;document.body.append(bd);
  const fd=document.createElement('dialog');fd.id='orFilter';fd.className='or-dialog';fd.innerHTML='<form id="orFilterForm"><h3 id="orFilterTitle"></h3><label class="or-filter-label" for="orFilterValue">BUSCAR</label><input id="orFilterValue" type="search" autocomplete="off" placeholder="Digite parte do órgão"></form>';document.body.append(fd);let filterKey='';
  $('orFilterForm').onsubmit=ev=>{ev.preventDefault();fd.close();};
  $('orFilterValue').oninput=()=>{columnFilter[filterKey]=$('orFilterValue').value.trim();render();};
  document.addEventListener('click',ev=>{if(fd.open&&!fd.contains(ev.target)&&!ev.target.closest('[data-filter]'))fd.close();});
  section.addEventListener('change',ev=>{const el=ev.target;if(el.id==='orSelectAll'){for(const id of visibleIds)el.checked?checked.add(id):checked.delete(id);}else if(el.dataset.selectOrg){el.checked?checked.add(el.dataset.selectOrg):checked.delete(el.dataset.selectOrg);}else return;const top=$('orBody').querySelector('.or-table-wrap').scrollTop;render();$('orBody').querySelector('.or-table-wrap').scrollTop=top;});
  $('orDetail').addEventListener('close',()=>{if(!$('orDetail').open)selected=null;});

  section.addEventListener('click',ev=>{const b=ev.target.closest('button');if(b?.dataset.filter){filterKey=b.dataset.filter;$('orFilterTitle').textContent=b.dataset.filter==='name'?'FILTRAR ÓRGÃO':'FILTRAR MUNICÍPIO';$('orFilterValue').value=columnFilter[filterKey];$('orFilterValue').placeholder=b.dataset.filter==='name'?'Digite parte do órgão':'Digite município, UF ou tipo';const r=b.getBoundingClientRect(),w=210;fd.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px';fd.style.top=Math.min(r.bottom+6,window.innerHeight-110)+'px';fd.show();$('orFilterValue').focus();}if(b?.dataset.sort){sortDirection=sortKey===b.dataset.sort?-sortDirection:1;sortKey=b.dataset.sort;render();}});
  $('orRefresh').onclick=refresh;$('orNew').onclick=()=>edit();$('orEditForm').onsubmit=save;
  $('orLogin').onsubmit=async ev=>{ev.preventDefault();const b=ev.target.querySelector('button');b.disabled=true;try{await S.signIn($('orLoginEmail').value,$('orLoginPassword').value);$('orLoginPassword').value='';await refresh();}catch(e){$('orMessage').textContent=error(e);}finally{b.disabled=false;}};
  $('orConfirmBind').onclick=()=>confirmBind('bind');$('orUnbind').onclick=()=>confirmBind('unbind');
  $('orCreateFromSource').onclick=()=>{const row=binding;$('orBind').close();edit(null,{nome:row.orgao,uf:row.uf||''});};
  for(const dialog of [bd,$('orEditor')])dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  section.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;if(b.dataset.orTab){tab=b.dataset.orTab;render();}if(b.dataset.editOrg)edit(b.dataset.editOrg);if(b.hasAttribute('data-org-pncp'))queryPncp(b);if(b.dataset.open)detail(b.dataset.open);if(b.hasAttribute('data-close-detail')){selected=null;$('orDetail').close();}if(b.dataset.bindId)bind(b.dataset.bindKind,b.dataset.bindId,b.dataset.bindCompany);});
  $('orSearch').oninput=render;for(const id of ['orCompany','orPending','orState','orType','orSort'])$(id).onchange=()=>{if(id==='orSort')sortKey='';render();};
  $('orClear').onclick=()=>{checked.clear();columnFilter={name:'',city:''};sortKey='';for(const id of ['orSearch','orCompany','orState','orType'])$(id).value='';$('orSort').value='asc';$('orPending').checked=true;render();};
  S.onChange(has=>{if(!has)clear();else refresh();});render();if(S.has())refresh();
 }
 window.KMOrgaos={mount,render,refresh,identity,options:()=>ready?orgs.map(({id,nome,cnpj,municipio,uf})=>({id,nome,cnpj,municipio,uf})):null,open(){if(!ready)refresh();else render();}};
})();

