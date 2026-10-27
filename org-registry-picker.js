/* New records choose an existing master. Editing historic records keeps their original name. */
(()=>{
 'use strict';
 const fields={con:{name:'conOrgao',uf:'conUF'},disputa:{name:'disputaOrgao',uf:'disputaUF'}},states=new Map();
 function ensure(key){
  if(states.has(key))return states.get(key);
  const ids=fields[key],input=document.getElementById(ids.name),uf=document.getElementById(ids.uf);
  const select=document.createElement('select');select.id=ids.name+'Cadastrado';select.className=input.className;select.setAttribute('aria-label','Órgão cadastrado');
  const help=document.createElement('small');help.id=ids.name+'Ajuda';help.style.cssText='display:block;font-size:10px;line-height:1.5;margin-top:5px;color:var(--muted)';select.setAttribute('aria-describedby',help.id);
  const reload=document.createElement('button');reload.type='button';reload.textContent='Atualizar órgãos';reload.className='btn btn-light btn-sm';reload.style.marginTop='5px';reload.onclick=()=>window.KMOrgaos.refresh();
  input.insertAdjacentElement('afterend',select);select.after(help,reload);
  const s={input,uf,select,help,reload,active:false,initial:'',display:input.style.display};states.set(key,s);
  select.addEventListener('change',()=>apply(s));return s;
 }
 function apply(s){
  const org=(window.KMOrgaos.options()||[]).find(o=>o.id===s.select.value);
  s.input.value=org?.nome||'';s.uf.value=org?.uf||'';
  s.input.dispatchEvent(new Event('change',{bubbles:true}));s.uf.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function render(s){
  if(!s.active)return;
  const list=window.KMOrgaos.options(),id=s.select.value;
  s.select.replaceChildren(new Option(list===null?'Entre no cadastro de órgãos para carregar':list.length?'Selecione um órgão cadastrado':'Nenhum órgão cadastrado',''));
  if(list)for(const o of list)s.select.add(new Option(o.nome+(o.cnpj?' · '+o.cnpj:''),o.id));
  if(list?.some(o=>o.id===id))s.select.value=id;
  else if(s.initial){const matches=(list||[]).filter(o=>o.nome.trim().toUpperCase()===s.initial.trim().toUpperCase());if(matches.length===1)s.select.value=matches[0].id;}
  if(list!==null)s.initial='';
  s.select.disabled=!list?.length;
  s.help.textContent=list===null?'Entre em Contratos → Órgãos públicos com seu acesso do sistema e depois atualize a lista.':'Não encontrou? Cadastre primeiro em Contratos → Órgãos públicos.';
  apply(s);
 }
 function start(key,isNew=true){
  const s=ensure(key);s.active=isNew;s.input.style.display=isNew?'none':s.display;s.select.hidden=s.help.hidden=s.reload.hidden=!isNew;for(const el of [s.select,s.help,s.reload])el.style.display=isNew?'':'none';s.uf.disabled=isNew;
  if(isNew){s.initial=s.input.value;s.select.value='';render(s);if(window.KMOrgaos.options()===null&&window.KMEmailSession.has())window.KMOrgaos.refresh();}
 }
 function validate(key){
  const s=states.get(key);if(!s?.active)return true;
  const o=(window.KMOrgaos.options()||[]).find(o=>o.id===s.select.value);
  if(!o){showToast('Selecione um órgão já cadastrado. Se necessário, cadastre-o em Órgãos públicos.','error');s.select.focus();return false;}
  apply(s);return true;
 }
 document.addEventListener('km-org-registry-change',()=>states.forEach(render));
 window.KMOrgPicker={start,validate};
})();

