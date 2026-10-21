/* Quantities are checked per item; totals or monetary values alone never close a contract. */
(function(root){
 'use strict';
 function ready(contract,commitments){
  if(!contract||!Array.isArray(contract.itensLotes)||!contract.itensLotes.length)return false;
  const expected=new Map();
  for(const it of contract.itensLotes){
   const qty=Number(it.qtd),id=String(it.id??'');
   if(!id||expected.has(id)||!Number.isFinite(qty)||qty<=0)return false;
   expected.set(id,qty);
  }
  const linked=commitments.filter(e=>String(e.contratoId)===String(contract.id));
  if(!linked.length||linked.some(e=>e.status!=='Paga'))return false;
  const sums=new Map(),seen=new Set();
  for(const e of linked){
   if(!e.id||seen.has(String(e.id))||!Array.isArray(e.itensEmpenhados)||!e.itensEmpenhados.length)return false;
   seen.add(String(e.id));
   for(const it of e.itensEmpenhados){
    const id=String(it.itemId??''),qty=Number(it.qtdEmp);
    if(!expected.has(id)||!Number.isFinite(qty)||qty<=0)return false;
    sums.set(id,(sums.get(id)||0)+qty);
   }
  }
  return [...expected].every(([id,qty])=>(sums.get(id)||0)+1e-9>=qty);
 }
 root.KMContractCompletion={ready};
 if(typeof module!=='undefined'&&module.exports)module.exports={ready};
})(typeof window!=='undefined'?window:globalThis);
