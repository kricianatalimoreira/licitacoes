(function(root){
  'use strict';
  function day(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return null;
    const [y,m,d]=value.split('-').map(Number), t=Date.UTC(y,m-1,d);
    return new Date(t).toISOString().slice(0,10)===value?t/86400000:null;
  }
  function calculate(entries, filters={}, finance){
    const rows=entries.filter(e=>e.status==='Paga' &&
      (!filters.empresa || String(e.empresa||'').toLowerCase()===filters.empresa.toLowerCase()) &&
      (!filters.orgao || String(e.orgao||'').toLowerCase().includes(filters.orgao.toLowerCase())) &&
      (!filters.data || e.dataPagamento===filters.data) &&
      (!filters.mes || (e.dataPagamento||'').slice(5,7)===String(filters.mes).padStart(2,'0')) &&
      (!filters.ano || (e.dataPagamento||'').slice(0,4)===String(filters.ano)));
    const result={rows,count:rows.length,received:0,profit:0,purchase:0,cost:0,expenseMissing:0,roi:null,known:0,estimated:0,missing:0,days:null,samples:0,invalidDates:0,missingPayment:0};
    let days=0;
    for(const e of rows){
      const paid=day(e.dataPagamento), delivered=day(e.dataEntrega);
      if(paid===null){result.missingPayment++;continue;}
      result.received+=Math.round((Number(e.valor)||0)*100);
      const f=finance(e);
      if(f.temValores && Number.isFinite(f.vlCompraReal) && Number.isFinite(f.custoReal)){
        result.purchase+=Math.round(f.vlCompraReal*100);
        result.cost+=Math.round(f.custoReal*100);
      }else result.expenseMissing++;
      if(f.temValores && Number.isFinite(f.lucroReal)){
        result.profit+=Math.round(f.lucroReal*100);result.known++;
        if(f.estimado) result.estimated++;
      }else result.missing++;
      if(delivered!==null && paid>=delivered){days+=paid-delivered;result.samples++;}
      else result.invalidDates++;
    }
    result.received/=100;result.profit/=100;result.purchase/=100;result.cost/=100;
    const investment=result.purchase+result.cost;
    if(investment>0 && !result.missing && !result.expenseMissing && !result.missingPayment) result.roi=result.profit/investment*100;
    result.days=result.samples?days/result.samples:null;
    return result;
  }
  const api={calculate,day};
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.KMPaidKPIs=api;
})(typeof window==='object'?window:globalThis);

