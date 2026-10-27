const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {calculate,day}=require('../paid-kpis');
const e={status:'Paga',empresa:'Gadita',orgao:'Cidade',valor:400,dataPagamento:'2026-08-03',dataEntrega:'2026-07-28'};
const f=()=>({temValores:true,lucroReal:147.41});
assert.equal(calculate([e],{},f).days,6);
assert.equal(calculate([e],{mes:'08',ano:'2026',empresa:'GADITA'},f).received,400);
for(const filters of [{mes:'07'},{ano:'2025'},{empresa:'Hamate'},{orgao:'outra'},{data:'2026-08-04'}])assert.equal(calculate([e],filters,f).count,0);
for(const status of ['Cancelado','Pendente','Parcial'])assert.equal(calculate([{...e,status}],{},f).received,0);
for(const dataEntrega of [null,'2026-08-04','2026-02-30'])assert.equal(calculate([{...e,dataEntrega}],{},f).days,null);
assert.equal(calculate([{...e,dataEntrega:e.dataPagamento}],{},f).days,0);
assert.equal(day('2024-02-29')+1,day('2024-03-01'));
assert.equal(day('2025-02-29'),null);
assert.equal(calculate([e],{},()=>({temValores:true,lucroReal:-10})).profit,-10);
assert.equal(calculate([e],{},()=>({temValores:true,lucroReal:0,estimado:true})).estimated,1);
assert.equal(calculate([e],{},()=>({temValores:false,lucroReal:0})).missing,1);
assert.equal(calculate([{...e,dataPagamento:null}],{},f).missingPayment,1);
const original=JSON.stringify(e);calculate([e],{},f);assert.equal(JSON.stringify(e),original);
const s=fs.readFileSync('index.html','utf8');
let scripts=0;for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()){new vm.Script(m[1]);scripts++;}
const calc=/function calcEmpFinanceiroRealizado\(e\) \{[\s\S]*?\n    \}/;
assert.ok(s.match(calc));
for(const id of ['fEmpEncMes','fEmpEncAno','fEmpEncEmpresa','empEncStatValor','empEncStatTotal','empEncStatLucro'])assert.equal(s.split('id="'+id+'"').length-1,1,id);
assert.ok(s.includes('<script src="paid-kpis.js"></script>'));
console.log('20 cenários financeiros/datas/filtros aprovados; IDs únicos; '+scripts+' scripts válidos.');

