const assert=require('node:assert/strict'),M=require('../org-registry-model.js');
assert.equal(M.validCnpj('00.000.000/E08G-12'),true);assert.equal(M.validCnpj('00.000.000/0001-91'),true);assert.equal(M.validCnpj('00.000.000/0001-90'),false);assert.equal(M.validCnpj('00000000000000'),false);
const valid={nome:'Prefeitura A',cnpj:'00.000.000/0001-91',municipio:'Cidade A',uf:'MG',tipo:'Prefeitura',contatos:[]};assert.equal(M.validate(valid).cnpj,'00000000000191');assert.throws(()=>M.validate({...valid,site:'javascript:alert(1)'}));assert.throws(()=>M.validate({...valid,portal:'https://user:pass@site.test'}));assert.throws(()=>M.validate({...valid,uf:'XX'}));assert.throws(()=>M.validate({...valid,contatos:[{email:'invalido'}]}));
const c={id:'c1',orgao:'CIDADE A/MG',empresa:'Gadita',valor:1000},e={id:'e1',contratoId:'c1',orgao:c.orgao,empresa:'Gadita',status:'Paga',valor:100,dataEntrega:'2026-01-01',dataPagamento:'2026-01-16'},link={kind:'contrato',record_id:'c1',company:'GADITA',orgao_id:'org1',source_name:c.orgao};
assert.equal(M.resolve(e,'empenho',[link],[c]).id,'org1');assert.equal(M.resolve(e,'empenho',[link],[c]).inherited,true);
assert.equal(M.resolve({...e,empresa:'Hamate'},'empenho',[link],[c]),null);assert.equal(M.resolve({...e,orgao:'CIDADE A/MG (CÂMARA)'},'empenho',[link],[c]),null);assert.equal(M.resolve(e,'empenho',[{...link,source_name:'OUTRO'}],[c]),null);assert.equal(M.resolve(e,'empenho',[link],[c,{...c,orgao:'OUTRO'}]),null);
const direct={kind:'empenho',record_id:'e1',company:'GADITA',orgao_id:'org2',source_name:e.orgao};assert.equal(M.resolve(e,'empenho',[link,direct],[c]).id,'org2');assert.equal(M.sources([c,c],[e,e]).length,2);
const fin=()=>({vlCompraReal:40,custoReal:10,lucroReal:50,temCompra:true,temValores:true});
let s=M.summary('org1',[link],[c,c],[e,e,{...e,id:'e2',dataEntrega:'2026-01-32'},{...e,id:'e3',dataPagamento:'2027-01-01'},{...e,id:'e4',status:'Cancelada'}],fin,'GADITA','2026-10-27');assert.equal(s.contracts,1);assert.equal(s.paid,3);assert.equal(s.n,1);assert.equal(s.mean,15);assert.equal(s.compra,120);assert.equal(s.lucro,150);assert.equal(s.entries,3);
s=M.summary('org1',[link],[c],[e],()=>({...fin(),temValores:false}),'GADITA','2026-10-27');assert.equal(s.covered,0);assert.equal(s.compra,0);
s=M.summary('org1',[link],[c],[e],()=>({...fin(),estimado:true,temCompra:false}),'GADITA','2026-10-27');assert.equal(s.estimated,1);
assert.equal(M.summary('org1',[link],[c],[e],fin,'HAMATE').entries,0);
console.log('Cadastro: CNPJ numérico/alfanumérico, URLs, identidade, separação de empresas/entidades, herança, duplicação, datas e cobertura aprovados.');

