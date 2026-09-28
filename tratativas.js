/* Tratativas administrativas: módulo independente dos status e cálculos financeiros. */
(() => {
  'use strict';
  const TIPOS = ['EXTINÇÃO CONSENSUAL','CANCELAMENTO','REEQUILÍBRIO ECONÔMICO-FINANCEIRO','SUBSTITUIÇÃO DE PRODUTO','PRORROGAÇÃO','NOTIFICAÇÃO','DEFESA ADMINISTRATIVA','SUSPENSÃO','OUTROS'];
  const STATUS = ['AGUARDANDO ENVIO','ENVIADO','AGUARDANDO RESPOSTA','EM ANÁLISE PELO ÓRGÃO','DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA','DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO'];
  const FINAIS = new Set(['DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO']);
  const TABLE = 'tratativas_administrativas';
  let rows = [], ready = false, loadError = '', loading = null, editor = null;
  const esc = value => escapeHTML(String(value ?? ''));
  const el = id => document.getElementById(id);
  const contracts = () => [...contratosAtivos,...contratosEncerrados];
  const contract = id => contracts().find(c => String(c.id) === String(id));
  const forContract = id => rows.filter(t => t.contrato_id === String(id));
  const active = t => !t.encerrada_em && !FINAIS.has(t.situacao);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const date = value => value ? formatDate(String(value).slice(0,10)) : '—';
  const datetime = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
  function url(value) {
    if (!value) return '';
    try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  }
  function link(value,label) { const u=url(value); return u ? `<a class="btn btn-light btn-sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : ''; }
  function tone(t) {
    if (FINAIS.has(t.situacao)) return ['DEFERIDO','CONCLUÍDO'].includes(t.situacao) ? 'green' : 'neutral';
    return ({'EXTINÇÃO CONSENSUAL':'orange','CANCELAMENTO':'orange','REEQUILÍBRIO ECONÔMICO-FINANCEIRO':'yellow','SUBSTITUIÇÃO DE PRODUTO':'yellow','NOTIFICAÇÃO':'red','PRORROGAÇÃO':'blue','SUSPENSÃO':'purple'})[t.tipo] || 'neutral';
  }
  function label(t, pedido = false) {
    if (!active(t)) return `${t.tipo} · ${t.situacao}`;
    if (t.situacao === 'AGUARDANDO ENVIO') return `${t.tipo} · AGUARDANDO ENVIO`;
    if (pedido && t.tipo === 'EXTINÇÃO CONSENSUAL') return 'CANCELAMENTO SOLICITADO';
    return ({'EXTINÇÃO CONSENSUAL':'EXTINÇÃO SOLICITADA','CANCELAMENTO':'CANCELAMENTO SOLICITADO','REEQUILÍBRIO ECONÔMICO-FINANCEIRO':'REEQUILÍBRIO SOLICITADO','SUBSTITUIÇÃO DE PRODUTO':'SUBSTITUIÇÃO SOLICITADA','NOTIFICAÇÃO':'NOTIFICAÇÃO RECEBIDA','PRORROGAÇÃO':'PRORROGAÇÃO EM ANÁLISE','SUSPENSÃO':'SUSPENSÃO'})[t.tipo] || t.tipo;
  }
  function followup(t) {
    if (!active(t) || !t.acompanhar_em) return null;
    const days=Math.round((Date.parse(t.acompanhar_em+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);
    return {days,text:days<0 ? `FOLLOW-UP VENCIDO HÁ ${Math.abs(days)} DIA(S)` : days===0 ? 'ACOMPANHAMENTO HOJE' : `ACOMPANHAMENTO EM ${days} DIA(S)`};
  }
  function badge(t,pedido=false) { return `<span class="trat-badge trat-${tone(t)}" title="${esc(t.situacao)}">⚑ ${esc(label(t,pedido))}</span>`; }
  function badges(c) {
    const list=forContract(c.id).filter(active); if (!list.length) return '';
    return `<div class="trat-badges"><span class="trat-badge trat-neutral">${esc(c.status || 'Vigente')}</span>${list.map(t=>badge(t)).join('')}</div>`;
  }
  function empBadges(e) {
    const list=rows.filter(t=>active(t) && t.contrato_id===String(e.contratoId) && (t.empenho_ids||[]).includes(String(e.id)));
    return list.length ? `<div class="trat-badges">${list.map(t=>badge(t,true)).join('')}</div>` : '';
  }
  function matches(c,scope) {
    const tipo=el('tratFiltroTipo'+scope)?.value || '', status=el('tratFiltroStatus'+scope)?.value || '';
    const list=forContract(c.id);
    if (tipo==='sem') return !list.length && !status;
    if (!tipo && !status) return true;
    return list.some(t=>(tipo==='ativa' ? active(t) : !tipo || t.tipo===tipo) && (!status || t.situacao===status));
  }
  function options(values,selected) { return values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join(''); }
  function installFilters() {
    for (const [scope,id] of [['A','contratos-ativos'],['E','contratos-encerrados']]) {
      const section=el(id); if (!section || el('tratFiltros'+scope)) continue;
      const bar=document.createElement('div'); bar.className='trat-filters';bar.id='tratFiltros'+scope;
      bar.innerHTML=`<label>Tratativa<select id="tratFiltroTipo${scope}"><option value="">Todas</option><option value="sem">Sem tratativa</option><option value="ativa">Com tratativa ativa</option>${options(TIPOS,'')}</select></label><label>Situação da tratativa<select id="tratFiltroStatus${scope}"><option value="">Todas</option>${options(STATUS,'')}</select></label><span class="trat-load-status" role="status"></span><button class="btn btn-light btn-sm" data-trat-action="reload">↻ Atualizar tratativas</button>`;
      bar.addEventListener('change',()=> scope==='A'?renderContratosAtivos():renderContratosEncerrados());
      section.querySelector('.disputa-table-card').before(bar);
    }
  }
  function clearFilters(scope) { for(const name of ['Tipo','Status']) if(el('tratFiltro'+name+scope)) el('tratFiltro'+name+scope).value=''; }
  function refreshUI() {
    document.querySelectorAll('.trat-load-status').forEach(n=>{ n.textContent=loadError || (ready?'':'Carregando tratativas…'); });
    document.querySelectorAll('.trat-filters select').forEach(n=>n.disabled=!ready);
    renderContratosAtivos();renderContratosEncerrados();renderEmpenhos();atualizarSino();
    if (typeof _conViewId !== 'undefined' && _conViewId) details(contract(_conViewId));
  }
  async function load() {
    if (loading) return loading;
    loading=(async()=>{
      try {
        const all=[];let offset=0;
        // Paginação evita truncar silenciosamente bases acima do limite REST.
        while(true) {const page=await sbFetch(TABLE,`select=*&order=criado_em.asc,id.asc&limit=500&offset=${offset}`);all.push(...page);if(page.length<500)break;offset+=500;}
        rows=all.map(t=>{const local=rows.find(x=>x.id===t.id);return local && local.versao>t.versao ? local : t;});ready=true;loadError='';
      } catch(e) {ready=false;loadError='Não foi possível carregar as tratativas. Tente atualizar.';console.warn('[Tratativas]',e.message);}
      finally {loading=null;refreshUI();}
    })();return loading;
  }
  function alerts() { return rows.filter(active).map(t=>({t,c:contract(t.contrato_id),f:followup(t)})).filter(a=>a.c && a.f && a.f.days<=2).sort((a,b)=>a.f.days-b.f.days); }
  function appendBell() {
    const list=alerts(),body=el('bellDropdownBody'); if(!body)return;
    if (list.length) {
      if(body.querySelector('.bell-dropdown-empty'))body.innerHTML='';
      body.insertAdjacentHTML('beforeend',`<div class="trat-bell-heading">Tratativas administrativas</div>`+list.map(({t,c,f})=>`<button class="bell-item trat-bell-item" data-trat-action="open-contract" data-contract="${esc(c.id)}"><span class="bell-item-dot ${f.days<0?'bell-dot-red':'bell-dot-orange'}"></span><span class="bell-item-body"><strong>${esc(c.orgao)}</strong><span class="bell-item-info">${esc(label(t))} · ${esc(f.text)}</span><span class="bell-item-info">${esc(t.proxima_acao || 'Acompanhar tratativa')}</span></span></button>`).join(''));
    }
    const total=calcularAlertasVencimento().length+list.length,b=el('bellBadge');if(b){b.textContent=total>99?'99+':String(total);b.classList.toggle('hidden',!total);}
    if(loadError)body.insertAdjacentHTML('beforeend','<div class="trat-notice">Alertas de tratativas temporariamente indisponíveis.</div>');
  }
  function details(c) {
    const host=el('conViewTratativas');if(!host || !c)return;
    const list=forContract(c.id);
    host.innerHTML=`<div class="trat-section-heading"><h3>Tratativas administrativas</h3><button class="btn btn-primary btn-sm" data-trat-action="new" data-contract="${esc(c.id)}" ${!ready?'disabled':''}>+ Nova tratativa</button></div><p class="trat-note">Solicitações administrativas não alteram o status do contrato nem dos empenhos.</p>${!ready?`<p role="status">${esc(loadError || 'Carregando…')}</p>`:!list.length?'<p class="trat-note">Nenhuma tratativa cadastrada.</p>':list.map(t=>card(t)).join('')}`;
  }
  function card(t) {
    const f=followup(t);const selected=(t.empenho_ids||[]).map(id=>empenhos.find(e=>String(e.id)===id)).filter(Boolean);
    return `<article class="trat-card"><div class="trat-card-heading"><strong>${esc(t.tipo)}</strong>${badge(t)}</div><div class="trat-info"><span>Situação: <b>${esc(t.situacao)}</b></span><span>Solicitada/ocorrida em: ${date(t.data_ocorrencia)}</span><span>Última atualização: ${esc(datetime(t.atualizado_em))}</span><span>Abrangência: ${esc({'contrato':'Somente contrato','empenhos':'Empenhos/pedidos','contrato_empenhos':'Contrato + empenhos/pedidos'}[t.abrangencia])}</span></div><p class="trat-text">${esc(t.descricao)}</p>${selected.length?`<p class="trat-note">Empenhos: ${selected.map(e=>`${esc(e.numero || 'Sem número')} · ${formatCurrency(e.valor)}`).join('; ')}</p>`:''}${t.observacoes?`<p class="trat-text"><b>Observações:</b> ${esc(t.observacoes)}</p>`:''}<p class="trat-text"><b>Próxima ação:</b> ${esc(t.proxima_acao || 'Não informada')}</p>${t.acompanhar_em?`<p><b>Acompanhar em:</b> ${date(t.acompanhar_em)} ${f?`<span class="trat-badge trat-${f.days<0?'red':'blue'}">◷ ${esc(f.text)}</span>`:''}</p>`:''}${t.encerrada_em?`<p><b>Encerrada em:</b> ${date(t.encerrada_em)}</p><p class="trat-text"><b>Desfecho:</b> ${esc(t.resultado)}</p>`:''}<div class="trat-actions">${link(t.link_gmail,'Abrir e-mail')}${link(t.link_documento,'Abrir documento')}${link(t.link_externo,'Abrir link')}<button class="btn btn-light btn-sm" data-trat-action="edit" data-id="${esc(t.id)}">Editar</button><button class="btn btn-light btn-sm" data-trat-action="update" data-id="${esc(t.id)}">Registrar atualização</button>${active(t)?`<button class="btn btn-light btn-sm" data-trat-action="close" data-id="${esc(t.id)}">Concluir tratativa</button>`:''}<button class="btn btn-light btn-sm" data-trat-action="history" data-id="${esc(t.id)}">Ver histórico</button></div><div id="tratHistory-${esc(t.id)}" class="trat-history" hidden></div></article>`;
  }
  async function history(id) {
    const host=el('tratHistory-'+id);if(!host)return;
    if(!host.hidden){host.hidden=true;return;}host.hidden=false;host.textContent='Carregando histórico…';
    try {
      const list=[];let offset=0;
      while(true){const page=await sbFetch('tratativas_historico',`tratativa_id=eq.${encodeURIComponent(id)}&order=data_hora.asc,id.asc&limit=500&offset=${offset}`);list.push(...page);if(page.length<500)break;offset+=500;}
      host.innerHTML=list.map(h=>`<div class="trat-history-entry"><b>${esc(datetime(h.data_hora))}</b><p class="trat-text">${esc(h.descricao)}</p><p>${esc(h.status_anterior || 'Cadastro')} → ${esc(h.novo_status)}</p>${h.usuario_id?`<p>Responsável: ${esc(h.usuario_id)}</p>`:'<p class="trat-note">Responsável não identificado (sistema sem sessão individual).</p>'}${h.observacao?`<p class="trat-text">${esc(h.observacao)}</p>`:''}${link(h.link_documento,'Documento da atualização')}<details><summary>Dados registrados nesta atualização</summary><dl>${Object.entries(h.depois||{}).filter(([k])=>!['id','contrato_id','nota_atualizacao'].includes(k)).map(([k,v])=>`<dt>${esc(fieldName(k))}</dt><dd class="trat-text">${esc(Array.isArray(v)?v.join(', '):v??'—')}</dd>`).join('')}</dl></details></div>`).join('') || 'Nenhuma atualização registrada.';
    } catch {host.textContent='Não foi possível carregar o histórico. Feche e tente novamente.';}
  }
  const fieldName = k => ({tipo:'Tipo',situacao:'Situação',data_ocorrencia:'Data da ocorrência',descricao:'Descrição',abrangencia:'Abrangência',empenho_ids:'Empenhos vinculados (IDs)',observacoes:'Observações',link_externo:'Link externo',link_gmail:'Link do Gmail',link_documento:'Documento',proxima_acao:'Próxima ação',acompanhar_em:'Acompanhar em',resultado:'Desfecho',encerrada_em:'Encerramento',atualizado_em:'Última atualização',criado_em:'Cadastro',versao:'Versão'}[k]||k);
  function field(k,type,value,required=false) { return `<label>${esc(fieldName(k))}${required?' *':''}${type==='textarea'?`<textarea name="${k}" ${required?'required':''}>${esc(value ?? '')}</textarea>`:`<input name="${k}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='url'?'placeholder="https://…"':''}>`}</label>`; }
  function openEditor(contractId,id=null,mode='edit') {
    if(!ready)return;
    const c=contract(contractId),t=id?rows.find(t=>t.id===id):null;if(!c || (id&&!t))return;
    editor={contractId:String(c.id),id,version:t?.versao,mode,opener:document.activeElement};
    const data=t || {tipo:TIPOS[0],situacao:STATUS[0],data_ocorrencia:today(),abrangencia:'contrato',empenho_ids:[]};
    const kinds=TIPOS.includes(data.tipo)?TIPOS:[...TIPOS,data.tipo];
    const dialog=el('tratEditor');
    dialog.innerHTML=`<form id="tratForm"><header><div><h3>${id?(mode==='close'?'Concluir tratativa':mode==='update'?'Registrar atualização':'Editar tratativa'):'Nova tratativa administrativa'}</h3><p>${esc(c.orgao)} · ${esc(c.contrato)} · ${esc(c.empresa)}</p></div><button type="button" class="modal-close" data-trat-action="cancel" aria-label="Fechar">×</button></header><div class="trat-form-body"><p class="trat-note">O status jurídico permanece ${esc(c.status || 'Vigente')}. Nenhum empenho será cancelado automaticamente.</p><div class="trat-form-grid"><label>Tipo *<select name="tipo" required>${options(kinds,data.tipo)}</select></label><label>Situação *<select name="situacao" required>${options(STATUS,mode==='close'?'CONCLUÍDO':data.situacao)}</select></label>${field('data_ocorrencia','date',data.data_ocorrencia,true)}<label>Abrangência *<select name="abrangencia"><option value="contrato" ${data.abrangencia==='contrato'?'selected':''}>Somente contrato</option><option value="empenhos" ${data.abrangencia==='empenhos'?'selected':''}>Somente empenhos/pedidos</option><option value="contrato_empenhos" ${data.abrangencia==='contrato_empenhos'?'selected':''}>Contrato + empenhos/pedidos</option></select></label></div><fieldset id="tratEmpenhos"><legend>Empenhos/pedidos vinculados *</legend>${empenhos.filter(e=>String(e.contratoId)===String(c.id)).map(e=>`<label class="trat-check"><input type="checkbox" name="empenho_ids" value="${esc(e.id)}" ${(data.empenho_ids||[]).includes(String(e.id))?'checked':''}>${esc(e.numero || 'Sem número')} · ${formatCurrency(e.valor)} · ${esc(e.status)} · ${(e.itensEmpenhados||[]).reduce((s,i)=>s+(Number(i.qtdEmp)||0),0)} unidades</label>`).join('') || '<p>Nenhum empenho vinculado a este contrato.</p>'}</fieldset>${field('descricao','textarea',data.descricao,true)}${field('observacoes','textarea',data.observacoes)}<div class="trat-form-grid">${field('link_gmail','url',data.link_gmail)}${field('link_documento','url',data.link_documento)}${field('link_externo','url',data.link_externo)}${field('acompanhar_em','date',data.acompanhar_em)}</div>${field('proxima_acao','textarea',data.proxima_acao)}<div id="tratClosing">${field('resultado','textarea',data.resultado)}${field('encerrada_em','date',data.encerrada_em || (mode==='close'?today():''))}</div>${id?'<label>Descrição desta atualização *<textarea name="nota_atualizacao" required placeholder="Descreva o que mudou ou a providência realizada"></textarea></label>':''}<p id="tratFormError" class="trat-error" role="alert"></p></div><footer><button type="button" class="btn btn-light" data-trat-action="cancel">Cancelar</button><button type="submit" class="btn btn-primary">Salvar tratativa</button></footer></form>`;
    dialog.showModal();const form=el('tratForm');form.addEventListener('submit',save);form.addEventListener('change',formState);formState();
    (mode==='update'?form.elements.nota_atualizacao:form.elements.tipo).focus();
  }
  function formState() {
    const f=el('tratForm');if(!f)return;const closed=FINAIS.has(f.elements.situacao.value);
    el('tratEmpenhos').hidden=f.elements.abrangencia.value==='contrato';
    el('tratClosing').hidden=!closed;
    f.elements.resultado.required=closed;f.elements.encerrada_em.required=closed;
    f.elements.encerrada_em.min=f.elements.data_ocorrencia.value;
    if(closed&&!f.elements.encerrada_em.value)f.elements.encerrada_em.value=today();
  }
  function cancel() { if(el('tratForm')?.dataset.saving)return;el('tratEditor').close();editor?.opener?.focus();editor=null; }
  async function save(event) {
    event.preventDefault();const form=event.currentTarget;if(form.dataset.saving)return;
    const data=Object.fromEntries(new FormData(form)),current=editor;
    data.empenho_ids=data.abrangencia==='contrato'?[]:new FormData(form).getAll('empenho_ids');
    const fail=message=>{el('tratFormError').textContent=message;};
    if(data.abrangencia!=='contrato'&&!data.empenho_ids.length)return fail('Selecione pelo menos um empenho/pedido.');
    for(const key of ['link_externo','link_gmail','link_documento'])if(data[key]&&!url(data[key]))return fail('Use URLs completas iniciadas por https:// ou http://.');
    data.acompanhar_em=data.acompanhar_em || null;
    if(!FINAIS.has(data.situacao)){data.encerrada_em=null;data.resultado='';}else if(!data.resultado.trim())return fail('Informe o resultado/desfecho.');
    data.nota_atualizacao=current.id?data.nota_atualizacao.trim():'Tratativa cadastrada';
    data.contrato_id=current.contractId;
    if(!data.descricao.trim() || (current.id&&!data.nota_atualizacao))return fail('Preencha a descrição e o registro da atualização.');
    if(!current.id){current.idNovo=current.idNovo||crypto.randomUUID();data.id=current.idNovo;}
    form.dataset.saving='true';form.querySelectorAll('button').forEach(b=>b.disabled=true);fail('');
    try {
      const query=current.id?`?id=eq.${encodeURIComponent(current.id)}&versao=eq.${current.version}`:'';
      const res=await fetch(`${SUPA_URL}/rest/v1/${TABLE}${query}`,{method:current.id?'PATCH':'POST',headers:supaHeaders({'Prefer':'return=representation'}),body:JSON.stringify(data)});
      if(!res.ok)throw new Error(res.status===409?'Este cadastro já existe ou foi alterado. Atualize as tratativas antes de tentar novamente.':'O banco não confirmou o salvamento. Verifique a conexão, os vínculos e as permissões.');
      const saved=await res.json();if(!saved.length)throw new Error('Outra pessoa alterou esta tratativa. Cancele, atualize e abra novamente para preservar o histórico.');
      rows=rows.filter(t=>t.id!==saved[0].id).concat(saved);delete form.dataset.saving;cancel();refreshUI();showToast('Tratativa salva com histórico.','success');
    }catch(e){fail(e.message);}finally{delete form.dataset.saving;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-trat-action]');if(!b)return;
    event.preventDefault();event.stopPropagation();const action=b.dataset.tratAction;
    if(action==='reload')return void load();if(action==='cancel')return cancel();
    if(action==='history')return void history(b.dataset.id);
    if(action==='open-contract'){fecharBellDropdown();const c=contract(b.dataset.contract);if(c)abrirConView(c.id,contratosEncerrados.some(x=>x.id===c.id)?'enc':'ativo');return;}
    if(action==='new')return openEditor(b.dataset.contract);
    const t=rows.find(t=>t.id===b.dataset.id);if(t)openEditor(t.contrato_id,t.id,action);
  });
  const dialog=document.createElement('dialog');dialog.id='tratEditor';dialog.className='trat-dialog';dialog.setAttribute('aria-label','Tratativa administrativa');dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});document.body.append(dialog);
  window.KMTratativas={load,badges,empBadges,matches,clearFilters,details,appendBell,active,followup};
  installFilters();load();
  // Datas de acompanhamento são recalculadas ao retornar à tela e durante o uso.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden)atualizarSino();},60000);
})();

