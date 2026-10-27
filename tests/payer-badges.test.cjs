const assert=require('node:assert/strict'),M=require('../payer-badges');
const e={id:'1',orgao:'CIDADE/MG',empresa:'Gadita',status:'Paga',dataEntrega:'2026-01-01',dataPagamento:'2026-01-11'};
const rows=[e,{...e,id:'2',dataPagamento:'2026-01-16'},{...e,id:'3',dataPagamento:'2026-01-21'}];
const calc=(rs=rows,entry=e)=>M.build(rs,[],'2026-10-27').get(entry);
assert.deepEqual(calc(),{label:'Pagador rápido',n:3,mean:15,min:10,max:20});
assert.equal(calc(rows.slice(0,2)).label,'Sem histórico suficiente');assert.equal(calc([]).n,0);
for(const date of ['',null,'2026-02-30','2025-12-31','2027-01-01'])assert.equal(calc([{...e,dataPagamento:date}]).n,0);
for(const date of ['',null,'2026-02-30','2026-01-12'])assert.equal(calc([{...e,dataEntrega:date}]).n,0);
for(const status of ['Pendente','Compra Feita','Ag. Liquidação','Cancelada'])assert.equal(calc([{...e,status}]).n,0);
assert.equal(calc([{...e,dataPagamento:'2026-01-01'}]).mean,0);
assert.equal(calc([...rows,e]).n,3);
assert.equal(calc(rows,{...e,orgao:'CIDADE/MG (CÂMARA)'}).n,0);
assert.equal(calc(rows,{...e,orgao:'CIDADE/MG (FMS)'}).n,0);
assert.equal(calc(rows,{...e,orgao:'CIDADE/SP'}).n,0);
assert.equal(calc(rows,{...e,empresa:'Hamate'}).n,0);
assert.equal(calc(rows,{...e,orgao:' cidade / mg '}).n,3);
assert.equal(calc([{...e,orgao:'CIDADE'}],{...e,orgao:'CIDADE'}).n,0);
assert.equal(M.identity({...e,orgao:'CIDADE',contratoId:'c'},[{id:'c',orgao:'CIDADE',empresa:'Gadita',uf:'MG'}]),JSON.stringify(['GADITA','CIDADE','MG']));
assert.equal(M.identity({...e,contratoId:'c'},[{id:'c',orgao:e.orgao,empresa:'Gadita',uf:'SP'}]),null);
for(const [days,label] of [[15,'rápido'],[16,'regular'],[30,'regular'],[31,'lento'],[60,'lento'],[61,'crítico']]){
 const dataPagamento=new Date(Date.UTC(2026,0,1+days)).toISOString().slice(0,10);
 assert.ok(calc(rows.map(e=>({...e,dataPagamento}))).label.endsWith(label));
}
const frozen=JSON.stringify(rows);calc();assert.equal(JSON.stringify(rows),frozen);
const updated=rows.map(r=>({...r}));assert.equal(calc(updated).n,3);updated[0].status='Pendente';assert.equal(calc(updated).n,2);
M.prepare(rows,[]);assert.ok(M.html(e).includes('data-payer-stats='));assert.ok(M.html(e).includes('Pagador rápido'));
console.log('Classificação: faixas, mínimo 3, datas válidas, status, entidades/UF/empresa, atualização e não mutação aprovados.');

