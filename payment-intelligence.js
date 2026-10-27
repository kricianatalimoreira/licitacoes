(function(root){
  'use strict';
  const bases={receipt:{field:'dataRecebimentoEmpenho',label:'Recebimento do empenho'},acceptance:{field:'dataRecebimentoDefinitivo',label:'Aceite definitivo'},liquidation:{field:'dataLiquidacao',label:'Liquidação'},physical:{field:'dataEntrega',label:'Entrega física'},issue:{field:'data',label:'Emissão/pedido'}};
  const defaults={fast:15,regular:30,slow:60,minSamples:3};
  function day(s){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;
    const [y,m,d]=s.split('-').map(Number),t=Date.UTC(y,m-1,d);
    return new Date(t).toISOString().slice(0,10)===s?t/86400000:null;
  }
  function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());}
  const norm=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').toLocaleUpperCase('pt-BR');
  function key(e){const registered=root.KMOrgaos?.identity(e);if(registered)return registered;return norm(e.empresa)&&norm(e.orgao)?JSON.stringify([norm(e.empresa),norm(e.orgao)]):null;}
  const paid=e=>norm(e.status)==='PAGA';
  const active=e=>['PENDENTE','COMPRA FEITA','AG. LIQUIDAÇÃO'].includes(norm(e.status));
  function config(c={}){
    const x={...defaults,...c};
    if(![x.fast,x.regular,x.slow,x.minSamples].every(Number.isInteger)||x.fast<0||x.regular<=x.fast||x.slow<=x.regular||x.slow>3650||x.minSamples<1||x.minSamples>100)throw Error('Informe limites crescentes e amostra mínima de 1 a 100.');
    return x;
  }
  function stats(values){
    const a=[...values].sort((a,b)=>a-b),n=a.length;
    return {n,mean:n?a.reduce((s,v)=>s+v,0)/n:null,median:n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null,min:n?a[0]:null,max:n?a[n-1]:null};
  }
  function classification(mean,c){return mean===null?'Sem histórico':mean<=c.fast?'Pagador rápido':mean<=c.regular?'Pagador regular':mean<=c.slow?'Pagador lento':'Pagador crítico';}
  function interval(e,basis,asOf){
    const end=day(e.dataPagamento),start=day(e[bases[basis].field]);
    return end!==null&&start!==null&&start<=end&&end<=asOf?end-start:null;
  }
  function due(e){return String(e.fontePrazoPagamento||'').trim()?day(e.dataVencimentoPagamento):null;}
  function balance(e,asOf){
    if(paid(e)||!active(e))return 0;
    const v=e.saldoPendenteConfirmado,d=day(e.dataSaldoConfirmado);
    return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=Number(e.valor)&&d!==null&&d<=asOf?Number(v):null;
  }
  function analyze(entries,options={}){
    const c=config(options.config),basis=bases[options.basis]?options.basis:'physical',asOf=day(options.today||today());
    if(asOf===null)throw Error('Data de referência inválida.');
    const groups=new Map();let ungrouped=0;
    for(const e of entries){
      if(!paid(e)&&!active(e))continue;
      if(options.empresa&&norm(e.empresa)!==norm(options.empresa))continue;
      if(options.orgao&&!norm(e.orgao).includes(norm(options.orgao)))continue;
      const k=key(e);if(!k){ungrouped++;continue;}
      if(!groups.has(k))groups.set(k,{key:k,orgao:e.orgao,empresa:e.empresa,paid:[],pending:[],values:Object.fromEntries(Object.keys(bases).map(b=>[b,[]])),eligible:0,late:0});
      const g=groups.get(k);
      if(paid(e)){
        const p=day(e.dataPagamento);
        if(options.ano&&(e.dataPagamento||'').slice(0,4)!==String(options.ano))continue;
        if(options.mes&&(e.dataPagamento||'').slice(5,7)!==String(options.mes).padStart(2,'0'))continue;
        g.paid.push(e);
        for(const b of Object.keys(bases)){const v=interval(e,b,asOf);if(v!==null)g.values[b].push(v);}
        const d=due(e);if(d!==null&&p!==null&&p<=asOf){g.eligible++;if(p>d)g.late++;}
      }else g.pending.push(e);
    }
    const out=[...groups.values()].map(g=>{
      g.metrics=Object.fromEntries(Object.entries(g.values).map(([b,v])=>[b,stats(v)]));delete g.values;
      g.sample=g.metrics[basis];g.classification=classification(g.sample.mean,c);g.sufficient=g.sample.n>=c.minSamples;
      g.excluded=g.paid.length-g.sample.n;g.lateRate=g.eligible?g.late/g.eligible*100:null;
      g.forecasts=g.pending.map(e=>{
        const anchor=day(e[bases[basis].field]);
        const estimate=g.sufficient&&anchor!==null&&anchor<=asOf?anchor+Math.round(g.sample.median):null;
        const d=due(e),b=balance(e,asOf);
        return {entry:e,date:estimate===null?null:new Date(estimate*86400000).toISOString().slice(0,10),estimatePassed:estimate!==null&&estimate<asOf,balance:b,overdueDays:d!==null&&d<asOf&&b!==null&&b>0?asOf-d:null,deadline:d!==null?e.dataVencimentoPagamento:null};
      });
      return g;
    }).filter(g=>g.paid.length||g.pending.length);
    const ranked=out.filter(g=>g.sufficient).sort((a,b)=>a.sample.mean-b.sample.mean||norm(a.orgao).localeCompare(norm(b.orgao)));
    let last=null,rank=0;ranked.forEach((g,i)=>{if(last!==g.sample.mean)rank=i+1;g.rank=rank;last=g.sample.mean;});
    const overdue=out.flatMap(g=>g.forecasts.filter(f=>f.overdueDays!==null));
    const pending=out.flatMap(g=>g.forecasts);
    return {groups:out,ranked,basis,config:c,ungrouped,overdue,overdueValue:overdue.reduce((s,f)=>s+Math.round(f.balance*100),0)/100,unassessed:pending.filter(f=>f.balance===null||f.balance>0&&!f.deadline).length};
  }
  function warning(entries,orgao,empresa,options={}){
    const result=analyze(entries,{...options,orgao:'',empresa}),g=result.groups.find(g=>g.key===key(options.record||{orgao,empresa}));
    if(!g||!g.sufficient)return 'Histórico insuficiente deste órgão e empresa para estimar prazo. Nenhuma previsão de atraso.';
    return `Atenção: este órgão apresenta média histórica de ${g.sample.mean.toLocaleString('pt-BR',{maximumFractionDigits:1})} dias entre ${bases[result.basis].label.toLowerCase()} e pagamento (${g.sample.n} pagamentos). Considere o impacto no capital de giro. Histórico não garante o próximo prazo nem comprova atraso contratual.`;
  }
  const fields={dataRecebimentoEmpenho:'data_recebimento_empenho',dataRecebimentoDefinitivo:'data_recebimento_definitivo',dataLiquidacao:'data_liquidacao',dataVencimentoPagamento:'data_vencimento_pagamento',fontePrazoPagamento:'fonte_prazo_pagamento',saldoPendenteConfirmado:'saldo_pendente_confirmado',dataSaldoConfirmado:'data_saldo_confirmado'};
  function fromDb(r){return Object.fromEntries(Object.entries(fields).map(([js,db])=>[js,r[db]??null]));}
  function validate(values,e,asOf=today()){
    const limit=day(asOf),copy={...values};
    for(const k of ['dataRecebimentoEmpenho','dataRecebimentoDefinitivo','dataLiquidacao','dataVencimentoPagamento','dataSaldoConfirmado']){
      copy[k]=copy[k]||null;
      if(copy[k]&&day(copy[k])===null)throw Error('Data inválida.');
      if(copy[k]&&k!=='dataVencimentoPagamento'&&day(copy[k])>limit)throw Error('Eventos ocorridos não podem ter data futura.');
    }
    for(const [a,b] of [['dataRecebimentoEmpenho','dataPagamento'],['dataEntrega','dataRecebimentoDefinitivo'],['dataRecebimentoDefinitivo','dataLiquidacao'],['dataRecebimentoDefinitivo','dataPagamento'],['dataLiquidacao','dataPagamento']]){
      const merged={...e,...copy},da=day(merged[a]),db=day(merged[b]);if(da!==null&&db!==null&&da>db)throw Error('Confira a ordem das datas: recebimento, entrega, aceite, liquidação e pagamento.');
    }
    copy.fontePrazoPagamento=String(copy.fontePrazoPagamento||'').trim()||null;
    if(copy.dataVencimentoPagamento&&!copy.fontePrazoPagamento)throw Error('Informe a cláusula/documento que define o vencimento.');
    if((copy.fontePrazoPagamento||'').length>1000)throw Error('Limite de 1000 caracteres para a fonte do prazo.');
    copy.saldoPendenteConfirmado=copy.saldoPendenteConfirmado===''||copy.saldoPendenteConfirmado==null?null:Number(copy.saldoPendenteConfirmado);
    if(copy.saldoPendenteConfirmado!==null){
      if(!Number.isFinite(copy.saldoPendenteConfirmado)||copy.saldoPendenteConfirmado<0||copy.saldoPendenteConfirmado>Number(e.valor))throw Error('Saldo deve estar entre zero e o valor do empenho.');
      if(paid(e)&&copy.saldoPendenteConfirmado!==0)throw Error('Empenho pago não pode ter saldo pendente.');
      if(!copy.dataSaldoConfirmado)throw Error('Informe a data da conferência do saldo.');
      copy.saldoPendenteConfirmado=Math.round(copy.saldoPendenteConfirmado*100)/100;
    }
    return Object.fromEntries(Object.entries(fields).map(([js,db])=>[db,copy[js]??null]));
  }
  const api={bases,defaults,day,today,key,stats,config,classification,analyze,warning,fields,fromDb,validate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KMPaymentIntelligence=api;
})(typeof window==='object'?window:globalThis);

