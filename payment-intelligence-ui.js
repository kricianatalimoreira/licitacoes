(function(){
  'use strict';
  const model=window.KMPaymentIntelligence;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null?'Não informado':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date=v=>model.day(v)===null?'—':v.split('-').reverse().join('/');
  const days=v=>v===null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias';
  let adapter,settings={...model.defaults},tab='ranking',editing=null;
  function loadSettings(){try{settings=model.config(JSON.parse(localStorage.getItem('km_payment_intelligence_settings')||'{}'));}catch{settings={...model.defaults};}}
  const metric=s=>`${days(s.mean)}<small>${s.n} pagamentos válidos</small>`;
  function options(){return {basis:$('piBasis').value,empresa:$('piCompany').value,orgao:$('piSearch').value,ano:$('piYear').value,mes:$('piMonth').value,config:settings};}
  function filteredRows(){const o=options();return adapter.getRows().filter(e=>(!o.empresa||String(e.empresa).toLowerCase()===o.empresa.toLowerCase())&&(!o.orgao||String(e.orgao||'').toLocaleUpperCase('pt-BR').includes(o.orgao.toLocaleUpperCase('pt-BR'))));}
  function render(){
    if(!$('payment-intelligence'))return;
    const result=model.analyze(adapter.getRows(),options());
    const year=$('piYear');[...new Set(adapter.getRows().map(e=>(e.dataPagamento||'').slice(0,4)).filter(v=>/^\d{4}$/.test(v)))].sort().forEach(y=>{if(!Array.from(year.options).some(o=>o.value===y))year.add(new Option(y,y));});
    const eligible=result.groups.reduce((s,g)=>s+g.eligible,0),late=result.groups.reduce((s,g)=>s+g.late,0);
    $('piCount').textContent=result.groups.length;
    $('piCoverage').textContent=result.groups.reduce((s,g)=>s+g.sample.n,0)+' pagamentos válidos · '+result.groups.reduce((s,g)=>s+g.excluded,0)+' sem datas válidas para esta base';
    $('piLate').textContent=eligible?(late/eligible*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—';
    $('piLateNote').textContent=eligible?late+' de '+eligible+' pagos com vencimento documentado':'Falta vencimento contratual documentado';
    $('piOverdue').textContent=result.overdue.length?money(result.overdueValue):result.unassessed?'—':money(0);
    $('piOverdueNote').textContent=result.overdue.length+' saldos vencidos confirmados · '+result.unassessed+' pendências sem saldo/prazo completo';
    $('piForecasts').textContent=result.groups.reduce((n,g)=>n+g.forecasts.filter(f=>f.date).length,0);
    $('piBasisText').textContent='Base: '+model.bases[result.basis].label+' → pagamento. Mínimo de '+settings.minSamples+' pagamentos para ranking e previsão. Datas ausentes, invertidas ou pagamentos futuros são excluídos. Órgãos e empresas não são fundidos.';
    const groups=[...result.groups].sort((a,b)=>($('piSort').value==='slow'?(b.sample.mean??-Infinity)-(a.sample.mean??-Infinity):(a.sample.mean??Infinity)-(b.sample.mean??Infinity))||String(a.orgao).localeCompare(String(b.orgao)));
    let headers,html;
    if(tab==='ranking'){
      headers=['Órgão / empresa','Emissão → pago','Recebimento do empenho → pago','Entrega física → pago','Aceite definitivo → pago','Liquidação → pago','Classificação / ranking','Fora do prazo contratual'];
      html=groups.map(g=>`<tr><td><button type="button" class="pi-link" data-org="${esc(g.orgao)}" data-company="${esc(g.empresa)}">${esc(g.orgao)}</button><small>${esc(g.empresa)}</small></td><td>${metric(g.metrics.issue)}</td><td>${metric(g.metrics.receipt)}</td><td>${metric(g.metrics.physical)}</td><td>${metric(g.metrics.acceptance)}</td><td>${metric(g.metrics.liquidation)}</td><td>${esc(g.classification)}<small>${g.rank?'Posição '+g.rank+' entre '+result.ranked.length+' grupos':'Fora do ranking: amostra insuficiente'} · ${g.sample.n} pagamentos</small></td><td>${g.lateRate===null?'Não apurado':g.lateRate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}<small>${g.eligible?g.late+' de '+g.eligible+' com prazo documentado':'Sem vencimento documentado'}</small></td></tr>`).join('');
    }else if(tab==='pending'){
      headers=['Órgão / empresa','Empenho','Previsão histórica','Vencimento contratual','Saldo confirmado','Dias de atraso contratual','Dados'];
      html=groups.flatMap(g=>g.forecasts.map(f=>`<tr><td>${esc(g.orgao)}<small>${esc(g.empresa)}</small></td><td>${esc(f.entry.numero)}</td><td>${f.date?date(f.date):'Sem base suficiente'}<small>${f.date?'Mediana de '+g.sample.n+' pagos; não é garantia.':'Informe a data-base e complete o histórico.'}${f.estimatePassed?' Previsão já passou; isso não comprova atraso contratual.':''}</small></td><td>${f.deadline?date(f.deadline):'Não informado'}</td><td>${money(f.balance)}<small>${f.balance!==null?'Conferido em '+date(f.entry.dataSaldoConfirmado):'Não inferido pelo valor do empenho'}</small></td><td>${f.overdueDays!==null?f.overdueDays+' dias':f.balance===0?'Sem saldo':!f.deadline||f.balance===null?'Não apurado':'No prazo'}</td><td><button class="btn btn-light btn-sm" type="button" data-edit="${esc(f.entry.id)}">Registrar dados</button></td></tr>`)).join('');
    }else{
      headers=['Órgão / empresa','Empenho / status','Emissão / entrega física','Recebimento / aceite','Liquidação / pagamento','Vencimento contratual','Dados'];
      html=filteredRows().map(e=>`<tr><td>${esc(e.orgao)}<small>${esc(e.empresa)}</small></td><td>${esc(e.numero)}<small>${esc(e.status)}</small></td><td>${date(e.data)}<small>Entrega: ${date(e.dataEntrega)}</small></td><td>${date(e.dataRecebimentoEmpenho)}<small>Aceite: ${date(e.dataRecebimentoDefinitivo)}</small></td><td>${date(e.dataLiquidacao)}<small>Pago: ${date(e.dataPagamento)}</small></td><td>${date(e.dataVencimentoPagamento)}</td><td><button type="button" class="btn btn-light btn-sm" data-edit="${esc(e.id)}">Registrar dados</button></td></tr>`).join('');
    }
    $('piTableHead').innerHTML='<tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr>';
    $('piTableBody').innerHTML=html||'<tr><td colspan="'+headers.length+'">Nenhum registro nesta seleção.</td></tr>';
    $('piTableBody').querySelectorAll('tr').forEach(row=>Array.from(row.children).forEach((cell,i)=>cell.dataset.label=headers[i]||''));
    $('piScope').textContent=tab==='records'?'Cadastro: todos os períodos; filtros de órgão e empresa aplicados.':'Mês/ano limitam os pagamentos do histórico. Pendências não são limitadas pelo período. Saldos refletem a última conferência: atualize após pagamentos parciais ou cancelamentos.';
    document.querySelectorAll('[data-pi-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.piTab===tab)));
  }
  function edit(id){
    const e=adapter.getRows().find(e=>e.id===id);if(!e)return;
    editing=id;$('piEditTitle').textContent=e.orgao+' · '+e.empresa+' · Empenho '+e.numero;
    for(const field of Object.keys(model.fields))$('pi_'+field).value=e[field]??'';
    $('piEditError').textContent='';$('piEditor').showModal();
  }
  async function save(event){
    event.preventDefault();const e=adapter.getRows().find(e=>e.id===editing);if(!e)return;
    const button=$('piSave');button.disabled=true;
    try{
      const values=Object.fromEntries(Object.keys(model.fields).map(k=>[k,$('pi_'+k).value]));
      const payload=model.validate(values,e);
      await adapter.save(editing,payload);
      $('piEditor').close();render();
    }catch(error){$('piEditError').textContent=error.message||'Não foi possível salvar. Tente novamente.';}
    finally{button.disabled=false;}
  }
  function warn(contract){
    let box=$('piNewWarning');const anchor=$('empSaldoContratoInfo');if(!anchor)return;
    if(!box){box=document.createElement('div');box.id='piNewWarning';box.className='pi-warning';box.setAttribute('role','status');anchor.insertAdjacentElement('afterend',box);}
    box.hidden=!contract;if(!contract)return;
    loadSettings();box.textContent=model.warning(adapter.getRows(),contract.orgao,contract.empresa,{basis:'physical',config:settings});
  }
  function mount(a){
    adapter=a;loadSettings();
    const section=document.createElement('section');section.id='payment-intelligence';section.className='page-section hidden';
    section.innerHTML=`<div class="topbar"><div><h2>Inteligência de pagamentos</h2><p>Histórico observado para apoiar decisões de capital de giro. Não é garantia de pagamento futuro.</p></div></div>
    <div class="pi-controls"><label>Empresa<select id="piCompany"><option value="">Todas (separadas)</option><option>Hamate</option><option>Gadita</option></select></label><label>Órgão<input id="piSearch" type="search" placeholder="Buscar órgão"/></label><label>Mês do pagamento<select id="piMonth"><option value="">Todos</option>${Array.from({length:12},(_,i)=>'<option value="'+String(i+1).padStart(2,'0')+'">'+String(i+1).padStart(2,'0')+'</option>').join('')}</select></label><label>Ano<select id="piYear"><option value="">Todos</option></select></label><label>Base do ranking / previsão<select id="piBasis">${Object.entries(model.bases).map(([k,b])=>'<option value="'+k+'"'+(k==='physical'?' selected':'')+'>'+b.label+'</option>').join('')}</select></label><label>Ranking<select id="piSort"><option value="fast">Mais rápidos primeiro</option><option value="slow">Mais lentos primeiro</option></select></label></div>
    <details class="pi-settings"><summary>Configurar faixas e amostra mínima</summary><form id="piSettingsForm"><label>Rápido até (dias)<input id="piFast" type="number" min="0" value="${settings.fast}" required/></label><label>Regular até<input id="piRegular" type="number" min="1" value="${settings.regular}" required/></label><label>Lento até<input id="piSlow" type="number" min="2" max="3650" value="${settings.slow}" required/></label><label>Amostra mínima<input id="piMin" type="number" min="1" max="100" value="${settings.minSamples}" required/></label><button class="btn btn-light" type="submit">Aplicar</button><small>Acima do limite lento: crítico. Preferências salvas neste navegador. As faixas não definem atraso contratual.</small><span id="piSettingsError" role="status"></span></form></details>
    <div class="pi-kpis"><div><span>Órgãos / empresas</span><strong id="piCount">—</strong><small id="piCoverage"></small></div><div><span>Histórico de atrasos</span><strong id="piLate">—</strong><small id="piLateNote"></small></div><div><span>Valores em atraso apurados</span><strong id="piOverdue">—</strong><small id="piOverdueNote"></small></div><div><span>Previsões disponíveis</span><strong id="piForecasts">—</strong><small>Mediana do histórico; mesma empresa, órgão e data-base</small></div></div>
    <p id="piBasisText" class="pi-help"></p><div class="pi-tabs"><button type="button" class="btn btn-light" data-pi-tab="ranking">Histórico e ranking</button><button type="button" class="btn btn-light" data-pi-tab="pending">Previsões e pendências</button><button type="button" class="btn btn-light" data-pi-tab="records">Registrar datas e prazos</button></div><p class="pi-help" id="piScope"></p><div class="pi-table-wrap"><table class="pi-table"><thead id="piTableHead"></thead><tbody id="piTableBody"></tbody></table></div>`;
    document.querySelector('main.content').append(section);
    const paidButton=document.querySelector('[data-section-target="empenhos-encerrados"]');
    const button=document.createElement('button');button.className='menu-child';button.dataset.sectionTarget='payment-intelligence';button.innerHTML='<span class="menu-child-dot"></span><span class="menu-label">Inteligência de pagamentos</span>';button.addEventListener('click',()=>adapter.open(button));paidButton.insertAdjacentElement('afterend',button);
    const dialog=document.createElement('dialog');dialog.id='piEditor';
    const labels={dataRecebimentoEmpenho:'Recebimento do empenho pela empresa',dataRecebimentoDefinitivo:'Recebimento definitivo / aceite pelo órgão',dataLiquidacao:'Liquidação',dataVencimentoPagamento:'Vencimento contratual do pagamento',fontePrazoPagamento:'Fonte do prazo (cláusula / documento)',saldoPendenteConfirmado:'Saldo pendente confirmado (R$)',dataSaldoConfirmado:'Data da conferência do saldo'};
    dialog.innerHTML=`<form id="piEditForm"><h3 id="piEditTitle"></h3><p>Preencha somente eventos confirmados. Não substitui emissão ou entrega física. O vencimento deve seguir o contrato, inclusive dias úteis ou suspensões aplicáveis. Saldo deve descontar pagamentos parciais e valores cancelados.</p><div class="pi-edit-grid">${Object.entries(labels).map(([k,label])=>'<label>'+label+'<input id="pi_'+k+'" '+(k==='fontePrazoPagamento'?'type="text" maxlength="1000"':k==='saldoPendenteConfirmado'?'type="number" min="0" step="0.01"':'type="date"')+'/></label>').join('')}</div><p id="piEditError" role="alert"></p><div class="pi-actions"><button type="button" class="btn btn-light" id="piCancel">Cancelar</button><button type="submit" class="btn" id="piSave">Salvar dados confirmados</button></div></form>`;
    document.body.append(dialog);$('piCancel').addEventListener('click',()=>dialog.close());$('piEditForm').addEventListener('submit',save);
    section.addEventListener('input',ev=>{if(ev.target.id==='piSearch')render();});
    section.addEventListener('change',ev=>{if(ev.target.closest('.pi-controls'))render();});
    section.addEventListener('click',ev=>{const b=ev.target.closest('[data-pi-tab],[data-edit],[data-org]');if(!b)return;if(b.dataset.piTab){tab=b.dataset.piTab;render();}else if(b.dataset.edit)edit(b.dataset.edit);else{$('piSearch').value=b.dataset.org;$('piCompany').value=b.dataset.company;tab='records';render();}});
    $('piSettingsForm').addEventListener('submit',ev=>{ev.preventDefault();try{settings=model.config({fast:Number($('piFast').value),regular:Number($('piRegular').value),slow:Number($('piSlow').value),minSamples:Number($('piMin').value)});localStorage.setItem('km_payment_intelligence_settings',JSON.stringify(settings));$('piSettingsError').textContent='Preferências salvas.';render();}catch(e){$('piSettingsError').textContent=e.message;}});
  }
  window.KMPaymentUI={mount,render,warn};
})();

