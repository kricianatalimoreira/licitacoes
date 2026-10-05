(() => {
 'use strict';
 const base='https://inaunswiwxfonhhdznkh.supabase.co';
 const key='sb_publishable_65qYNb-AKxd6UksFJRD5GQ_ZRLTsug2';
 // Only the short-lived SITE session is kept in memory. Never Google credentials.
 let session=null;
 const el=id=>document.getElementById(id),notice=text=>{el('notice').textContent=text;};
 const errors={login_required:'Sua sessão expirou. Entre novamente.',not_authorized:'Sua conta não tem permissão para administrar estas conexões.',account_mismatch:'A conta escolhida não corresponde ao e-mail desta empresa. Tente novamente com a conta indicada.',reauthorize:'A autorização expirou ou foi revogada. Conecte a empresa novamente.',not_connected:'Esta empresa ainda não está conectada.',superseded:'Uma conexão mais recente foi iniciada. Atualize a página.',storage_unavailable:'Não foi possível acessar o armazenamento. Tente novamente.',google_unavailable:'Não foi possível consultar o Google agora. Tente novamente.'};
 function showError(error){notice(errors[error.message]||'Não foi possível concluir. Confira seus dados de acesso ou tente novamente.');}
 async function api(action,company){
   if(!session)throw new Error('login_required');
   const res=await fetch(`${base}/functions/v1/gmail-accounts`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session}`,'Content-Type':'application/json'},body:JSON.stringify({action,company})});
   const data=await res.json();
   if(!res.ok){if(res.status===401)logout();throw new Error(data.error);}
   return data;
 }
 function logout(){session=null;el('connections').hidden=true;el('login').hidden=false;el('accounts').replaceChildren();}
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
      card.append(check);
    }
    el('accounts').append(card);
   }
 }
 el('login-form').onsubmit=async event=>{
   event.preventDefault();const button=event.submitter;button.disabled=true;notice('Entrando…');
   try{
    const response=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:el('email').value.trim(),password:el('password').value})});
    el('password').value='';if(!response.ok)throw new Error('login_failed');const data=await response.json();session=data.access_token;
    const result=await api('list');render(result.accounts);el('login').hidden=true;el('connections').hidden=false;notice('Selecione a empresa que deseja conectar.');
   }catch(error){session=null;showError(error);}finally{button.disabled=false;el('password').value='';}
 };
 el('logout').onclick=async()=>{const token=session;logout();if(token)await fetch(`${base}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`}}).catch(()=>{});notice('Você saiu do acesso administrativo.');};
 const code=new URLSearchParams(location.search).get('oauth');
 if(code){history.replaceState(null,'',location.pathname);const messages={connected:'Conta conectada com sucesso. Entre novamente para conferir o status.',consent_denied:'Autorização cancelada. Nenhuma conexão foi alterada.',missing_scope:'A permissão de leitura do Gmail não foi concedida.',missing_refresh_token:'O Google não forneceu autorização contínua. Tente conectar novamente.',expired_state:'A solicitação expirou. Entre e inicie uma nova conexão.',invalid_state:'A solicitação é inválida ou já foi utilizada.'};notice(messages[code]||errors[code]||'Não foi possível concluir a conexão. Entre e tente novamente.');}
})();
