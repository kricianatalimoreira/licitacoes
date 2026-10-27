const assert=require('node:assert/strict');
const model=require('../org-registry-model.js');
const org=model.validate({nome:'ÓRGÃO DE TESTE/MG',municipio:'MUNICÍPIO DE TESTE',uf:'MG',tipo:'A confirmar',contatos:[]});
assert.equal(org.tipo,'A confirmar');assert.equal(org.cnpj,null);assert.deepEqual(org.contatos,[]);
assert.throws(()=>model.validate({...org,tipo:'Tipo inventado'}));
console.log('Tipo a confirmar aceito sem presumir CNPJ, contatos ou Prefeitura.');
