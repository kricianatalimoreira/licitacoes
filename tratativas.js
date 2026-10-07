/* Tratativas administrativas: módulo independente dos status e cálculos financeiros. */
(() => {
  'use strict';
  const TIPOS = ['CANCELAMENTO','REEQUILÍBRIO ECONÔMICO-FINANCEIRO','SUBSTITUIÇÃO DE PRODUTO','NOTIFICAÇÃO','DEFESA ADMINISTRATIVA'];
  const tipoAtual = tipo => tipo === 'EXTINÇÃO CONSENSUAL' ? 'CANCELAMENTO' : tipo;
  const tipoNome = tipo => tipoAtual(tipo);
  const STATUS = ['AGUARDANDO RESPOSTA','DEFERIDO','INDEFERIDO','CANCELADO','CONCLUÍDO'];
  const FINAIS = new Set(['DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO']);
  const TABLE = 'tratativas_administrativas';
  let rows = [], ready = false, loadError = '', loading = null, editor = null;
  let lastMovements = new Map(), movementError = '';
  let detailId=null,detailEvents=[],detailLoading=false,detailError='',detailRequest=0,movementDraft=null;
  const MOVEMENT_TYPES={email_enviado:'E-mail enviado',email_recebido:'E-mail recebido',documento:'Documento',ligacao:'Ligação',whatsapp:'WhatsApp',protocolo:'Protocolo',observacao:'Observação',alteracao_status:'Alteração de status',follow_up:'Follow-up'};
  const DETAIL_STATUSES=['Em andamento','Aguardando órgão','Resposta recebida','Follow-up','Em análise','Deferido','Indeferido','Encerrado'];
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
  function gmailLink(value) {
    const u=url(value);
    const icon='<svg width="18" height="14" viewBox="0 0 24 18" aria-hidden="true" focusable="false" style="vertical-align:middle;margin-right:6px"><path fill="#4285f4" d="M0 4v12a2 2 0 0 0 2 2h3V7z"/><path fill="#34a853" d="M19 7v11h3a2 2 0 0 0 2-2V4z"/><path fill="#ea4335" d="M5 7l7 5 7-5V2l-7 5-7-5z"/><path fill="#c5221f" d="M0 4V2a2 2 0 0 1 3-1l2 1v5z"/><path fill="#fbbc04" d="M19 2l2-1a2 2 0 0 1 3 1v2l-5 3z"/></svg>';
    return u ? `<a class="btn btn-light btn-sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${icon}Abrir e-mail</a>` : `<button type="button" class="btn btn-light btn-sm" disabled title="Adicione o link do Gmail em Editar para abrir o e-mail.">${icon}Abrir e-mail</button>`;
  }
  function tone(t) {
    if (FINAIS.has(t.situacao)) return ['DEFERIDO','CONCLUÍDO'].includes(t.situacao) ? 'green' : 'neutral';
    return ({'EXTINÇÃO CONSENSUAL':'orange','CANCELAMENTO':'orange','REEQUILÍBRIO ECONÔMICO-FINANCEIRO':'yellow','SUBSTITUIÇÃO DE PRODUTO':'yellow','NOTIFICAÇÃO':'red','PRORROGAÇÃO':'blue','SUSPENSÃO':'purple'})[t.tipo] || 'neutral';
  }
  function label(t, pedido = false) {
    if (!active(t)) return `${tipoNome(t.tipo)} · ${t.situacao}`;
    if (t.situacao === 'AGUARDANDO ENVIO') return `${tipoNome(t.tipo)} · AGUARDANDO ENVIO`;
    if (pedido && t.tipo === 'EXTINÇÃO CONSENSUAL') return 'CANCELAMENTO SOLICITADO';
    return ({'EXTINÇÃO CONSENSUAL':'CANCELAMENTO SOLICITADO','CANCELAMENTO':'CANCELAMENTO SOLICITADO','REEQUILÍBRIO ECONÔMICO-FINANCEIRO':'REEQUILÍBRIO SOLICITADO','SUBSTITUIÇÃO DE PRODUTO':'SUBSTITUIÇÃO SOLICITADA','NOTIFICAÇÃO':'NOTIFICAÇÃO RECEBIDA','PRORROGAÇÃO':'PRORROGAÇÃO EM ANÁLISE','SUSPENSÃO':'SUSPENSÃO'})[t.tipo] || t.tipo;
  }
  function followup(t) {
    if (!active(t) || !t.acompanhar_em) return null;
    const days=Math.round((Date.parse(t.acompanhar_em+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);
    return {days,text:days<0 ? `FOLLOW-UP VENCIDO HÁ ${Math.abs(days)} DIA(S)` : days===0 ? 'ACOMPANHAMENTO HOJE' : `ACOMPANHAMENTO EM ${days} DIA(S)`};
  }
  function badge(t,pedido=false) { return `<span class="trat-badge trat-${tone(t)}" title="${esc(t.situacao)}">⚑ ${esc(label(t,pedido))}</span>`; }
  function badges(c) {
    const list=forContract(c.id).filter(active); if (!list.length) return '';
    return `<div class="trat-badges">${list.map(t=>badge(t)).join('')}</div>`;
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
    return list.some(t=>(tipo==='ativa' ? active(t) : !tipo || tipoAtual(t.tipo)===tipo) && (!status || t.situacao===status));
  }
  function options(values,selected) { return values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(tipoNome(v))}</option>`).join(''); }
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
  // Campos administrativos; timestamps técnicos e metadados de e-mail não reiniciam DIAS.
  const movementFields = ['tipo','situacao','data_ocorrencia','descricao','abrangencia','empenho_ids','observacoes','proxima_acao','acompanhar_em','resultado','encerrada_em','responsavel_id','prioridade','prazo'];
  function relevantMovement(before,after) {
    if (!before) return true;
    const value=(row,key)=>key==='empenho_ids' ? [...(row?.[key]||[])].sort() : row?.[key] ?? (key==='prioridade'?'Normal':'');
    if(movementFields.some(key=>JSON.stringify(value(before,key))!==JSON.stringify(value(after,key))))return true;
    const linksChanged=['link_gmail','link_externo','link_documento','emails_vinculados','email_referencias'].some(key=>JSON.stringify(before?.[key]??'')!==JSON.stringify(after?.[key]??''));
    // Registrar uma providência somente em texto também é uma movimentação relevante.
    return !linksChanged && Boolean(after?.nota_atualizacao?.trim());
  }
  async function loadMovements() {
    try {
      const found=new Map();let offset=0;
      while(true) {
        const page=await sbFetch('tratativas_historico',`select=tratativa_id,data_hora,ocorrida_em,origem,antes,depois&order=data_hora.asc,id.asc&limit=500&offset=${offset}`);
        for(const h of page) if(h.origem==='manual'||relevantMovement(h.antes,h.depois)) {
          const previous=found.get(h.tratativa_id);
          const when=h.ocorrida_em||h.data_hora;
          if(Number.isFinite(Date.parse(when)) && (!previous || Date.parse(when)>Date.parse(previous))) found.set(h.tratativa_id,when);
        }
        if(page.length<500)break;offset+=500;
      }
      // Mantém uma atualização local mais recente que a leitura iniciada antes do salvamento.
      for(const [id,time] of lastMovements) if(!found.has(id)||Date.parse(time)>Date.parse(found.get(id)))found.set(id,time);
      lastMovements=found;movementError='';
    } catch {movementError='Não foi possível carregar o histórico. Última movimentação e dias estão indisponíveis.';}
  }
  function movementDate(t) {return movementError ? null : lastMovements.get(t.id)||t.created_at||t.criado_em||t.data_ocorrencia;}
  function daysSince(value,now=new Date()) {
    if(!value)return null;const start=new Date(value);
    if(!Number.isFinite(start.getTime()))return null;
    const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
    return Math.max(0,Math.round((day(now)-day(start))/86400000));
  }
  function summaryStatus(t) {
    return t.status||({'AGUARDANDO ENVIO':'Em andamento','ENVIADO':'Aguardando órgão','AGUARDANDO RESPOSTA':'Aguardando órgão','EM ANÁLISE PELO ÓRGÃO':'Em análise','DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA':'Em análise','RESPOSTA RECEBIDA':'Resposta recebida','FOLLOW-UP':'Follow-up','DEFERIDO':'Deferido','PARCIALMENTE DEFERIDO':'Deferido','INDEFERIDO':'Indeferido','CANCELADO':'Encerrado','CONCLUÍDO':'Encerrado'}[t.situacao]||t.situacao);
  }
  function summaryTable() {
    if(!ready)return `<p class="trat-note" role="status">${esc(loadError||'Carregando tratativas…')}</p>${loadError?'<button type="button" class="btn btn-light btn-sm" data-trat-action="reload">Tentar novamente</button>':''}`;
    if(!rows.length)return '<p class="trat-note">Nenhuma tratativa cadastrada.</p>';
    const list=[...rows].sort((a,b)=>Number(active(b))-Number(active(a))||(Date.parse(movementDate(b))||0)-(Date.parse(movementDate(a))||0)||a.id.localeCompare(b.id));
    return `${movementError?`<p class="trat-note" role="status">${esc(movementError)} <button type="button" class="btn btn-light btn-sm" data-trat-action="reload">Tentar novamente</button></p>`:''}<table class="trat-summary-table" aria-label="Tratativas administrativas"><thead><tr>${['Órgão','Empenho / Contrato','Tipo de tratativa','Última<br>movimentação','Próxima ação','Status','Dias'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${list.map(t=>{
      const c=contract(t.contrato_id),moment=movementDate(t),days=daysSince(moment),status=summaryStatus(t);
      const color={'Em andamento':'blue','Aguardando órgão':'orange','Resposta recebida':'green','Follow-up':'yellow','Em análise':'purple','Deferido':'green','Indeferido':'red','Encerrado':'neutral'}[status]||'neutral';
      const linked=(t.empenho_ids||[]).map(id=>empenhos.find(e=>String(e.id)===String(id)));
      const empenhoText=linked.map(e=>e?.numero||'Número indisponível').join(', ');
      return `<tr data-tratativa-id="${esc(t.id)}"><td class="trat-summary-orgao"><button type="button" class="trat-detail-link" data-trat-action="detail" data-id="${esc(t.id)}" aria-label="Abrir detalhes: ${esc(c?.orgao||'tratativa')}">${esc(c?.orgao||'Órgão indisponível')}</button></td><td>${empenhoText?`<span>Empenho: ${esc(empenhoText)}</span>`:''}<span class="${empenhoText?'trat-summary-secondary':''}">Contrato: ${esc(c?.contrato||'Não informado')}</span></td><td>${esc(t.tipo_tratativa||tipoNome(t.tipo))}</td><td>${moment?esc(datetime(moment)):'—'}</td><td>${esc(t.proxima_acao||'Não informada')}${t.data_proxima_acao||t.acompanhar_em?`<span class="trat-summary-secondary">${esc(date(t.data_proxima_acao||t.acompanhar_em))}</span>`:''}</td><td><span class="trat-badge trat-${color}">${esc(status)}</span></td><td title="Dias corridos desde a última movimentação administrativa relevante">${days===null?'—':days}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function renderSummaries() {
    const html=summaryTable();
    for(const id of ['dashTratativasList','tratTodasLista']) {const host=el(id);if(host&&host.innerHTML!==html)host.innerHTML=html;}
    document.querySelectorAll('[data-trat-action="new-global"]').forEach(b=>b.disabled=!ready);
  }
  function openNew() {
    if(!ready)return;
    const available=[...new Map(contracts().map(c=>[String(c.id),contract(c.id)])).values()].sort((a,b)=>(a.orgao||'').localeCompare(b.orgao||''));
    editor={opener:document.activeElement};
    const dialog=el('tratEditor');
    dialog.innerHTML=`<form id="tratChooseContract"><header><div><h3>Nova tratativa administrativa</h3><p>Selecione a ata/contrato para iniciar o cadastro.</p></div><button type="button" class="modal-close" data-trat-action="cancel" aria-label="Fechar">×</button></header><div class="trat-form-body">${available.length?`<label>Ata/contrato *<select name="contrato_id" required><option value="">Selecione…</option>${available.map(c=>`<option value="${esc(c.id)}">${esc(c.orgao)} · ${esc(c.contrato||'Sem número')} · ${esc(c.empresa)}</option>`).join('')}</select></label>`:'<p class="trat-note">Nenhuma ata/contrato disponível para cadastrar a tratativa.</p>'}</div><footer><button type="button" class="btn btn-light" data-trat-action="cancel">Cancelar</button><button type="submit" class="btn btn-primary" ${!available.length?'disabled':''}>Continuar</button></footer></form>`;
    dialog.showModal();
    el('tratChooseContract').addEventListener('submit',event=>{
      event.preventDefault();const id=event.currentTarget.elements.contrato_id.value;if(!id)return;
      const opener=editor.opener;dialog.close();openEditor(id);if(editor)editor.opener=opener;
    });
    dialog.querySelector('select')?.focus();
  }
  function detailStatusBadge(t) {
    const status=summaryStatus(t),color={'Em andamento':'blue','Aguardando órgão':'orange','Resposta recebida':'green','Follow-up':'yellow','Em análise':'purple','Deferido':'green','Indeferido':'red','Encerrado':'neutral'}[status]||'neutral';
    return `<span class="trat-badge trat-${color}">${esc(status)}</span>`;
  }
  function renderDetailPage() {
    const host=el('tratDetailContent');if(!host||!detailId)return;
    const t=rows.find(t=>t.id===detailId&&!t.excluida);
    if(detailError&&!t){host.innerHTML=`<div class="meta-card"><p class="trat-error" role="alert">${esc(detailError)}</p><button type="button" class="btn btn-light btn-sm" data-trat-action="reload-detail">Tentar novamente</button></div>`;return;}
    if(!t){host.innerHTML='<div class="meta-card"><p class="trat-note" role="status">Carregando tratativa…</p></div>';return;}
    const c=contract(t.contrato_id)||{},selected=(t.empenho_ids||[]).map(id=>empenhos.find(e=>String(e.id)===String(id))?.numero||'Número indisponível');
    const priority=t.prioridade||'Normal',priorityColor={Baixa:'neutral',Normal:'blue',Alta:'orange',Urgente:'red'}[priority]||'neutral';
    const entry=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
    const events=[...detailEvents].sort((a,b)=>Date.parse(a.ocorrida_em||a.data_hora)-Date.parse(b.ocorrida_em||b.data_hora)||Date.parse(a.data_hora)-Date.parse(b.data_hora)||a.id.localeCompare(b.id));
    const timeline=detailLoading?'<p class="trat-note" role="status">Carregando histórico…</p>':detailError?`<p class="trat-error" role="alert">${esc(detailError)}</p><button type="button" class="btn btn-light btn-sm" data-trat-action="reload-detail">Tentar novamente</button>`:events.length?`<ol class="trat-timeline">${events.map(h=>{
      const type=h.tipo_movimentacao||(h.status_anterior&&h.status_anterior!==h.novo_status?'alteracao_status':'observacao');
      const when=h.ocorrida_em||h.data_hora;
      const from=h.status_anterior?summaryStatus({status:h.antes?.status,situacao:h.status_anterior}):null;
      const to=summaryStatus({status:h.depois?.status,situacao:h.novo_status});
      const reference=url(h.link_referencia||h.link_documento);
      return `<li class="trat-timeline-event" data-event-id="${esc(h.id)}"><div class="trat-timeline-top"><span class="trat-badge trat-${type==='alteracao_status'?'purple':type==='follow_up'?'orange':'blue'}">${esc(MOVEMENT_TYPES[type]||'Observação')}</span><time datetime="${esc(when)}">${esc(datetime(when))}</time></div><p class="trat-text">${esc(h.descricao)}</p>${from&&h.status_anterior!==h.novo_status?`<p class="trat-note">${esc(from)} → ${esc(to)}</p>`:''}${reference?`<p><a class="venc-banner-link" href="${esc(reference)}" target="_blank" rel="noopener noreferrer">Abrir referência ↗</a></p>`:''}<p class="trat-note">${h.origem==='manual'?'Registro manual':'Registro do sistema'} · ${h.usuario_id?`Usuário ${esc(h.usuario_id)}`:'Autor não identificado'}${Date.parse(when)!==Date.parse(h.data_hora)?` · Registrado em ${esc(datetime(h.data_hora))}`:''}</p></li>`;
    }).join('')}</ol>`:'<p class="trat-note">Nenhuma movimentação registrada.</p>';
    host.innerHTML=`<div class="meta-card trat-detail-header"><dl class="trat-detail-grid">${entry('EMPRESA',esc(c.empresa||'Não informada'))}${entry('ÓRGÃO',esc(c.orgao||'Não informado'))}${entry('PROCESSO',esc(c.processo||'Não informado'))}${entry('CONTRATO/ATA',esc(c.contrato||'Não informado'))}${entry('EMPENHO(S)',esc(selected.join(', ')||'Nenhum vinculado'))}${entry('RESPONSÁVEL',esc(t.responsavel_id?`Usuário ${t.responsavel_id}`:'Não atribuído'))}${entry('STATUS',detailStatusBadge(t))}${entry('PRIORIDADE',`<span class="trat-badge trat-${priorityColor}">${esc(priority)}</span>`)}</dl></div><div class="trat-detail-columns"><section class="meta-card trat-detail-section"><h3>SITUAÇÃO ATUAL</h3><p><strong>${esc(t.tipo_tratativa||tipoNome(t.tipo))}</strong></p><p class="trat-text">${esc(t.descricao||'Não informada')}</p>${t.observacoes?`<p class="trat-text"><strong>Observações:</strong> ${esc(t.observacoes)}</p>`:''}${t.resultado?`<p class="trat-text"><strong>Resultado:</strong> ${esc(t.resultado)}</p>`:''}</section><section class="meta-card trat-detail-section"><h3>PRÓXIMA AÇÃO</h3><p class="trat-text">${esc(t.proxima_acao||'Não informada')}</p><p><strong>Data prevista:</strong> ${esc(date(t.data_proxima_acao||t.acompanhar_em))}</p></section></div><section class="meta-card trat-detail-section"><div class="trat-panel-header"><h3>TIMELINE</h3><button type="button" class="btn btn-primary btn-sm" id="tratDetailAdd" data-trat-action="new-movement" ${detailLoading||detailError?'disabled':''}>+ Adicionar movimentação</button></div>${timeline}</section>`;
  }
  async function loadDetail(id) {
    const request=++detailRequest;detailId=id;detailLoading=true;detailError='';detailEvents=[];renderDetailPage();
    try {
      const result=await sbFetch(TABLE,`id=eq.${encodeURIComponent(id)}&excluida=eq.false&limit=1`);
      if(request!==detailRequest)return;
      if(!result.length){rows=rows.filter(t=>t.id!==id);throw Error('Tratativa não encontrada ou indisponível.');}
      const current=rows.find(t=>t.id===id);
      if(!current||result[0].versao>=current.versao)rows=rows.filter(t=>t.id!==id).concat(result);
      const events=[];let offset=0;
      while(true){const page=await sbFetch('tratativas_historico',`tratativa_id=eq.${encodeURIComponent(id)}&order=ocorrida_em.asc,data_hora.asc,id.asc&limit=500&offset=${offset}`);events.push(...page);if(page.length<500)break;offset+=500;}
      if(request!==detailRequest)return;detailEvents=events;
    } catch(e){if(request===detailRequest)detailError=e.message==='Tratativa não encontrada ou indisponível.'?e.message:'Não foi possível carregar o histórico. Tente novamente.';}
    finally{if(request===detailRequest){detailLoading=false;renderDetailPage();}}
  }
  function openDetail(id) {
    el('menuGroupTratativas')?.classList.add('is-open');
    showSection('tratativas-detalhes',document.querySelector('[data-section-target="tratativas-todas"]'));
    void loadDetail(id);
  }
  function localDatetime(value=new Date()) {
    const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function closeMovement() {
    if(movementDraft?.saving)return;
    el('tratMovementDialog').close();const opener=movementDraft?.opener;movementDraft=null;
    (opener?.isConnected?opener:el('tratDetailAdd'))?.focus();
  }
  function movementFormState() {
    const f=el('tratMovementForm');if(!f)return;
    const status=f.elements.tipo.value==='alteracao_status',closed=status&&['Deferido','Indeferido','Encerrado'].includes(f.elements.status.value);
    el('tratMovementStatus').hidden=!status;f.elements.status.required=status;
    el('tratMovementClosing').hidden=!closed;f.elements.resultado.required=closed;f.elements.encerrada_em.required=closed;
    el('tratMovementEmailNote').hidden=!['email_enviado','email_recebido'].includes(f.elements.tipo.value);
  }
  function openMovement() {
    const t=rows.find(t=>t.id===detailId);if(!t||detailLoading||detailError)return;
    movementDraft={tratativaId:t.id,version:t.versao,requestId:crypto.randomUUID(),payload:null,saving:false,opener:document.activeElement};
    const dialog=el('tratMovementDialog');
    dialog.innerHTML=`<form id="tratMovementForm"><header><h3>Adicionar movimentação</h3><button type="button" class="modal-close" data-trat-action="cancel-movement" aria-label="Fechar">×</button></header><div class="trat-form-body"><div class="trat-form-grid"><label>Tipo *<select name="tipo" required>${Object.entries(MOVEMENT_TYPES).map(([value,label])=>`<option value="${value}" ${value==='observacao'?'selected':''}>${label}</option>`).join('')}</select></label><label>Data e hora da movimentação *<input type="datetime-local" name="ocorrida_em" value="${localDatetime()}" required></label></div><p class="trat-movement-note" id="tratMovementEmailNote" hidden>Registre um e-mail já enviado ou recebido. Este formulário não envia e-mails.</p><label>Descrição *<textarea name="descricao" required></textarea></label><label>Link de referência (opcional)<input type="url" name="link_referencia" placeholder="https://…"></label><div id="tratMovementStatus" hidden><label>Novo status *<select name="status"><option value="">Selecione…</option>${DETAIL_STATUSES.filter(s=>s!==summaryStatus(t)).map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label></div><div id="tratMovementClosing" hidden><label>Resultado *<textarea name="resultado"></textarea></label><label>Data de encerramento *<input type="date" name="encerrada_em" min="${esc(t.data_ocorrencia)}" value="${today()}"></label></div><p class="trat-error" id="tratMovementError" role="alert"></p></div><footer><button type="button" class="btn btn-light" data-trat-action="cancel-movement">Cancelar</button><button type="submit" class="btn btn-primary">Salvar movimentação</button></footer></form>`;
    dialog.showModal();el('tratMovementForm').addEventListener('change',movementFormState);el('tratMovementForm').addEventListener('submit',saveMovement);el('tratMovementForm').elements.descricao.focus();
  }
  async function saveMovement(event) {
    event.preventDefault();const draft=movementDraft,f=event.currentTarget;if(!draft||draft.saving)return;
    const fail=message=>el('tratMovementError').textContent=message;
    const occurred=new Date(f.elements.ocorrida_em.value),type=f.elements.tipo.value,description=f.elements.descricao.value.trim(),reference=f.elements.link_referencia.value.trim();
    if(!description)return fail('Descreva a movimentação.');
    if(!Number.isFinite(occurred.getTime())||occurred>new Date())return fail('Informe uma data e hora válida, sem estar no futuro.');
    if(reference&&!url(reference))return fail('Informe um link HTTP ou HTTPS válido.');
    const changedStatus=type==='alteracao_status',status=changedStatus?f.elements.status.value:null,closed=changedStatus&&['Deferido','Indeferido','Encerrado'].includes(status);
    const payload={p_tratativa_id:draft.tratativaId,p_versao:draft.version,p_tipo:type,p_descricao:description,p_ocorrida_em:occurred.toISOString(),p_link_referencia:reference,p_status:status,p_resultado:closed?f.elements.resultado.value.trim():null,p_encerrada_em:closed?f.elements.encerrada_em.value:null};
    const signature=JSON.stringify(payload);if(draft.payload&&draft.payload!==signature)draft.requestId=crypto.randomUUID();draft.payload=signature;
    draft.saving=true;f.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);fail('');
    try {
      const response=await fetch(`${SUPA_URL}/rest/v1/rpc/registrar_movimentacao_tratativa`,{method:'POST',headers:supaHeaders(),body:JSON.stringify({...payload,p_requisicao_id:draft.requestId})});
      if(!response.ok){const problem=await response.json().catch(()=>({}));throw Error(problem.code==='40001'?'A tratativa foi alterada por outra pessoa. Feche este formulário, atualize os detalhes e tente novamente.':problem.message||'Não foi possível salvar. Tente novamente; o mesmo registro não será duplicado.');}
      const eventId=await response.json();if(!eventId)throw Error('O banco não confirmou a movimentação. Tente novamente.');
      draft.saving=false;closeMovement();showToast('Movimentação registrada. Histórico preservado.','success');
      await load();await loadDetail(draft.tratativaId);
    } catch(e){fail(e.message);}
    finally {draft.saving=false;if(f.isConnected)f.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);}
  }

  function refreshUI() {
    renderSummaries();
    renderDetailPage();
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
        rows=all.filter(t=>!t.excluida).map(t=>{const local=rows.find(x=>x.id===t.id);return local && local.versao>t.versao ? local : t;});ready=true;loadError='';
        await loadMovements();
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

  function emailTargets() {
    return rows.map(t=>{
      const c=contract(t.contrato_id)||{},refs=t.email_referencias||{};
      return {id:t.id,excluida:t.excluida,emails:t.emails_vinculados||[],identifiers:{
        empenho:(t.empenho_ids||[]).map(id=>empenhos.find(e=>String(e.id)===id)?.numero).filter(Boolean),
        processo:c.processo,ata:c.ata||c.numeroAta,contrato:c.contrato,orgao:c.orgao,cnpj:c.cnpj,...refs}};
    });
  }
  function emailList(t) {
    const mails=t.emails_vinculados||[];
    return mails.length ? '<div class="trat-email-list"><b>E-mails vinculados</b>'+mails.map(m=>'<p>'+link(m.link,m.subject||'Abrir e-mail')+(m.date?' · '+esc(datetime(m.date)):'')+'</p>').join('')+'</div>':'';
  }
  function receiveEmail(raw) {
    if(!ready)throw new Error('Aguarde o carregamento das tratativas.');
    const result=KMEmailMatching.suggest(raw,emailTargets());
    openEmailLink(result.suggestion?.id||null,result.email,result);
    return result;
  }
  function openEmailLink(id=null,email={},result=null) {
    const available=rows.filter(t=>!t.excluida),chosen=available.find(t=>t.id===id);
    if(!available.length){showToast('Cadastre uma tratativa antes de vincular um e-mail.','error');return;}
    const d=el('tratEmailDialog'),meta=KMEmailMatching.normalize(email);
    const heading=result?.suggestion ? 'Este e-mail parece estar relacionado à Tratativa #'+result.suggestion.id.slice(0,8)+'. Deseja vinculá-lo?' : result ? 'Correspondência incerta. Escolha a tratativa para vincular manualmente.' : 'Vincular e-mail manualmente';
    const input=(key,label,value,type='text',required=false)=>'<label>'+label+'<input name="'+key+'" type="'+type+'" value="'+esc(value||'')+'" '+(required?'required':'')+'></label>';
    d.innerHTML='<form><header><h3>'+esc(heading)+'</h3></header><div class="trat-form-body">'+(result?.suggestion?'<p>Correspondências: '+esc(result.suggestion.evidence.join(', '))+'</p>':'')+
      '<label>Tratativa *<select name="tratativa" required><option value="">Selecione</option>'+available.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===id?'selected':'')+'>#'+esc(t.id.slice(0,8))+' · '+esc(contract(t.contrato_id)?.orgao)+' · '+esc(tipoNome(t.tipo))+' · '+esc(t.situacao)+'</option>').join('')+'</select></label>'+
      input('link','Link do e-mail *',meta.link,'url',true)+input('subject','Assunto',meta.subject)+
      '<details><summary>Identificadores para correspondência futura (opcional)</summary><p>Informe apenas dados confirmados deste e-mail. Não informe senhas ou tokens.</p>'+
      input('messageId','Message-ID',meta.messageId)+input('references','Referências da conversa',meta.references.join(' '))+
      ['empenho','processo','ata','contrato','orgao','cnpj'].map(k=>input(k,({empenho:'Número do empenho',processo:'Número do processo',ata:'Número da ata',contrato:'Número do contrato',orgao:'Órgão',cnpj:'CNPJ'})[k],meta.identifiers[k])).join('')+'</details>'+
      '<p class="trat-error" role="alert"></p></div><footer><button type="button" class="btn btn-light" data-email-cancel>Cancelar</button><button type="submit" class="btn btn-primary">Confirmar vínculo</button></footer></form>';
    const f=d.querySelector('form');
    // Capture versions on opening: stale edits are rejected rather than overwritten.
    const versions=new Map(available.map(t=>[t.id,t.versao]));
    d.querySelector('[data-email-cancel]').onclick=()=>{if(!f.dataset.saving)d.close();};
    f.onsubmit=async ev=>{
      ev.preventDefault();if(f.dataset.saving)return;
      const data=Object.fromEntries(new FormData(f)),t=rows.find(t=>t.id===data.tratativa);
      const error=f.querySelector('[role="alert"]');error.textContent='';
      if(!t){error.textContent='Escolha uma tratativa disponível.';return;}
      try {
        const identifiers={};for(const k of ['empenho','processo','ata','contrato','orgao','cnpj'])if(data[k].trim())identifiers[k]=data[k].trim();
        const normalized=KMEmailMatching.normalize({...meta,link:data.link,subject:data.subject,messageId:data.messageId,references:data.references,identifiers});
        if((t.emails_vinculados||[]).some(m=>KMEmailMatching.same(m,normalized)))throw Error('Este e-mail já está vinculado a esta tratativa.');
        const linked={...normalized,linkedAt:new Date().toISOString(),method:result?.suggestion?.id===t.id?'sugestao_confirmada':'manual'};
        f.dataset.saving='true';f.querySelectorAll('button').forEach(b=>b.disabled=true);
        const refs={...(t.email_referencias||{})};
        for(const [k,v] of Object.entries(identifiers))refs[k]=[...new Set([...(Array.isArray(refs[k])?refs[k]:refs[k]?[refs[k]]:[]),v])];
        const res=await fetch(SUPA_URL+'/rest/v1/'+TABLE+'?id=eq.'+encodeURIComponent(t.id)+'&versao=eq.'+versions.get(t.id)+'&excluida=eq.false',{method:'PATCH',headers:supaHeaders({'Prefer':'return=representation'}),body:JSON.stringify({emails_vinculados:[...(t.emails_vinculados||[]),linked],email_referencias:refs,nota_atualizacao:'E-mail vinculado por confirmação: '+(normalized.subject||normalized.messageId||'link informado')})});
        if(!res.ok)throw Error('Não foi possível salvar o vínculo. Tente novamente.');
        const saved=await res.json();if(!saved.length)throw Error('A tratativa foi alterada ou excluída. Atualize e tente novamente.');
        rows=rows.filter(x=>x.id!==t.id).concat(saved);d.close();refreshUI();showToast('E-mail vinculado com histórico.','success');
      }catch(e){error.textContent=e.message;}finally{delete f.dataset.saving;f.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    d.showModal();
  }

  function card(t) {
    const f=followup(t);const selected=(t.empenho_ids||[]).map(id=>empenhos.find(e=>String(e.id)===id)).filter(Boolean);
    return `<article class="trat-card"><div class="trat-card-heading"><strong>#${esc(t.id.slice(0,8))} · ${esc(tipoNome(t.tipo))}</strong>${badge(t)}</div><div class="trat-info"><span>Situação: <b>${esc(t.situacao)}</b></span><span>Solicitada/ocorrida em: ${date(t.data_ocorrencia)}</span><span>Última atualização: ${esc(datetime(t.atualizado_em))}</span><span>Abrangência: ${esc({'contrato':'Somente contrato','empenhos':'Empenhos/pedidos','contrato_empenhos':'Contrato + empenhos/pedidos'}[t.abrangencia])}</span></div><p class="trat-text">${esc(t.descricao)}</p>${selected.length?`<p class="trat-note">Empenhos: ${selected.map(e=>`${esc(e.numero || 'Sem número')} · ${formatCurrency(e.valor)}`).join('; ')}</p>`:''}${t.observacoes?`<p class="trat-text"><b>Observações:</b> ${esc(t.observacoes)}</p>`:''}<p class="trat-text"><b>Próxima ação:</b> ${esc(t.proxima_acao || 'Não informada')}</p>${t.acompanhar_em?`<p><b>Acompanhar em:</b> ${date(t.acompanhar_em)} ${f?`<span class="trat-badge trat-${f.days<0?'red':'blue'}">◷ ${esc(f.text)}</span>`:''}</p>`:''}${t.encerrada_em?`<p><b>Encerrada em:</b> ${date(t.encerrada_em)}</p><p class="trat-text"><b>Desfecho:</b> ${esc(t.resultado)}</p>`:''}<div class="trat-actions"><button class="btn btn-light btn-sm" data-trat-action="edit" data-id="${esc(t.id)}">Editar</button><button class="btn btn-light btn-sm" data-trat-action="update" data-id="${esc(t.id)}">Registrar atualização</button>${active(t)?`<button class="btn btn-light btn-sm" data-trat-action="close" data-id="${esc(t.id)}">Concluir tratativa</button>`:''}</div><div class="trat-actions trat-actions-secondary" aria-label="E-mails e histórico">${link(t.link_externo,'Abrir link')}<button class="btn btn-light btn-sm" data-trat-action="history" data-id="${esc(t.id)}">Ver histórico</button><button class="btn btn-light btn-sm" data-trat-action="delete" data-id="${esc(t.id)}">Excluir tratativa</button></div><div id="tratHistory-${esc(t.id)}" class="trat-history" hidden></div></article>`;
  }
  async function history(id) {
    const host=el('tratHistory-'+id);if(!host)return;
    if(!host.hidden){host.hidden=true;return;}host.hidden=false;host.textContent='Carregando histórico…';
    try {
      const list=[];let offset=0;
      while(true){const page=await sbFetch('tratativas_historico',`tratativa_id=eq.${encodeURIComponent(id)}&order=data_hora.asc,id.asc&limit=500&offset=${offset}`);list.push(...page);if(page.length<500)break;offset+=500;}
      host.innerHTML=list.map(h=>`<div class="trat-history-entry"><b>${esc(datetime(h.data_hora))}</b><p class="trat-text">${esc(h.descricao)}</p><p>${esc(h.status_anterior || 'Cadastro')} → ${esc(h.novo_status)}</p>${h.usuario_id?`<p>Responsável: ${esc(h.usuario_id)}</p>`:'<p class="trat-note">Responsável não identificado (sistema sem sessão individual).</p>'}${h.observacao?`<p class="trat-text">${esc(h.observacao)}</p>`:''}<details><summary>Dados registrados nesta atualização</summary><dl>${Object.entries(h.depois||{}).filter(([k])=>!['id','contrato_id','nota_atualizacao','link_documento'].includes(k)).map(([k,v])=>`<dt>${esc(fieldName(k))}</dt><dd class="trat-text">${esc(v && typeof v==='object'?JSON.stringify(v,null,2):v??'—')}</dd>`).join('')}</dl></details></div>`).join('') || 'Nenhuma atualização registrada.';
    } catch {host.textContent='Não foi possível carregar o histórico. Feche e tente novamente.';}
  }
  const fieldName = k => ({tipo:'Tipo',situacao:'Situação',data_ocorrencia:'Data da solicitação/ocorrência',descricao:'Descrição',abrangencia:'Abrangência',empenho_ids:'Empenhos vinculados (IDs)',observacoes:'Observações',link_externo:'Link externo',link_gmail:'Link do Gmail',link_documento:'Documento',proxima_acao:'Próxima ação',acompanhar_em:'Acompanhar em',resultado:'Desfecho',encerrada_em:'Encerramento',atualizado_em:'Última atualização',criado_em:'Cadastro',versao:'Versão'}[k]||k);
  function field(k,type,value,required=false) { return `<label>${esc(fieldName(k))}${required?' *':''}${type==='textarea'?`<textarea name="${k}" ${required?'required':''}>${esc(value ?? '')}</textarea>`:`<input name="${k}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='url'?'placeholder="https://…"':''}>`}</label>`; }
  function openEditor(contractId,id=null,mode='edit') {
    if(!ready)return;
    const c=contract(contractId),t=id?rows.find(t=>t.id===id):null;if(!c || (id&&!t))return;
    editor={contractId:String(c.id),id,version:t?.versao,mode,opener:document.activeElement};
    const data=t ? {...t,tipo:tipoAtual(t.tipo)} : {tipo:TIPOS[0],situacao:STATUS[0],data_ocorrencia:today(),abrangencia:'contrato',empenho_ids:[]};
    const kinds=TIPOS.includes(data.tipo)?TIPOS:[...TIPOS,data.tipo];
    const situations=STATUS.includes(data.situacao)?STATUS:[...STATUS,data.situacao];
    const dialog=el('tratEditor');
    dialog.innerHTML=`<form id="tratForm"><header><div><h3>${id?(mode==='close'?'Concluir tratativa':mode==='update'?'Registrar atualização':'Editar tratativa'):'Nova tratativa administrativa'}</h3><p>${esc(c.orgao)} · ${esc(c.contrato)} · ${esc(c.empresa)}</p></div><button type="button" class="modal-close" data-trat-action="cancel" aria-label="Fechar">×</button></header><div class="trat-form-body"><p class="trat-note">O status jurídico permanece ${esc(c.status || 'Vigente')}. Nenhum empenho será cancelado automaticamente.</p><div class="trat-form-grid"><label>Tipo *<select name="tipo" required>${options(kinds,data.tipo)}</select></label><label>Situação *<select name="situacao" required>${options(situations,mode==='close'?'CONCLUÍDO':data.situacao)}</select></label>${field('data_ocorrencia','date',data.data_ocorrencia,true)}<label>Abrangência *<select name="abrangencia"><option value="contrato" ${data.abrangencia==='contrato'?'selected':''}>Somente contrato</option><option value="empenhos" ${data.abrangencia==='empenhos'?'selected':''}>Somente empenhos/pedidos</option><option value="contrato_empenhos" ${data.abrangencia==='contrato_empenhos'?'selected':''}>Contrato + empenhos/pedidos</option></select></label></div><fieldset id="tratEmpenhos"><legend>Empenhos/pedidos vinculados *</legend>${empenhos.filter(e=>String(e.contratoId)===String(c.id)).map(e=>`<label class="trat-check"><input type="checkbox" name="empenho_ids" value="${esc(e.id)}" ${(data.empenho_ids||[]).includes(String(e.id))?'checked':''}>${esc(e.numero || 'Sem número')} · ${formatCurrency(e.valor)} · ${esc(e.status)} · ${(e.itensEmpenhados||[]).reduce((s,i)=>s+(Number(i.qtdEmp)||0),0)} unidades</label>`).join('') || '<p>Nenhum empenho vinculado a este contrato.</p>'}</fieldset>${field('descricao','textarea',data.descricao,true)}${field('observacoes','textarea',data.observacoes)}<div class="trat-form-grid">${field('link_gmail','url',data.link_gmail)}${field('link_externo','url',data.link_externo)}${field('acompanhar_em','date',data.acompanhar_em)}</div>${field('proxima_acao','textarea',data.proxima_acao)}<div id="tratClosing">${field('resultado','textarea',data.resultado)}${field('encerrada_em','date',data.encerrada_em || (mode==='close'?today():''))}</div>${id?'<label>Descrição desta atualização *<textarea name="nota_atualizacao" required placeholder="Descreva o que mudou ou a providência realizada"></textarea></label>':''}<p id="tratFormError" class="trat-error" role="alert"></p></div><footer><button type="button" class="btn btn-light" data-trat-action="cancel">Cancelar</button><button type="submit" class="btn btn-primary">Salvar tratativa</button></footer></form>`;
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
      if(relevantMovement(rows.find(t=>t.id===saved[0].id),saved[0]))lastMovements.set(saved[0].id,saved[0].atualizado_em);
      rows=rows.filter(t=>t.id!==saved[0].id).concat(saved);delete form.dataset.saving;cancel();refreshUI();showToast('Tratativa salva com histórico.','success');
    }catch(e){fail(e.message);}finally{delete form.dataset.saving;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function removeTreatment(id,button) {
    const t=rows.find(x=>x.id===id);if(!t || button.disabled)return;
    if(!confirm('Excluir esta tratativa? Ela sairá do contrato, dos filtros e dos alertas. O histórico será preservado para recuperação.'))return;
    button.disabled=true;
    try {
      const res=await fetch(`${SUPA_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&versao=eq.${t.versao}`,{method:'PATCH',headers:supaHeaders({'Prefer':'return=representation'}),body:JSON.stringify({excluida:true,nota_atualizacao:'Tratativa excluída da visualização; histórico preservado.'})});
      if(!res.ok)throw new Error('Não foi possível excluir. Tente novamente.');
      const saved=await res.json();if(!saved.length)throw new Error('A tratativa foi alterada. Atualize a lista antes de excluir.');
      rows=rows.filter(x=>x.id!==id);refreshUI();showToast('Tratativa excluída. Histórico preservado.','success');
    }catch(e){showToast(e.message,'error');button.disabled=false;}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-trat-action]');if(!b)return;
    event.preventDefault();event.stopPropagation();const action=b.dataset.tratAction;
    if(action==='reload')return void load();if(action==='cancel')return cancel();
    if(action==='detail')return openDetail(b.dataset.id);
    if(action==='reload-detail')return void loadDetail(detailId);
    if(action==='new-movement')return openMovement();
    if(action==='cancel-movement')return closeMovement();
    if(action==='new-global')return openNew();
    if(action==='view-all') {
      el('menuGroupTratativas')?.classList.add('is-open');
      showSection('tratativas-todas',document.querySelector('[data-section-target="tratativas-todas"]'));
      renderSummaries();return;
    }
    if(action==='history')return void history(b.dataset.id);
    if(action==='delete')return void removeTreatment(b.dataset.id,b);
    if(action==='link-email')return openEmailLink(b.dataset.id);
    if(action==='open-contract'){fecharBellDropdown();const c=contract(b.dataset.contract);if(c)abrirConView(c.id,contratosEncerrados.some(x=>x.id===c.id)?'enc':'ativo');return;}
    if(action==='new')return openEditor(b.dataset.contract);
    const t=rows.find(t=>t.id===b.dataset.id);if(t)openEditor(t.contrato_id,t.id,action);
  });
  const dialog=document.createElement('dialog');dialog.id='tratEditor';dialog.className='trat-dialog';dialog.setAttribute('aria-label','Tratativa administrativa');dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});document.body.append(dialog);
  const movementDialog=document.createElement('dialog');movementDialog.id='tratMovementDialog';movementDialog.className='trat-dialog';movementDialog.setAttribute('aria-label','Adicionar movimentação');movementDialog.addEventListener('cancel',e=>{e.preventDefault();closeMovement();});document.body.append(movementDialog);
  const emailDialog=document.createElement('dialog');emailDialog.id='tratEmailDialog';emailDialog.className='trat-dialog';emailDialog.setAttribute('aria-label','Vincular e-mail');emailDialog.addEventListener('cancel',e=>{if(emailDialog.querySelector('form')?.dataset.saving)e.preventDefault();});document.body.append(emailDialog);
  window.KMTratativasEmail={suggest:email=>KMEmailMatching.suggest(email,emailTargets()),receive:receiveEmail};
  window.KMTratativas={load,badges,empBadges,matches,clearFilters,details,appendBell,active,followup};
  installFilters();load();
  // Datas de acompanhamento são recalculadas ao retornar à tela e durante o uso.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden){atualizarSino();renderSummaries();}},60000);
})();
