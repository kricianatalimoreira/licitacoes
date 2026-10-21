(() => {
'use strict';
const auth=window.KMEmailSession;let data=new Map(),busy=false,generation=0;
window.KMReplyAlerts={get:id=>data.get(id)};
function publish(){window.dispatchEvent(new Event('km-replies-changed'));}
function banner(text){
 for(const id of ['dashTratativasList','tratTodasLista']){
  const host=document.getElementById(id);if(!host)continue;
  let b=document.getElementById(id+'ReplyNotice');if(!b){b=document.createElement('div');b.id=id+'ReplyNotice';b.className='reply-notice';host.before(b);}
  b.replaceChildren(document.createTextNode(text+' '));const link=document.createElement('a');link.href=auth.has()?'respostas.html':'gmail.html';link.textContent=auth.has()?'CONFIGURAR ACOMPANHAMENTO →':'ENTRAR PARA VER OS ALERTAS →';b.append(link);
  b.classList.toggle('reply-pending',[...data.values()].some(w=>w.pending));
 }
}
async function load(){
 if(busy)return;
 if(!auth.has()){data.clear();banner('ALERTAS DE E-MAIL: ACESSO PROTEGIDO.');publish();return;}
 busy=true;const v=generation;
 try{
  const results=await Promise.all(['HAMATE','GADITA'].map(company=>auth.api('list',company,{},'gmail-replies')));
  if(v!==generation)return;
  data=new Map();let unconfigured=0,stale=0;
  for(const r of results)for(const t of r.treatments){
   if(!t.watch){unconfigured++;continue;}
   const w=t.watch;w.stale=!!w.last_error||w.source_link!==t.link_gmail||!w.checked_at||Date.now()-Date.parse(w.checked_at)>15*60000;
   if(w.stale)stale++;data.set(t.id,w);
  }
  const count=[...data.values()].filter(w=>w.pending).length;
  banner((count?'🔔 '+count+' TRATATIVA(S) AGUARDANDO MINHA RESPOSTA.':'NENHUMA RESPOSTA PENDENTE NAS CONVERSAS VERIFICADAS.')+(unconfigured?' '+unconfigured+' SEM ACOMPANHAMENTO.':'')+(stale?' '+stale+' VERIFICAÇÃO(ÕES) DESATUALIZADA(S).':''));
  publish();
 }catch{if(v===generation)banner('NÃO FOI POSSÍVEL ATUALIZAR OS ALERTAS. CONFIRA A CONEXÃO.');}finally{busy=false;}
}
auth.onChange(()=>{generation++;data.clear();publish();load();});
setInterval(load,60000);load();
})();