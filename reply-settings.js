(() => {
'use strict';
const auth=window.KMEmailSession,el=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let treatments=[],selected=null,version=0,busy=false;
const api=(action,extra={})=>auth.api(action,el('company').value,extra,'gmail-replies');
const notice=t=>el('notice').textContent=t;
const date=t=>t?new Date(t).toLocaleString('pt-BR'):'Ainda não verificada';
const errors={login_required:'Entre em Conexões Gmail com a senha do sistema.',reauthorize:'Reconecte esta empresa em Conexões Gmail.',not_connected:'Reconecte esta empresa em Conexões Gmail.',not_authorized:'Seu acesso não permite consultar esta empresa.',invalid_participants:'Selecione pelo menos um remetente do órgão que apareça nessa conversa.',thread_missing:'A conversa não foi encontrada nesta conta.',link_changed:'O link cadastrado mudou. Confirme novamente a conversa.',rate_limited:'O Google limitou as consultas. Aguarde alguns minutos.'};
const fail=e=>errors[e.message]||'Não foi possível consultar agora. Os alertas não estão atualizados.';
function render(){
 el('treatments').innerHTML=treatments.map(t=>{const w=t.watch,changed=w&&w.source_link!==t.link_gmail,stale=w&&(!w.checked_at||Date.now()-Date.parse(w.checked_at)>15*60000);
 return '<article class="'+(w?.pending?'pending':'')+'"><h3>'+esc(t.orgao)+' · '+esc(t.contrato)+'</h3><p>'+esc(t.tipo)+'</p><strong>'+(w?.pending?'🔴 AGUARDANDO MINHA RESPOSTA':w?.checked_at?'SEM RESPOSTA PENDENTE NA ÚLTIMA VERIFICAÇÃO':'AGUARDANDO CONFIGURAÇÃO / PRIMEIRA VERIFICAÇÃO')+'</strong>'+
 (w?.pending_since?'<p>Desde '+esc(date(w.pending_since))+'</p>':'')+'<p>Última verificação: '+esc(date(w?.checked_at))+'</p>'+
 (changed||w?.last_error||stale?'<p class="error">'+(changed?'Link alterado: confirme a conversa novamente.':'Verificação pendente ou desatualizada.')+'</p>':'')+
 '<button type="button" data-bind="'+esc(t.id)+'">'+(w?'Revisar conversa e remetentes':'Configurar acompanhamento')+'</button></article>';}).join('')||'<p>Nenhuma tratativa aberta nesta empresa.</p>';
}
async function load(){
 const v=++version;if(!auth.has()){treatments=[];el('treatments').replaceChildren();notice(errors.login_required);return;}
 notice('Carregando…');try{const data=await api('list');if(v!==version)return;treatments=data.treatments;render();notice('Somente conversas confirmadas são monitoradas.');}catch(e){if(v===version){treatments=[];el('treatments').replaceChildren();notice(fail(e));}}
}
el('company').onchange=()=>{el('binding').close();selected=null;load();};
el('refresh').onclick=load;
el('check').onclick=async()=>{if(busy)return;busy=true;el('check').disabled=true;try{const r=await api('poll');await load();notice(r.checked+' conversa(s) verificada(s). '+r.failed+' falha(s).'+(r.remaining?' As demais entram nos próximos ciclos.':''));}catch(e){notice(fail(e));}finally{busy=false;el('check').disabled=false;}};
el('treatments').onclick=e=>{const b=e.target.closest('[data-bind]');if(!b)return;selected=treatments.find(t=>t.id===b.dataset.bind);el('binding-title').textContent=selected.orgao+' · '+selected.contrato;el('results').replaceChildren();el('search-notice').textContent='';el('query').value='';el('original').hidden=true;try{const u=new URL(selected.link_gmail);if(u.protocol==='https:'&&u.hostname==='mail.google.com'){el('original').href=u.href;el('original').hidden=false;}}catch{}el('binding').showModal();};
el('close').onclick=()=>el('binding').close();
el('search').onsubmit=async e=>{
 e.preventDefault();if(!selected)return;const id=selected.id,co=el('company').value;e.submitter.disabled=true;el('results').replaceChildren();el('search-notice').textContent='Pesquisando…';
 try{const r=await api('search',{tratativa_id:id,query:el('query').value});if(selected?.id!==id||el('company').value!==co)return;
 el('search-notice').textContent=r.threads.length?'Confira a conversa e marque os remetentes do órgão antes de confirmar.'+(r.has_more?' Há mais resultados: refine a pesquisa.':''):'Nenhuma conversa encontrada.';
 for(const t of r.threads){
  const card=document.createElement('article');card.innerHTML='<h3>'+esc(t.subject||'(Sem assunto)')+'</h3><p>'+esc(date(t.date))+'</p>';
  const link=document.createElement('a');link.textContent='Abrir conversa para conferir ↗';link.href=t.gmail_url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
  for(const sender of t.senders){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=sender;label.append(box,document.createTextNode(' '+sender));card.append(label);}
  const button=document.createElement('button');button.textContent='Confirmar esta conversa e os remetentes selecionados';button.disabled=!t.senders.length;
  button.onclick=async()=>{button.disabled=true;try{await api('bind',{tratativa_id:id,thread_id:t.id,counterparts:[...card.querySelectorAll('input:checked')].map(i=>i.value)});el('binding').close();await api('poll');await load();notice('Conversa confirmada. Acompanhamento automático habilitado para esta tratativa.');}catch(err){el('search-notice').textContent=fail(err);}finally{button.disabled=false;}};
  card.append(button);el('results').append(card);
 }
 }catch(err){el('search-notice').textContent=fail(err);}finally{e.submitter.disabled=false;}
};
auth.onChange(active=>{if(!active){version++;treatments=[];selected=null;el('binding').close();el('results').replaceChildren();el('treatments').replaceChildren();notice(errors.login_required);}});
load();
})();