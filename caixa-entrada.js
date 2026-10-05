/* Interface local: não consulta serviços, conecta contas ou persiste vínculos. */
(() => {
  'use strict';
  let messages=[];
  const views=[];
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
      heading.textContent=messages.length?'Nenhuma mensagem encontrada':'Nenhuma conta conectada';
      note.textContent=messages.length?'Tente outra pesquisa ou altere os filtros.':'Os e-mails aparecerão aqui quando a integração estiver disponível. Gmail ainda não conectado.';
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
      const date=new Date(m.dataHora),time=item.querySelector('time');
      if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}else time.textContent='Data não informada';
      view.list.append(item);
    }
  }
  document.querySelectorAll('[data-inbox]').forEach(host=>{
    host.innerHTML=`<div class="trat-panel-header"><div class="trat-panel-title">✉ CAIXA DE ENTRADA (E-MAILS)</div><a class="btn btn-light btn-sm" href="gmail.html">CONECTAR CONTAS DE E-MAIL</a></div>
      <div class="inbox-tools"><div class="inbox-filters" role="group" aria-label="Filtrar e-mails">${['TODOS','HAMATE','GADITA','NÃO VINCULADOS'].map((name,i)=>`<button type="button" class="btn btn-light btn-sm inbox-filter" aria-pressed="${i===0}" data-filter="${name}">${name}</button>`).join('')}</div>
      <label class="inbox-search-label">Pesquisar e-mails<input type="search" class="inbox-search" placeholder="Remetente, assunto ou conteúdo…" autocomplete="off"></label></div>
      <div class="inbox-list" role="list" aria-label="Mensagens" aria-live="polite"></div>`;
    const view={host,filter:'TODOS',search:host.querySelector('input'),list:host.querySelector('.inbox-list')};views.push(view);
    host.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
      view.filter=button.dataset.filter;
      host.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render(view);
    }));
    view.search.addEventListener('input',()=>render(view));render(view);
  });
  // Ponto de entrada para o futuro provedor de dados. Nenhum provedor é chamado nesta etapa.
  // Modelo: {lido, remetente, assunto, preview, dataHora, empresa, tratativaId, tratativaTitulo}.
  window.KMCaixaEntrada={setMessages(data){messages=Array.isArray(data)?data:[];views.forEach(render);}};
})();

