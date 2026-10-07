(() => {
 'use strict';
 const base='https://inaunswiwxfonhhdznkh.supabase.co';
 const key='sb_publishable_65qYNb-AKxd6UksFJRD5GQ_ZRLTsug2';
 const auth=window.KMEmailSession;
 let session=null,syncing=false,stopSync=false,messageCursor=null,viewRevision=0;
 const el=id=>document.getElementById(id),notice=text=>{el('notice').textContent=text;};
 const errors={login_required:'Sua sessão expirou. Entre novamente.',not_authorized:'Sua conta não tem permissão para administrar estas conexões.',account_mismatch:'A conta escolhida não corresponde ao e-mail desta empresa. Tente novamente com a conta indicada.',reauthorize:'A autorização expirou ou foi revogada. Conecte a empresa novamente.',not_connected:'Esta empresa ainda não está conectada.',superseded:'Uma conexão mais recente foi iniciada. Atualize a página.',storage_unavailable:'Não foi possível acessar o armazenamento. Tente novamente.',google_unavailable:'Não foi possível consultar o Google agora. Tente novamente.'};
 function showError(error){notice(errors[error.message]||'Não foi possível concluir. Confira seus dados de acesso ou tente novamente.');}
 async function api(action,company,extra={},endpoint='gmail-accounts'){
   return auth.api(action,company,extra,endpoint);
 }
 function logout(){session=null;stopSync=true;viewRevision++;el('connections').hidden=true;el('login').hidden=false;el('accounts').replaceChildren();el('message-list').replaceChildren();}
 Object.assign(errors,{sync_busy:'Esta caixa já está sincronizando. Aguarde um pouco e tente novamente.',stale_sync:'O lote expirou. Clique em sincronizar para retomar.',rate_limited:'O Google limitou as consultas. Aguarde alguns minutos e retome a sincronização.',sync_failed:'A sincronização foi interrompida. O progresso foi salvo; clique em sincronizar para retomar.'});
 async function loadMessages(append=false){
  const revision=++viewRevision,co=el('inbox-company').value;
  if(!append){messageCursor=null;el('message-list').replaceChildren();el('more-messages').hidden=true;}
  el('more-messages').disabled=true;
  try{
   const data=await api('messages',co,append&&messageCursor?messageCursor:{},'gmail-sync');
   if(revision!==viewRevision||!session)return;
   const rows=data.messages.slice(0,50);
   el('inbox-summary').textContent=`${co} · ${data.total} mensagens importadas (exceto spam e lixeira)${data.in_progress?' · Importação em andamento':''}`;
   if(!rows.length&&!append){const p=document.createElement('p');p.textContent='Nenhuma mensagem importada nesta caixa. Clique em Sincronizar.';el('message-list').append(p);}
   for(const m of rows){
    const article=document.createElement('article');article.className='mail-message';article.setAttribute('role','listitem');
    const state=document.createElement('span');state.className='muted';state.textContent=m.is_read?'LIDO':'NÃO LIDO';
    const subject=document.createElement('h3');subject.textContent=m.subject||'(Sem assunto)';
    const sender=document.createElement('p');sender.textContent=m.sender||'Remetente não informado';
    const preview=document.createElement('p');preview.textContent=m.preview||'';
    const info=document.createElement('p');info.className='muted';info.textContent=`${new Date(m.message_date).toLocaleString('pt-BR')} · ${co} · ${m.contract_id?'Contrato vinculado':'Sem contrato vinculado'}`;
    const recipients=document.createElement('p');recipients.className='muted';recipients.textContent='Para: '+(m.recipients||[]).join('; ');
    const open=document.createElement('a');open.textContent='Abrir no Gmail ↗';open.target='_blank';open.rel='noopener noreferrer';
    open.href=`https://mail.google.com/mail/?authuser=${encodeURIComponent(data.email)}#all/${encodeURIComponent(m.gmail_thread_id||m.gmail_message_id)}`;
    const link=document.createElement('a');link.textContent=m.contract_id?'VER VÍNCULO':'VINCULAR AO CONTRATO';link.href=`vinculos.html?empresa=${encodeURIComponent(co)}&mensagem=${encodeURIComponent(m.gmail_message_id)}`;article.append(state,subject,sender,recipients,preview,info,open,document.createTextNode(' · '),link);el('message-list').append(article);
   }
   const last=rows.at(-1);messageCursor=last?{before_date:last.internal_date,before_id:last.gmail_message_id}:null;
   el('more-messages').hidden=data.messages.length<=50;
  }catch(error){if(revision===viewRevision)showError(error);}finally{el('more-messages').disabled=false;}
 }
 async function synchronize(co){
  if(syncing)return;syncing=true;stopSync=false;el('stop-sync').hidden=false;
  document.querySelectorAll('[data-sync]').forEach(b=>b.disabled=true);
  let processed=0,complete=false;
  try{
   do{
    el('sync-progress').textContent=`Sincronizando ${co}… ${processed} mensagens verificadas. Você pode pausar após o lote atual.`;
    const result=await api('sync',co,{},'gmail-sync');processed+=result.processed||0;complete=result.done;
   }while(!complete&&!stopSync&&session);
   if(session){el('sync-progress').textContent=complete?`${co}: sincronização concluída.`:`${co}: sincronização pausada. O próximo clique retoma o progresso.`;render((await api('list')).accounts);if(el('inbox-company').value===co)await loadMessages();}
  }catch(error){el('sync-progress').textContent=`${co}: sincronização interrompida. O progresso confirmado foi preservado.`;showError(error);}
  finally{syncing=false;el('stop-sync').hidden=true;document.querySelectorAll('[data-sync]').forEach(b=>b.disabled=false);}
 }
 el('inbox-company').onchange=()=>loadMessages();
 el('more-messages').onclick=()=>loadMessages(true);
 el('stop-sync').onclick=()=>{stopSync=true;el('stop-sync').hidden=true;};
 function render(accounts){
   el('accounts').replaceChildren();
   const statuses={connected:'Conectada',disconnected:'Não conectada',reconnect_required:'Reconexão necessária'};
   for(const account of accounts){
    const card=document.createElement('article');card.className='account';
    const title=document.createElement('h3');title.textContent=account.company;
    const email=document.createElement('p');email.textContent=account.email;
    const status=document.createElement('p');status.className='status';status.textContent=statuses[account.status]||'Indisponível';status.classList.toggle('connected',account.status==='connected');
    const checked=document.createElement('p');checked.className='muted';checked.textContent=account.last_checked_at?`Última verificação: ${new Date(account.last_checked_at).toLocaleString('pt-BR')}`:'Ainda não verificada';
    const sync=document.createElement('p');sync.className='muted';sync.textContent=account.last_synced_at?`Última sincronização: ${new Date(account.last_synced_at).toLocaleString('pt-BR')}`:'Mensagens ainda não sincronizadas';
    const connect=document.createElement('button');connect.textContent=account.status==='disconnected'?`Conectar ${account.company}`:`Reconectar ${account.company}`;
    connect.onclick=async()=>{connect.disabled=true;try{const data=await api('connect',account.company);const url=new URL(data.authorization_url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw new Error('invalid_url');location.assign(url.href);}catch(error){showError(error);connect.disabled=false;}};
    card.append(title,email,status,checked,sync,connect);
    if(account.status==='connected'){
      const check=document.createElement('button');check.textContent='Verificar conexão';
      check.onclick=async()=>{check.disabled=true;try{const data=await api('check',account.company);render(data.accounts);notice('Conexão verificada. Nenhuma mensagem foi importada.');}catch(error){showError(error);check.disabled=false;}};
      const syncButton=document.createElement('button');syncButton.textContent=`Sincronizar ${account.company}`;syncButton.dataset.sync=account.company;syncButton.disabled=syncing;syncButton.onclick=()=>synchronize(account.company);
      card.append(check,syncButton);
    }
    el('accounts').append(card);
   }
 }
 el('login-form').onsubmit=async event=>{
   event.preventDefault();const button=event.submitter;button.disabled=true;notice('Entrando…');
   try{
    await auth.signIn(el('email').value.trim(),el('password').value);
    el('password').value='';session=true;
    const result=await api('list');render(result.accounts);el('login').hidden=true;el('connections').hidden=false;notice('Selecione a empresa para sincronizar ou consultar as mensagens.');await loadMessages();
   }catch(error){session=null;showError(error);}finally{button.disabled=false;el('password').value='';}
 };
 el('logout').onclick=async()=>{logout();await auth.signOut();notice('Você saiu do acesso administrativo.');};
 async function restore(){try{session=true;const result=await api('list');render(result.accounts);el('login').hidden=true;el('connections').hidden=false;await loadMessages();}catch(error){logout();showError(error);}}
 auth.onChange(active=>{if(!active)logout();});
 if(auth.has())restore();
 const code=new URLSearchParams(location.search).get('oauth');
 if(code){history.replaceState(null,'',location.pathname);const messages={connected:'Conta conectada com sucesso. Entre novamente para conferir o status.',consent_denied:'Autorização cancelada. Nenhuma conexão foi alterada.',missing_scope:'A permissão de leitura do Gmail não foi concedida.',missing_refresh_token:'O Google não forneceu autorização contínua. Tente conectar novamente.',expired_state:'A solicitação expirou. Entre e inicie uma nova conexão.',invalid_state:'A solicitação é inválida ou já foi utilizada.'};notice(messages[code]||errors[code]||'Não foi possível concluir a conexão. Entre e tente novamente.');}
})();
