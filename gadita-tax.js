(function(root) {
  'use strict';
  // Estimativa gerencial autorizada para a GADITA (origem MG), não apuração fiscal.
  const rates = Object.freeze({MG:23.93,SP:17.93,RJ:17.93,PR:17.93,SC:17.93,RS:17.93,
    AC:12.93,AL:12.93,AP:12.93,AM:12.93,BA:12.93,CE:12.93,DF:12.93,ES:12.93,
    GO:12.93,MA:12.93,MT:12.93,MS:12.93,PA:12.93,PB:12.93,PE:12.93,PI:12.93,
    RN:12.93,RO:12.93,RR:12.93,SE:12.93,TO:12.93});
  const names = ['ACRE','ALAGOAS','AMAPA','AMAZONAS','BAHIA','CEARA','DISTRITO FEDERAL','ESPIRITO SANTO','GOIAS','MARANHAO','MATO GROSSO','MATO GROSSO DO SUL','MINAS GERAIS','PARA','PARAIBA','PARANA','PERNAMBUCO','PIAUI','RIO DE JANEIRO','RIO GRANDE DO NORTE','RIO GRANDE DO SUL','RONDONIA','RORAIMA','SANTA CATARINA','SAO PAULO','SERGIPE','TOCANTINS'];
  const codes = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const normalize = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const isGadita = c => normalize(c?.empresa) === 'GADITA';
  function state(c) {
    const explicit = normalize(c?.uf);
    if (Object.hasOwn(rates, explicit)) return explicit;
    const nameIndex = names.indexOf(explicit);
    if (nameIndex >= 0) return codes[nameIndex];
    // Só reconhece siglas explícitas no nome do órgão; nunca adivinha pela cidade.
    const matches = [...normalize(c?.orgao).matchAll(/(?:\/|\s[-–—]\s*)\s*([A-Z]{2})(?=$|[\s(])/g)]
      .map(m=>m[1]).filter(uf=>Object.hasOwn(rates,uf));
    const unique = [...new Set(matches)];
    return unique.length === 1 ? unique[0] : null;
  }
  function rate(c) { return isGadita(c) ? rates[state(c)] ?? null : null; }
  function percentage(c) {
    const automatic = rate(c);
    if (automatic !== null) return automatic;
    const saved = c?.impostoPct;
    return saved !== null && saved !== undefined && saved !== '' && Number.isFinite(Number(saved)) ? Number(saved) : 6;
  }
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  function apply(c) {
    const pct = rate(c);
    if (pct === null) return false;
    const imposto = money((Number(c.valor)||0) * pct / 100);
    const custo = money(imposto + (Number(c.royalties)||0));
    const values = {uf:state(c), impostoPct:pct, imposto, custo,
      lucro:money((Number(c.valor)||0) - (Number(c.compra)||0) - custo)};
    const changed = Object.entries(values).some(([k,v])=>c[k] !== v);
    Object.assign(c,values);
    return changed;
  }
  const api = {rates,state,isGadita,rate,percentage,apply,money};
  root.KMGaditaTax = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
