/* Provider-neutral email matching. No network calls and no automatic writes. */
(function(root) {
  'use strict';
  const text=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const list=v=>Array.isArray(v)?v:(v?[v]:[]);
  const mid=v=>String(v||'').trim().replace(/^<|>$/g,'');
  const number=v=>{
    const raw=text(v), numbered=raw.match(/\d+\s*\/\s*\d+/g);
    const candidate=numbered?.length===1?numbered[0]:raw;
    return candidate.replace(/\b0+(?=\d)/g,'').replace(/\s*\/\s*/g,'/');
  };
  function normalize(raw) {
    const link=String(raw.link||'').trim();if(link&&!/^https?:\/\/[^\s]+$/i.test(link))throw Error('Use um link http:// ou https:// válido.');
    return {provider:String(raw.provider||'manual'),account:String(raw.account||''),providerId:String(raw.providerId||''),threadId:String(raw.threadId||''),messageId:mid(raw.messageId),references:list(raw.references).flatMap(v=>String(v).match(/<[^>]+>|[^\s,]+/g)||[]).map(mid),subject:String(raw.subject||'').trim(),date:raw.date && Number.isFinite(Date.parse(raw.date))?new Date(raw.date).toISOString():null,link,identifiers:raw.identifiers&&typeof raw.identifiers==='object'?raw.identifiers:{}};
  }
  function same(a,b) {
    return !!((a.messageId&&b.messageId&&mid(a.messageId)===mid(b.messageId)) ||
      (a.providerId&&b.providerId&&a.account&&a.account===b.account&&a.provider===b.provider&&a.providerId===b.providerId) ||
      (a.link&&b.link&&a.link===b.link));
  }
  function suggest(raw,targets) {
    const email=normalize(raw),ids=email.identifiers;
    const candidates=targets.filter(t=>!t.excluida).map(t=>{
      const evidence=[],refs=t.identifiers||{},linked=t.emails||[];
      const duplicate=linked.some(x=>same(email,x));
      const thread=linked.some(x=>(email.references.includes(mid(x.messageId))&&!!x.messageId) ||
        (email.messageId&&list(x.references).map(mid).includes(email.messageId)) ||
        (email.threadId&&email.account&&email.account===x.account&&email.provider===x.provider&&email.threadId===x.threadId));
      if(thread)evidence.push('Message-ID / referências da thread');
      let numeric=0;
      for(const key of ['empenho','processo','ata','contrato']) {
        const expected=list(refs[key]).map(number).filter(Boolean);
        // Structured extraction only: do not confuse the same number across distinct fields.
        if(list(ids[key]).map(number).some(x=>x&&expected.includes(x))){numeric++;evidence.push(key);}
      }
      const orgao=!!text(ids.orgao)&&list(refs.orgao).some(x=>text(x)===text(ids.orgao));
      const cnpj=String(ids.cnpj||'').replace(/\D/g,'');
      const tax=cnpj.length===14&&list(refs.cnpj).some(x=>String(x).replace(/\D/g,'')===cnpj);
      if(orgao)evidence.push('órgão');if(tax)evidence.push('CNPJ');
      const subject=text(email.subject).replace(/^(?:(?:re|fw|fwd|enc):\s*)+/g,'');
      const subjectMatch=subject.length>=12&&list(refs.assunto).concat(linked.map(x=>x.subject)).some(s=>text(s).replace(/^(?:(?:re|fw|fwd|enc):\s*)+/g,'')===subject);
      if(subjectMatch)evidence.push('assunto');
      const reliable=thread || (numeric>=1&&(orgao||tax)) || (numeric>=2&&subjectMatch);
      return {id:t.id,evidence,duplicate,reliable,score:(thread?100:0)+numeric*20+(tax?15:0)+(orgao?10:0)+(subjectMatch?5:0)};
    }).filter(x=>x.evidence.length&&!x.duplicate).sort((a,b)=>b.score-a.score);
    const reliable=candidates.filter(x=>x.reliable);
    // More than one plausible treatment is ambiguous even if one scores higher.
    return {email,candidates,ambiguous:reliable.length>1,suggestion:reliable.length===1?reliable[0]:null};
  }
  const api={normalize,same,suggest};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.KMEmailMatching=api;
})(typeof window!=='undefined'?window:globalThis);
