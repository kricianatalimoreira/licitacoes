/* Aditivos / prorrogações: isolado de empenhos e tratativas. */
(() => {
 'use strict';
 const TYPES=['Prorrogação de vigência','Acréscimo quantitativo','Supressão quantitativa','Reequilíbrio econômico-financeiro','Reajuste','Repactuação','Alteração de valor','Alteração contratual','Outro'];
 const STATES=['Em tratativa','Solicitado pelo órgão','Manifestação enviada','Aguardando formalização','Formalizado','Indeferido','Cancelado'];
 const FINANCIAL=TYPES.slice(1,7), TABLE='contrato_aditivos';
 const $=id=>document.getElementById(id), esc=v=>escapeHTML(String(v??''));
 const date=v=>v?formatDate(v):'—', money=v=>v===null||v===undefined?'—':formatCurrency(v);
 const allContracts=()=>[...contratosAtivos,...contratosEncerrados];
 const contract=id=>allContracts().find(c=>String(c.id)===String(id));
 let rows=[],bases=[],treatments=[],ready=false,error='',loading=null,editor=null;
 const list=id=>rows.filter(a=>a.contrato_id===String(id)&&!a.excluido);
 const original=id=>bases.find(b=>b.contrato_id===String(id));
 const formal=id=>list(id).filter(a=>a.status==='Formalizado');
 const pending=id=>list(id).some(a=>a.tipo===TYPES[0]&&!['Formalizado','Indeferido','Cancelado'].includes(a.status)) ||
  treatments.some(t=>t.contrato_id===String(id)&&!t.excluida&&/prorroga/i.test(String(t.tipo).normalize('NFD').replace(/[\u0300-\u036f]/g,''))&&!['DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO'].includes(t.situacao)&&!t.encerrada_em&&!formal(id).some(a=>a.tratativa_id===t.id));
 function project(c) {const b=c&&original(c.id);if(b){c.data=b.data_original;c.dataFim=b.vencimento_atual;c.valor=Number(b.valor_atual);}return c;}
 function projectAll(){allContracts().forEach(project);}
 function badges(c){return pending(c.id)?'<span class="trat-badge trat-orange">PRORROGAÇÃO EM ANDAMENTO</span>':'';}
 function header(c){const n=formal(c.id).length;return n?' · '+n+(n===1?' ADITIVO':' ADITIVOS'):'';}
 function expiry(c){return formal(c.id).some(a=>a.nova_vigencia)?'<div class="con-view-metric-sub">PRORROGADO POR ADITIVO</div>':'';}
 async function pages(table) {const all=[];for(let offset=0;;offset+=500){const p=await sbFetch(table,'select=*&order='+ (table==='contrato_aditivos_base'?'contrato_id':'id')+'.asc&limit=500&offset='+offset);all.push(...p);if(p.length<500)return all;}}
 function refresh() {
  projectAll();renderContratosAtivos();renderContratosEncerrados();atualizarSino();
  if(typeof renderDashboard==='function')renderDashboard();
  if(typeof _conViewId!=='undefined'&&_conViewId&&!$('conViewWrap').classList.contains('hidden'))abrirConView(_conViewId,_conViewType);
 }
 async function load() {
  if(loading)return loading;
  loading=(async()=>{
   try {const data=await Promise.all([pages(TABLE),pages('contrato_aditivos_base'),pages('tratativas_administrativas')]);[rows,bases,treatments]=data;ready=true;error='';}
   catch(e){ready=false;error='Não foi possível carregar os aditivos. Tente atualizar.';console.warn('[Aditivos]',e.message);}
   finally{loading=null;refresh();}
  })();return loading;
 }
 function documentLink(value) {
  if(!/^https?:\/\/[^\s]+$/i.test(value||''))return '';
  return '<a class="btn btn-light btn-sm" href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">Abrir documento</a>';
 }
 function card(a) {
  const tone=a.status==='Formalizado'?'green':['Cancelado','Indeferido'].includes(a.status)?'neutral':'orange';
  return '<article class="trat-card"><div class="trat-card-heading"><strong>'+esc(a.tipo)+'</strong><span class="trat-badge trat-'+tone+'">'+esc(a.status)+'</span></div>'+
   (a.numero_aditivo?'<p><b>'+esc(a.numero_aditivo)+'</b></p>':'')+
   '<div class="trat-info">'+(a.vigencia_anterior||a.nova_vigencia?'<span>Vigência anterior: '+date(a.vigencia_anterior)+'</span><span>Nova vigência: '+date(a.nova_vigencia)+'</span>':'')+
   '<span>Data: '+date(a.data_aditivo)+'</span></div>'+
   (a.valor_anterior!==null?'<div class="trat-info"><span>Valor anterior: '+money(a.valor_anterior)+'</span>'+
    (a.valor_acrescimo!==null?'<span>Acréscimo: '+money(a.valor_acrescimo)+'</span>':'')+
    (a.valor_supressao!==null?'<span>Supressão: '+money(a.valor_supressao)+'</span>':'')+
    '<span>Novo valor no termo: '+money(a.novo_valor)+'</span></div>':'')+
   (a.protocolo?'<p>Protocolo: '+esc(a.protocolo)+'</p>':'')+
   (a.tratativa_id?'<p class="trat-note">Tratativa relacionada: #'+esc(a.tratativa_id.slice(0,8))+'</p>':'')+
   (a.observacoes?'<p class="trat-text">'+esc(a.observacoes)+'</p>':'')+
   '<div class="trat-actions">'+documentLink(a.link_documento)+'<button class="btn btn-light btn-sm" data-ad-action="edit" data-id="'+esc(a.id)+'">Editar</button><button class="btn btn-light btn-sm" data-ad-action="delete" data-id="'+esc(a.id)+'">Excluir</button></div></article>';
 }
 function details(c) {
  const host=$('conViewAditivos');if(!host||!c)return;
  const b=original(c.id),items=list(c.id).sort((a,b)=>(a.data_aditivo||'').localeCompare(b.data_aditivo||'')||a.created_at.localeCompare(b.created_at));
  host.innerHTML='<div class="trat-section-heading"><h3>ADITIVOS / PRORROGAÇÕES</h3><button class="btn btn-primary btn-sm" data-ad-action="new" data-contract="'+esc(c.id)+'" '+(!ready?'disabled':'')+'>+ NOVO ADITIVO</button></div>'+
   (!ready?'<p class="trat-note" role="status">'+esc(error||'Carregando aditivos…')+'</p><button class="btn btn-light btn-sm" data-ad-action="reload">Atualizar aditivos</button>':'')+
   (ready&&!items.length?'<p class="trat-note">NENHUM ADITIVO OU PRORROGAÇÃO CADASTRADO.</p>':'')+
   (b?'<details class="ad-original"><summary>Vigência e valor originais / histórico</summary><p class="trat-note">Original: '+date(b.data_original)+' → '+date(b.vencimento_original)+' · '+money(b.valor_original)+'</p><p class="trat-note">Atual: '+date(b.vencimento_atual)+' · '+money(b.valor_atual)+'</p><p class="trat-note">Dados originais preservados. Alterações de vigência e valor são feitas por aditivos formalizados.</p><button class="btn btn-light btn-sm" data-ad-action="history" data-contract="'+esc(c.id)+'">Ver histórico completo</button><div id="adHistory" class="trat-history"></div></details>':'')+
   items.map(card).join('')+badges(c);
 }
 const labels={numero_aditivo:'Número do aditivo',data_aditivo:'Data do aditivo',vigencia_anterior:'Vigência anterior',nova_vigencia:'Nova vigência',valor_anterior:'Valor anterior (R$)',valor_acrescimo:'Valor do acréscimo (R$)',valor_supressao:'Valor da supressão (R$)',novo_valor:'Novo valor contratual (R$)',protocolo:'Protocolo / Processo',link_documento:'Link do documento',observacoes:'Observações'};
 function field(k,type,value){return '<label data-ad-field="'+k+'">'+labels[k]+(type==='textarea'?'<textarea name="'+k+'">'+esc(value)+'</textarea>':'<input name="'+k+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'min="0" step="0.01" inputmode="decimal"':'')+'>')+'</label>';}
 function choices(values,selected){return values.map(v=>'<option '+(v===selected?'selected':'')+'>'+esc(v)+'</option>').join('');}
 function open(cId,id=null) {
  if(!ready)return;
  const c=project(contract(cId)),a=id?rows.find(x=>x.id===id):null;if(!c||(id&&!a))return;
  editor={cId:String(c.id),id,version:a?.versao,newId:crypto.randomUUID(),opener:document.activeElement};
  const d=a||{tipo:TYPES[0],status:STATES[0],vigencia_anterior:c.dataFim,valor_anterior:c.valor};
  const linked=treatments.filter(t=>t.contrato_id===String(c.id)&&(!t.excluida||t.id===d.tratativa_id));
  $('adEditor').innerHTML='<form id="adForm"><header><div><h3>'+(id?'EDITAR ADITIVO':'NOVO ADITIVO')+'</h3><p>'+esc(c.orgao)+' · '+esc(c.contrato)+'</p></div><button type="button" class="modal-close" data-ad-action="cancel" aria-label="Fechar">×</button></header><div class="trat-form-body">'+
   '<p class="trat-note">Somente Formalizado altera o vencimento e/ou valor vigente. O original e todas as versões são preservados.</p>'+
   '<div class="trat-form-grid"><label>Tipo *<select name="tipo">'+choices(TYPES,d.tipo)+'</select></label><label>Status *<select name="status">'+choices(STATES,d.status)+'</select></label>'+
   field('numero_aditivo','text',d.numero_aditivo)+field('data_aditivo','date',d.data_aditivo)+
   field('vigencia_anterior','date',d.vigencia_anterior)+field('nova_vigencia','date',d.nova_vigencia)+
   field('valor_anterior','number',d.valor_anterior)+field('valor_acrescimo','number',d.valor_acrescimo)+
   field('valor_supressao','number',d.valor_supressao)+field('novo_valor','number',d.novo_valor)+field('protocolo','text',d.protocolo)+field('link_documento','url',d.link_documento)+'</div>'+
   '<label>Tratativa relacionada (opcional)<select name="tratativa_id"><option value="">Nenhuma</option>'+linked.map(t=>'<option value="'+esc(t.id)+'" '+(t.id===d.tratativa_id?'selected':'')+'>#'+esc(t.id.slice(0,8))+' · '+esc(t.tipo)+' · '+esc(t.situacao)+'</option>').join('')+'</select></label>'+
   field('observacoes','textarea',d.observacoes)+'<p class="trat-note">Alterações financeiras são acumuladas pela diferença entre o novo valor e o anterior. Excluir um termo remove apenas o efeito dele.</p><p id="adError" class="trat-error" role="alert"></p></div><footer><button type="button" class="btn btn-light" data-ad-action="cancel">Cancelar</button><button type="submit" class="btn btn-primary">Salvar aditivo</button></footer></form>';
  const form=$('adForm');form.addEventListener('change',formState);form.addEventListener('input',e=>{if(['valor_anterior','valor_acrescimo','valor_supressao'].includes(e.target.name))calculate();});form.addEventListener('submit',save);
  formState();$('adEditor').showModal();form.elements.tipo.focus();
 }
 function formState(){
  const f=$('adForm');if(!f)return;const type=f.elements.tipo.value,signed=f.elements.status.value==='Formalizado',other=['Alteração contratual','Outro'].includes(type);
  for(const k of ['vigencia_anterior','nova_vigencia','valor_anterior','valor_acrescimo','valor_supressao','novo_valor']) {
   const isDate=k.includes('vigencia');
   const visible=isDate?(type===TYPES[0]||other):k==='valor_acrescimo'?type===TYPES[1]:k==='valor_supressao'?type===TYPES[2]:FINANCIAL.includes(type)||other;
   f.querySelector('[data-ad-field="'+k+'"]').hidden=!visible;f.elements[k].disabled=!visible;
   f.elements[k].required=visible&&signed&&!other;
  }
  f.elements.data_aditivo.required=signed;
  f.elements.novo_valor.readOnly=[TYPES[1],TYPES[2]].includes(type);calculate();
 }
 function calculate(){const f=$('adForm'),type=f.elements.tipo.value;if(![TYPES[1],TYPES[2]].includes(type))return;const prior=f.elements.valor_anterior.value,delta=f.elements[type===TYPES[1]?'valor_acrescimo':'valor_supressao'].value;f.elements.novo_valor.value=prior!==''&&delta!==''?(Number(prior)+(type===TYPES[1]?1:-1)*Number(delta)).toFixed(2):'';}
 function cancel(){if($('adForm')?.dataset.saving)return;$('adEditor').close();editor?.opener?.focus();editor=null;}
 async function write(id,version,data){
  const q=id?'?id=eq.'+encodeURIComponent(id)+'&versao=eq.'+version+'&excluido=eq.false':'';
  const res=await fetch(SUPA_URL+'/rest/v1/'+TABLE+q,{method:id?'PATCH':'POST',headers:supaHeaders({'Prefer':'return=representation'}),body:JSON.stringify(data)});
  if(!res.ok){const err=await res.json().catch(()=>({}));throw Error(err.message||'O banco não confirmou a operação. Tente novamente.');}
  const saved=await res.json();if(!saved.length)throw Error('Este aditivo foi alterado ou excluído. Atualize antes de tentar novamente.');
  return saved[0];
 }
 async function save(ev){
  ev.preventDefault();const f=ev.currentTarget;if(f.dataset.saving)return;
  const data=Object.fromEntries(new FormData(f)),current=editor;
  for(const k of ['data_aditivo','vigencia_anterior','nova_vigencia','tratativa_id'])data[k]=data[k]||null;
  for(const k of ['valor_anterior','valor_acrescimo','valor_supressao','novo_valor'])data[k]=data[k]===undefined||data[k]===''?null:Number(data[k]);
  data.contrato_id=current.cId;if(!current.id)data.id=current.newId;
  if(data.link_documento&&!/^https?:\/\/[^\s]+$/i.test(data.link_documento)){$('adError').textContent='Use um link http:// ou https:// válido.';return;}
  f.dataset.saving='true';f.querySelectorAll('button').forEach(b=>b.disabled=true);$('adError').textContent='';
  try{
   await write(current.id,current.version,data);delete f.dataset.saving;cancel();await load();
   showToast(ready?'Aditivo salvo. Vigência e valor recalculados.':'Aditivo salvo no banco. Atualize para carregar os valores.','success');
  }catch(e){$('adError').textContent=e.message;}finally{delete f.dataset.saving;f.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 async function remove(id,button){
  const a=rows.find(x=>x.id===id);if(!a||button.disabled)return;
  if(!confirm('Tem certeza que deseja excluir este aditivo?'))return;
  button.disabled=true;
  try{await write(id,a.versao,{excluido:true});await load();showToast('Aditivo excluído. Dados recalculados e histórico preservado.','success');}
  catch(e){showToast(e.message,'error');button.disabled=false;}
 }
 function historySnapshot(value){
  if(!value)return '<p class="trat-note">Sem registro anterior.</p>';
  const names={tipo:'Tipo',numero_aditivo:'Número do aditivo',status:'Status',data_aditivo:'Data do aditivo',vigencia_anterior:'Vigência anterior',nova_vigencia:'Nova vigência',valor_anterior:'Valor anterior',valor_acrescimo:'Acréscimo',valor_supressao:'Supressão',novo_valor:'Novo valor',protocolo:'Protocolo / Processo',observacoes:'Observações'};
  return Object.entries(names).filter(([k])=>value[k]!==null&&value[k]!==undefined&&value[k]!=='').map(([k,name])=>'<p class="trat-note trat-text"><b>'+name+':</b> '+esc(['data_aditivo','vigencia_anterior','nova_vigencia'].includes(k)?date(value[k]):['valor_anterior','valor_acrescimo','valor_supressao','novo_valor'].includes(k)?money(value[k]):value[k])+'</p>').join('')+(value.excluido?'<p class="trat-note">Registro excluído da lista.</p>':'')+documentLink(value.link_documento);
 }
 async function history(cId) {
  const host=$('adHistory');if(!host)return;host.textContent='Carregando histórico…';
  try{
   const hist=[];for(let offset=0;;offset+=500){const p=await sbFetch('contrato_aditivos_historico','contrato_id=eq.'+encodeURIComponent(cId)+'&order=criado_em.asc,id.asc&limit=500&offset='+offset);hist.push(...p);if(p.length<500)break;}
   host.innerHTML=hist.map(h=>'<div class="trat-history-entry"><b>'+esc(h.acao)+' · '+esc(new Date(h.criado_em).toLocaleString('pt-BR'))+'</b><p>'+esc(h.depois.numero_aditivo||h.depois.tipo)+' · '+esc(h.depois.status)+'</p><p class="trat-note">'+date(h.depois.vigencia_anterior)+' → '+date(h.depois.nova_vigencia)+' · '+money(h.depois.valor_anterior)+' → '+money(h.depois.novo_valor)+'</p><details><summary>Dados desta versão</summary><b>Antes</b>'+historySnapshot(h.antes)+'<b>Depois</b>'+historySnapshot(h.depois)+'</details></div>').join('')||'Nenhuma alteração registrada.';
  }catch{host.textContent='Não foi possível carregar o histórico. Tente novamente.';}
 }
 document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-ad-action]');if(!b)return;ev.preventDefault();ev.stopPropagation();
  const action=b.dataset.adAction;
  if(action==='new')return open(b.dataset.contract);
  if(action==='cancel')return cancel();
  if(action==='reload')return void load();
  if(action==='history')return void history(b.dataset.contract);
  if(action==='delete')return void remove(b.dataset.id,b);
  const a=rows.find(x=>x.id===b.dataset.id);if(a)open(a.contrato_id,a.id);
 });
 const dialog=document.createElement('dialog');dialog.id='adEditor';dialog.className='trat-dialog';dialog.setAttribute('aria-label','Aditivo / Prorrogação');dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});document.body.append(dialog);
 window.KMAditivos={load,details,project,projectAll,badges,header,expiry};
 load();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
