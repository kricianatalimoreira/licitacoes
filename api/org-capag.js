const { Readable } = require('node:stream');
const origin = 'https://www.tesourotransparente.gov.br';
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const signal = AbortSignal.timeout(25000);
    const catalog = await fetch(origin+'/ckan/api/3/action/package_show?id=capag-municipios',{signal});
    if (!catalog.ok) throw Error('Catálogo indisponível');
    const {result} = await catalog.json();
    const dated = result.resources.flatMap(resource => {
      const date = resource.name?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return date && /capag.*munic/i.test(resource.name) && resource.format?.toUpperCase()==='XLSX'
        ? [{resource,date:date[3]+date[2]+date[1]}] : [];
    }).sort((a,b)=>b.date.localeCompare(a.date));
    const resource = dated[0]?.resource;
    if (!resource) throw Error('Planilha indisponível');
    const url = new URL(resource.url,origin);
    if (url.protocol!=='https:' || !['www.tesourotransparente.gov.br','tesourotransparente.gov.br'].includes(url.hostname)) throw Error('Origem inválida');
    const file = await fetch(url,{signal});
    if (!file.ok || !file.body) throw Error('Download indisponível');
    res.setHeader('Cache-Control','public, s-maxage=86400');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('X-Capag-Reference',dated[0].date);
    Readable.fromWeb(file.body).on('error',()=>res.destroy()).pipe(res);
  } catch {
    return res.status(502).json({error:'Base municipal da CAPAG indisponível.'});
  }
};
