(() => {
 'use strict';
 const auth=window.KMEmailSession,$=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 let co=params.get('empresa')||'GADITA',messageId=params.get('mensagem'),contracts=[],message=null,revision=0,pending=null;
 const api=(action,data={})=>auth.api(action,co,data,'gmail-contracts');
 const notice=t=>{$('notice').textContent=t;};
 function error(e){notice(({not_authorized:'Acesso não autorizado.',confirmation_required:'Confirme o vínculo antes de salvar.',already_linked:'Este e-mail já está vinculado. Atualize para conferir.',message_unavailable:'E-mail indisponível ou movido para spam/lixeira.',contract_unavailable:'Contrato indisponível nesta empresa.',login_required:'Entre novamente no sistema.'})[e.message]||'Não foi possível concluir. Tente atualizar.');}
 const name=c=>`${c.orgao||'Órgão não informado'} · ${c.contrato||'Sem número'} · ${c.situacao}`;
 function choices(){const q=$('contract-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();$('contract-choice').replaceChildren();for(const c of contracts){if(![c.orgao,c.contrato,c.processo].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q))continue;const option=document.createElement('option');option.value=c.id;option.textContent=name(c);$('contract-choice').append(option);}$('manual-link').disabled=!$('contract-choice').value;}
 function review(id,c,subject){pending={company:co,message_id:id,contract_id:c.id};$('confirm-message').textContent=`${co} · ${subject||'(Sem assunto)'}`;$('confirm-contract').textContent=name(c);$('confirm').showModal();}
 async function load(){
  const rev=++revision;$('refresh').disabled=true;notice('Carregando…');$('suggestions').replaceChildren();$('manual').hidden=true;
  try{
   const [catalog,data]=await Promise.all([api('contracts'),api('suggestions',messageId?{message_id:messageId}:{})]);
   if(rev!==revision||!auth.has())return;contracts=catalog.contracts;
   $('robot-status').textContent=`${data.robot_enabled?'ROBÔ ATIVO':'ROBÔ PAUSADO'} · ${data.sync?.phase==='full'?'IMPORTANDO HISTÓRICO AOS POUCOS':data.sync?.phase==='history'?'ATUALIZANDO MENSAGENS':'HISTÓRICO ATUALIZADO'}${data.sync?.last_error?' · VERIFIQUE A CONEXÃO EM GERENCIAR CONTAS':''}`;
   if(messageId){const detail=await api('message',{message_id:messageId});if(rev!==revision||!auth.has())return;message=detail.message;$('manual').hidden=false;$('message-text').textContent=`${message.sender||''} · ${message.subject||'(Sem assunto)'} · ${message.preview||''}`;const linked=contracts.find(c=>c.id===detail.link?.contract_id);$('current-link').textContent=detail.link?'VINCULADO: '+(linked?name(linked):detail.link.contract_id):'SEM CONTRATO VINCULADO';$('unlink').hidden=!detail.link;choices();$('manual-link').hidden=!!detail.link;}
   for(const s of data.suggestions){
    const card=document.createElement('article');card.className='suggestion';card.setAttribute('role','listitem');
    const title=document.createElement('h3');title.textContent=s.subject||'(Sem assunto)';
    const sender=document.createElement('p');sender.textContent=`${co} · ${s.sender||''} · ${new Date(s.message_date).toLocaleDateString('pt-BR')}`;
    const preview=document.createElement('p');preview.textContent=s.preview||'';
    const contract=document.createElement('p');contract.textContent=name(s);
    const reason=document.createElement('p');reason.className='reason';reason.textContent=s.reason;
    const actions=document.createElement('div');actions.className='actions';
    const yes=document.createElement('button');yes.textContent='REVISAR E VINCULAR';yes.onclick=()=>review(s.gmail_message_id,{...s,id:s.contract_id},s.subject);
    const no=document.createElement('button');no.textContent='IGNORAR ESTA SUGESTÃO';no.onclick=async()=>{no.disabled=true;try{await api('reject',{message_id:s.gmail_message_id,contract_id:s.contract_id});await load();notice('Sugestão ignorada. Ela não será apresentada novamente.');}catch(e){error(e);no.disabled=false;}};
    const other=document.createElement('a');other.textContent='ESCOLHER OUTRO CONTRATO';other.href=`vinculos.html?empresa=${encodeURIComponent(co)}&mensagem=${encodeURIComponent(s.gmail_message_id)}`;
    actions.append(yes,no,other);card.append(title,sender,preview,contract,reason,actions);$('suggestions').append(card);
   }
   if(!data.suggestions.length){const p=document.createElement('p');p.textContent='Nenhuma sugestão pendente. O robô continuará buscando. Você também pode escolher um contrato pelo botão Vincular ao contrato em cada e-mail.';$('suggestions').append(p);}
   $('limit-note').textContent=data.suggestions.length===100?'Mostrando até 100 sugestões. Após decidir, atualize para ver as próximas.':'';notice('');
  }catch(e){if(rev===revision)error(e);}finally{if(rev===revision)$('refresh').disabled=false;}
 }
 async function start(){try{const result=await auth.api('list');if(!auth.has())return;$('company').replaceChildren();for(const a of result.accounts){const o=document.createElement('option');o.value=a.company;o.textContent=a.company;$('company').append(o);}if(!result.accounts.some(a=>a.company===co)){co=result.accounts[0]?.company;messageId=null;}if(!co)throw new Error('not_authorized');$('company').value=co;$('login').hidden=true;$('review').hidden=false;await load();}catch(e){error(e);}}
 $('login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await auth.signIn($('email').value.trim(),$('password').value);await start();}catch(e){error(e);}finally{$('password').value='';b.disabled=false;}};
 $('company').onchange=()=>{co=$('company').value;messageId=null;history.replaceState(null,'','vinculos.html');load();};
 $('contract-search').oninput=choices;$('refresh').onclick=load;
 $('manual-link').onclick=()=>{const c=contracts.find(c=>c.id===$('contract-choice').value);if(c&&message)review(messageId,c,message.subject);};
 $('confirm-no').onclick=()=>{$('confirm').close();pending=null;};
 $('confirm-yes').onclick=async()=>{if(!pending||pending.company!==co)return;const value=pending;$('confirm-yes').disabled=true;try{await api('link',{message_id:value.message_id,contract_id:value.contract_id,confirmed:true});$('confirm').close();pending=null;await load();notice('Vínculo confirmado e registrado.');}catch(e){error(e);$('confirm').close();}finally{$('confirm-yes').disabled=false;}};
 $('unlink').onclick=async()=>{if(!confirm('Desvincular este e-mail do contrato?'))return;try{await api('unlink',{message_id:messageId});await load();notice('E-mail desvinculado.');}catch(e){error(e);}};
 $('logout').onclick=()=>auth.signOut();auth.onChange(active=>{if(!active){revision++;contracts=[];message=null;pending=null;$('confirm').close();$('suggestions').replaceChildren();$('message-text').textContent='';$('review').hidden=true;$('login').hidden=false;}});
 if(auth.has())start();
})();
