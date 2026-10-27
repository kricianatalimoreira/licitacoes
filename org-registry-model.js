(function(root){
 'use strict';
 const norm=v=>String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').toLocaleUpperCase('pt-BR');
 const states='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
 const types=['Prefeitura','Câmara','Fundo','Secretaria','Autarquia','Consórcio','Outro'];
 function cnpj(v){return String(v||'').toUpperCase().replace(/[.\/\s-]/g,'');}
 function validCnpj(v){const s=cnpj(v);if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(s)||/^(.)\1+$/.test(s))return false;const dv=a=>{let sum=0,w=2;for(let i=a.length-1;i>=0;i--){sum+=(a.charCodeAt(i)-48)*w;w=w===9?2:w+1;}const r=sum%11;return r<2?0:11-r;};return dv(s.slice(0,12))===Number(s[12])&&dv(s.slice(0,13))===Number(s[13]);}
 function validate(v){
  const clean=(x,n)=>String(x||'').trim().slice(0,n);
  const o={nome:clean(v.nome,250),cnpj:cnpj(v.cnpj)||null,municipio:clean(v.municipio,120),uf:norm(v.uf),tipo:clean(v.tipo,30),site:clean(v.site,1000),portal:clean(v.portal,1000),contatos:[]};
  if(!o.nome||!o.municipio||!states.includes(o.uf)||!types.includes(o.tipo))throw Error('Preencha nome, município, UF e tipo.');
  if(o.cnpj&&!validCnpj(o.cnpj))throw Error('CNPJ inválido. Confira os dígitos ou deixe em branco.');
  for(const k of ['site','portal'])if(o[k]){let u;try{u=new URL(o[k]);}catch{}if(!u||!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Informe links completos, começando por https://.');}
  if(!Array.isArray(v.contatos)||v.contatos.length>6)throw Error('Contatos inválidos.');
  o.contatos=v.contatos.map(c=>({setor:clean(c.setor,40),nome:clean(c.nome,120),email:clean(c.email,254),telefone:clean(c.telefone,60)})).filter(c=>c.nome||c.email||c.telefone);
  if(o.contatos.some(c=>c.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)))throw Error('Confira o e-mail de contato.');
  return o;
 }
 function sources(contracts,entries){const seen=new Set();return [...contracts.map(r=>({...r,kind:'contrato'})),...entries.map(r=>({...r,kind:'empenho'}))].filter(r=>{const k=JSON.stringify([r.kind,String(r.id),norm(r.empresa)]);if(!r.id||seen.has(k))return false;seen.add(k);return true;});}
 function resolve(row,kind,links,contracts){
  const company=norm(row.empresa),direct=links.find(l=>l.kind===kind&&l.record_id===String(row.id)&&l.company===company);
  if(direct)return norm(direct.source_name)===norm(row.orgao)?{id:direct.orgao_id,link:direct,inherited:false}:null;
  if(kind==='empenho'){
   const candidates=contracts.filter(c=>String(c.id)===String(row.contratoId)&&norm(c.empresa)===company);
   const names=new Set(candidates.map(c=>norm(c.orgao)));if(names.size!==1||!names.has(norm(row.orgao)))return null;
   const c=candidates[0];if(!c)return null;const parent=resolve(c,'contrato',links,[]);return parent?{...parent,inherited:true}:null;
  }return null;
 }
 function day(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const [y,m,d]=v.split('-').map(Number),n=Date.UTC(y,m-1,d);return new Date(n).toISOString().slice(0,10)===v?n/86400000:null;}
 function summary(orgId,links,contracts,entries,finance,company='',asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())){
  const rows=sources(contracts,entries).filter(r=>(!company||norm(r.empresa)===company)&&resolve(r,r.kind,links,contracts)?.id===orgId);
  const cs=rows.filter(r=>r.kind==='contrato'),es=rows.filter(r=>r.kind==='empenho'&&!['CANCELADO','CANCELADA'].includes(norm(r.status))),paid=es.filter(r=>norm(r.status)==='PAGA');
  const sums={compra:0,custo:0,lucro:0,covered:0,estimated:0};
  for(const e of paid){const f=finance(e);if(f.temValores!==false&&[f.vlCompraReal,f.custoReal,f.lucroReal].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)))){sums.compra+=Number(f.vlCompraReal);sums.custo+=Number(f.custoReal);sums.lucro+=Number(f.lucroReal);sums.covered++;if(f.estimado||f.previsto||!f.temCompra)sums.estimated++;}}
  const intervals=paid.flatMap(e=>{const a=day(e.dataEntrega),b=day(e.dataPagamento);return a!==null&&b!==null&&b>=a&&b<=day(asOf)?[b-a]:[];});
  return {rows,contracts:cs.length,contractValue:cs.reduce((n,c)=>n+(Number(c.valor)||0),0),entries:es.length,paid:paid.length,paidValue:paid.reduce((n,e)=>n+(Number(e.valor)||0),0),...sums,n:intervals.length,mean:intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null,min:intervals.length?Math.min(...intervals):null,max:intervals.length?Math.max(...intervals):null};
 }
 const api={norm,states,types,cnpj,validCnpj,validate,sources,resolve,summary};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.KMOrgRegistryModel=api;
})(typeof window==='object'?window:globalThis);

