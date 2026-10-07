/* Authenticated inbox: message content stays in memory and is rendered as text. */
(() => {
  'use strict';
  let messages=[];
  const views=[];
  let auth=null,ready=false,loading=false,errorText='',generation=0;
  const pages=new Map();
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const template=document.createElement('template');
  template.innerHTML=`<article class="inbox-message" role="listitem">
    <div class="inbox-message-top"><span class="inbox-read-state"></span><span class="inbox-sender"></span><time></time></div>
    <h3 class="inbox-subject"></h3><p class="inbox-preview"></p>
    <div class="inbox-message-meta"><span class="trat-badge trat-neutral inbox-company"></span><span class="inbox-link-label"></span></div>
    <div class="inbox-message-actions"><button type="button" class="btn btn-light btn-sm" disabled title="Gmail ainda não conectado">Gmail ↗</button><button type="button" class="btn btn-light btn-sm" disabled title="Vinculação disponível em uma próxima etapa">Vincular à tratativa</button></div>
  </article>`;
  function render(view) {
    const query=normalize(view.search.value);
    const visible=messages.filter(m=>(view.filter==='TODOS'||(view.filter==='NÃO VINCULADOS'?!m.tratativaId:normalize(m.empresa)===normalize(view.filter)))&&normalize([m.remetente,m.assunto,m.preview,m.empresa,m.tratativaTitulo].join(' ')).includes(query));
    view.list.replaceChildren();
    if(!visible.length){
      const empty=document.createElement('div');empty.className='inbox-empty';empty.setAttribute('role','status');
      const heading=document.createElement('strong'),note=document.createElement('p');
      heading.textContent=messages.length?'Nenhuma mensagem encontrada':loading?'Carregando e-mails…':ready?'Nenhuma mensagem nesta caixa':'Entre para ver seus e-mails';
      note.textContent=errorText||(messages.length?'Tente outra pesquisa ou carregue mais mensagens.':ready?'Use Gerenciar contas para sincronizar a caixa de entrada.':'Seu acesso ficará salvo neste navegador até você sair ou a sessão ser encerrada.');
      empty.append(heading,note);view.list.append(empty);return;
    }
    for(const m of visible){
      const item=template.content.firstElementChild.cloneNode(true);
      item.classList.toggle('inbox-unread',!m.lido);
      const text=(selector,value)=>item.querySelector(selector).textContent=value;
      text('.inbox-read-state',m.lido?'○ Lido':'● Não lido');
      text('.inbox-sender',m.remetente||'Remetente não informado');
      text('.inbox-subject',m.assunto||'(Sem assunto)');
      text('.inbox-preview',m.preview||'');
      text('.inbox-company','Para: '+(m.empresa||'Empresa não informada'));
      text('.inbox-link-label',m.tratativaId?'Tratativa: '+(m.tratativaTitulo||m.tratativaId):'Não vinculado a uma tratativa');
      const open=document.createElement('a');open.className='btn btn-light btn-sm';open.textContent='Gmail ↗';open.target='_blank';open.rel='noopener noreferrer';
      open.href=`https://mail.google.com/mail/?authuser=${encodeURIComponent(m.account||'')}#inbox/${encodeURIComponent(m.threadId||m.id||'')}`;
      item.querySelector('.inbox-message-actions button').replaceWith(open);
      const date=new Date(m.dataHora),time=item.querySelector('time');
      if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}else time.textContent='Data não informada';
      view.list.append(item);
    }
  }
  document.querySelectorAll('[data-inbox]').forEach(host=>{
    host.innerHTML=`<div class="trat-panel-header"><div class="trat-panel-title">✉ CAIXA DE ENTRADA (E-MAILS)</div><a class="btn btn-light btn-sm" href="gmail.html">GERENCIAR CONTAS</a></div>
      <div class="inbox-access"><form class="inbox-login"><label>E-mail do sistema<input type="email" name="email" autocomplete="username" value="kricianatalimoreira@gmail.com" required></label><label>Senha do sistema<input type="password" name="password" autocomplete="current-password" required></label><button class="btn btn-light btn-sm" type="submit">ENTRAR E MANTER CONECTADO</button></form><div class="inbox-session" hidden><button type="button" class="btn btn-light btn-sm inbox-reload">ATUALIZAR</button> <button type="button" class="btn btn-light btn-sm inbox-logout">SAIR</button></div><p class="inbox-notice" role="status"></p></div>
      <div class="inbox-tools"><div class="inbox-filters" role="group" aria-label="Filtrar e-mails">${['TODOS','HAMATE','GADITA','NÃO VINCULADOS'].map((name,i)=>`<button type="button" class="btn btn-light btn-sm inbox-filter" aria-pressed="${i===0}" data-filter="${name}">${name}</button>`).join('')}</div>
      <label class="inbox-search-label">Pesquisar e-mails<input type="search" class="inbox-search" placeholder="Remetente, assunto ou conteúdo…" autocomplete="off"></label></div>
      <div class="inbox-list" role="list" aria-label="Mensagens" aria-live="polite"></div><button class="btn btn-light btn-sm inbox-more" type="button" hidden>CARREGAR MAIS MENSAGENS</button>`;
    const view={host,filter:'TODOS',search:host.querySelector('.inbox-search'),list:host.querySelector('.inbox-list')};views.push(view);
    host.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
      view.filter=button.dataset.filter;
      host.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render(view);controls();
    }));
    view.search.addEventListener('input',()=>render(view));render(view);
    host.querySelector('.inbox-login').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{await auth.signIn(form.elements.email.value.trim(),form.elements.password.value);}catch{errorText='Não foi possível entrar. Confira o e-mail e a senha do sistema.';controls();}finally{form.elements.password.value='';button.disabled=false;}};
    host.querySelector('.inbox-logout').onclick=()=>auth.signOut();
    host.querySelector('.inbox-reload').onclick=()=>load(false);
    host.querySelector('.inbox-more').onclick=()=>load(true,view.filter);
  });
  function controls(){for(const v of views){v.host.querySelector('.inbox-login').hidden=!!auth?.has();v.host.querySelector('.inbox-session').hidden=!auth?.has();v.host.querySelector('.inbox-notice').textContent=errorText;v.host.querySelector('.inbox-more').hidden=![...pages].some(([co,p])=>p.more&&(v.filter==='TODOS'||v.filter==='NÃO VINCULADOS'||v.filter===co));v.host.querySelector('.inbox-more').disabled=loading;v.host.querySelector('.inbox-reload').disabled=loading;}}
  async function load(append=false,filter='TODOS'){
    if(!auth?.has())return;
    const version=++generation;loading=true;errorText='';
    if(!append){messages=[];pages.clear();ready=false;}controls();views.forEach(render);
    try{
      const accounts=(await auth.api('list')).accounts;
      for(const a of accounts){
        const page=pages.get(a.company);
        if(append&&(!page?.more||!['TODOS','NÃO VINCULADOS',a.company].includes(filter)))continue;
        const data=await auth.api('messages',a.company,append?page.cursor:{},'gmail-sync');
        if(version!==generation||!auth.has())return;
        const rows=data.messages.slice(0,50),last=rows.at(-1);
        pages.set(a.company,{more:data.messages.length>50,cursor:last?{before_date:last.internal_date,before_id:last.gmail_message_id}:{}});
        for(const m of rows){const value={id:m.gmail_message_id,threadId:m.gmail_thread_id,account:data.email,empresa:a.company,lido:m.is_read,remetente:m.sender,assunto:m.subject,preview:m.preview,dataHora:m.message_date,tratativaId:m.tratativa_id};const index=messages.findIndex(x=>x.id===value.id&&x.empresa===value.empresa);if(index<0)messages.push(value);else messages[index]=value;}
      }
      messages.sort((a,b)=>new Date(b.dataHora)-new Date(a.dataHora));ready=true;
    }catch(e){if(version===generation){errorText=e.message==='not_authorized'?'Seu usuário não tem acesso a estas caixas.':'Não foi possível carregar os e-mails. Entre novamente se a sessão expirou ou clique em Atualizar.';}}
    finally{if(version===generation){loading=false;controls();views.forEach(render);}}
  }
  function boot(){auth=window.KMEmailSession;auth.onChange(active=>{generation++;messages=[];pages.clear();ready=false;loading=false;errorText='';controls();views.forEach(render);if(active)load();});controls();if(auth.has())load();}
  if(window.KMEmailSession)boot();else{const script=document.createElement('script');script.src='email-session.js';script.onload=boot;script.onerror=()=>{errorText='Não foi possível carregar o acesso. Atualize a página.';controls();};document.head.append(script);}
  window.KMCaixaEntrada={setMessages(data){messages=Array.isArray(data)?data:[];views.forEach(render);}};
})();

