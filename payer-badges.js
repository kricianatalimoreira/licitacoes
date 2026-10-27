(function(root){
  'use strict';
  const UFS=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
  const norm=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').toLocaleUpperCase('pt-BR');
  function day(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const [y,m,d]=v.split('-').map(Number),t=Date.UTC(y,m-1,d);return new Date(t).toISOString().slice(0,10)===v?t/86400000:null;}
  function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());}
  function identity(e,contracts=[]){
    const registered=root.KMOrgaos?.identity(e);if(registered)return registered;
    const name=norm(e.orgao),company=norm(e.empresa);if(!name||!company)return null;
    const stated=[...name.matchAll(/\/([A-Z]{2})(?=$|[\s(])/g)].map(m=>m[1]).filter(uf=>UFS.has(uf));
    const related=contracts.filter(c=>c.id===e.contratoId&&norm(c.empresa)===company&&norm(c.orgao)===name);
    const states=new Set([...stated,...related.map(c=>norm(c.uf)).filter(uf=>UFS.has(uf))]);
    if(states.size!==1)return null;
    return JSON.stringify([company,name,[...states][0]]);
  }
  function build(entries,contracts=[],asOf=today()){
    const now=day(asOf);if(now===null)throw Error('Data de referência inválida');
    const groups=new Map(),seen=new Set();
    for(const e of entries){
      if(norm(e.status)!=='PAGA')continue;
      const k=identity(e,contracts),a=day(e.dataEntrega),b=day(e.dataPagamento);
      if(!k||a===null||b===null||b<a||b>now)continue;
      if(e.id&&seen.has(e.id))continue;if(e.id)seen.add(e.id);
      if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b-a);
    }
    return {get(e){
      const values=groups.get(identity(e,contracts))||[],n=values.length;
      const mean=n?values.reduce((a,b)=>a+b,0)/n:null;
      const label=n<3?'Sem histórico suficiente':mean<=15?'Pagador rápido':mean<=30?'Pagador regular':mean<=60?'Pagador lento':'Pagador crítico';
      return {label,n,mean,min:n?Math.min(...values):null,max:n?Math.max(...values):null};
    }};
  }
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=build([]),closePopup=()=>{};
  function prepare(entries,contracts){closePopup();current=build(entries,contracts);}
  function html(e){const s=current.get(e);if(s.n<3)return '';return `<button type="button" class="payer-classification" aria-haspopup="true" aria-expanded="false" aria-controls="payer-stats-popover" data-payer-stats="${esc(JSON.stringify({n:s.n,mean:s.mean,min:s.min,max:s.max}))}">${s.label}</button>`;}
  function mount(){
    if(document.getElementById('payer-stats-popover'))return;
    const popup=document.createElement('div');popup.id='payer-stats-popover';popup.setAttribute('role','tooltip');popup.hidden=true;document.body.append(popup);
    let active=null,pinned=false;
    const format=v=>v===null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+' dias';
    function hide(){if(active)active.setAttribute('aria-expanded','false');active=null;pinned=false;popup.hidden=true;}
    closePopup=hide;
    function show(button){
      if(active!==button&&active)active.setAttribute('aria-expanded','false');
      active=button;const s=JSON.parse(button.dataset.payerStats);
      popup.innerHTML=`<div>Prazo médio: <strong>${format(s.mean)}</strong></div><div>Pagamentos utilizados: <strong>${s.n}</strong></div><div>Menor prazo: <strong>${format(s.min)}</strong></div><div>Maior prazo: <strong>${format(s.max)}</strong></div>`;
      popup.hidden=false;button.setAttribute('aria-expanded','true');
      const r=button.getBoundingClientRect(),h=popup.offsetHeight,w=popup.offsetWidth;
      popup.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
      popup.style.top=Math.max(8,r.bottom+h+8>innerHeight?r.top-h-6:r.bottom+6)+'px';
    }
    document.addEventListener('pointerover',ev=>{const b=ev.target.closest?.('.payer-classification');if(b&&!pinned)show(b);});
    document.addEventListener('pointerout',ev=>{if(!pinned&&(ev.target.closest?.('.payer-classification')||popup.contains(ev.target))&&!ev.relatedTarget?.closest?.('.payer-classification,#payer-stats-popover'))hide();});
    document.addEventListener('focusin',ev=>{const b=ev.target.closest?.('.payer-classification');if(b&&!pinned)show(b);});
    document.addEventListener('focusout',ev=>{if(!pinned&&ev.target.closest?.('.payer-classification'))hide();});
    document.addEventListener('click',ev=>{const b=ev.target.closest?.('.payer-classification');if(b){ev.stopPropagation();if(pinned&&active===b)hide();else{show(b);pinned=true;}}else if(!popup.contains(ev.target))hide();});
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')hide();});
    addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
  }
  const api={identity,build,prepare,html,mount};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KMPayerBadges=api;
})(typeof window==='object'?window:globalThis);

