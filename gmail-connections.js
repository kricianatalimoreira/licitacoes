(() => {
'use strict';
const auth=window.KMEmailSession,el=id=>document.getElementById(id);
let epoch=0;
const notice=t=>{el('notice').textContent=t;};
const errors={login_required:'Entre com sua senha do sistema.',login_failed:'Não foi possível entrar. Confira seu e-mail e a senha do sistema.',not_authorized:'Este usuário não tem acesso a estas contas.',reauthorize:'A autorização expirou. Clique em Reconectar na empresa correspondente.',not_connected:'Conecte esta empresa para continuar.',account_mismatch:'Selecione o endereço Gmail indicado para esta empresa.',storage_unavailable:'Conexão temporariamente indisponível. Tente novamente.',google_unavailable:'O Google está indisponível. Tente novamente.'};
const fail=e=>notice(errors[e.message]||'Não foi possível concluir. Tente novamente.');
function render(accounts){
 el('accounts').replaceChildren();
 for(const a of accounts){
  const card=document.createElement('article');card.className='account';
  const title=document.createElement('h3');title.textContent=a.company;
  const email=document.createElement('p');email.textContent=a.email;
  const state=document.createElement('p');state.className='status';state.textContent=({connected:'Autorização cadastrada — verifique a conexão',reconnect_required:'Reconexão necessária',disconnected:'Não conectada'})[a.status]||'Indisponível';
  const checked=document.createElement('p');checked.className='muted';checked.textContent=a.last_checked_at?'Última verificação: '+new Date(a.last_checked_at).toLocaleString('pt-BR'):'Ainda não verificada';
  const connect=document.createElement('button');connect.type='button';connect.textContent=(a.status==='disconnected'?'Conectar ':'Reconectar ')+a.company;
  connect.onclick=async()=>{connect.disabled=true;try{const data=await auth.api('connect',a.company);const u=new URL(data.authorization_url);if(u.origin!=='https://accounts.google.com'||u.pathname!=='/o/oauth2/v2/auth')throw new Error('invalid_url');location.assign(u.href);}catch(e){fail(e);connect.disabled=false;}};
  card.append(title,email,state,checked,connect);
  if(a.status==='connected'){
   const button=document.createElement('button');button.type='button';button.textContent='Verificar conexão '+a.company;
   button.onclick=async()=>{button.disabled=true;notice('Verificando '+a.company+'…');try{await auth.api('check',a.company);await load();notice(a.company+': conexão verificada com o Google.');}catch(e){await load().catch(()=>{});fail(e);}finally{button.disabled=false;}};
   card.append(button);
  }
  el('accounts').append(card);
 }
}
async function load(){const version=epoch;const data=await auth.api('list');if(version!==epoch)return;render(data.accounts);el('login').hidden=true;el('connections').hidden=false;}
function hide(){epoch++;el('connections').hidden=true;el('login').hidden=false;el('accounts').replaceChildren();}
el('login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await auth.signIn(el('email').value.trim(),el('password').value);await load();notice('Verifique a conexão de cada empresa.');}catch(err){fail(err);}finally{el('password').value='';e.submitter.disabled=false;}};
el('logout').onclick=async()=>{hide();await auth.signOut();notice('Você saiu.');};
auth.onChange(active=>{if(!active)hide();});
const result=new URLSearchParams(location.search).get('oauth');
if(result){history.replaceState(null,'',location.pathname);notice(result==='connected'?'Autorização concluída. Verifique a conexão da empresa.':'A autorização não foi concluída. Entre e tente conectar novamente.');}
if(auth.has())load().catch(e=>{hide();fail(e);});
})();