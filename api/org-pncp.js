const modalities = [1,2,3,4,5,6,7,8,9,10,11,12,13];
module.exports = async (req, res) => {
  const cnpj = req.query.cnpj;
  if (req.method !== 'GET' || typeof cnpj !== 'string' || !/^\d{14}$/.test(cnpj)) {
    return res.status(400).json({error:'Informe um CNPJ de 14 dígitos.'});
  }
  const end = new Date();
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth()-24);
  const iso = d => d.toISOString().slice(0,10);
  const compact = d => iso(d).replaceAll('-','');
  const records = new Map();
  const signal = AbortSignal.timeout(22000);
  try {
    await Promise.all(modalities.map(async modality => {
      for (let page=1;page<=30;page++) {
        const params = new URLSearchParams({cnpj,dataInicial:compact(start),dataFinal:compact(end),codigoModalidadeContratacao:modality,pagina:page,tamanhoPagina:100});
        const response=await fetch('https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?'+params,{signal});
        if(response.status===204) break;
        if(!response.ok) throw new Error('PNCP '+response.status);
        const result=await response.json();
        if(!Array.isArray(result.data)||!Number.isInteger(result.totalPaginas))throw new Error('Resposta incompleta');
        for(const row of result.data){
          if(row.orgaoEntidade?.cnpj!==cnpj || !row.numeroControlePNCP || !Number.isInteger(row.situacaoCompraId)) throw new Error('Registro sem identificação ou situação');
          records.set(row.numeroControlePNCP,row.situacaoCompraId);
        }
        if(page>=result.totalPaginas)break;
        if(page===30)throw new Error('Consulta excedeu o limite de páginas');
      }
    }));
    const total=records.size;
    const cancelled=[...records.values()].filter(status=>status===2||status===3).length;
    res.setHeader('Cache-Control','public, s-maxage=86400');
    return res.json({total,cancelled,score:total>=20?Math.max(0,100-500*cancelled/total):null,start:iso(start),end:iso(end),source:'https://pncp.gov.br/api/consulta/swagger-ui/index.html'});
  } catch {
    return res.status(502).json({error:'Consulta completa ao PNCP indisponível.'});
  }
};
