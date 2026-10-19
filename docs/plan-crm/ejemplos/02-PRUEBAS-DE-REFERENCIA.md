# Comprobaciones de la referencia

[Volver al índice](../README.md)

Este bloque comprueba exclusivamente el motor de `01-MOTOR-DETERMINISTA.md`. Para reproducirlo de forma aislada, extrae su bloque como `engine.ts` y este bloque como `checks.ts` en una carpeta temporal; ejecuta con un Node que admita TypeScript sin transpilar, o adáptalo al runner TypeScript instalado. Aquí se ejecutó con Node 24.19.0. En el CRM usa su runner real, detectado en T00. Esto no instala tests ni dependencias automáticamente.

```ts
import assert from "node:assert/strict";
import { aggregate, paydownCents, utilizationBps, readiness, dtiBps,
  completedMonths, scoreDelta, allocateUtilizationBudget } from "./engine.ts";
assert.equal(utilizationBps(800000, 1000000), 8000);
assert.equal(utilizationBps(0, 1000000), 0);
assert.equal(utilizationBps(120000, 100000), 12000);
assert.equal(utilizationBps(null, 100000), null);
assert.equal(utilizationBps(100, 0), null);
assert.equal(utilizationBps(-1, 100), null);
assert.equal(paydownCents(800000, 1000000, 1000), 700000);
assert.equal(paydownCents(0, 1000000, 1000), 0);
assert.equal(paydownCents(1, 1, 5000), 1);
assert.throws(() => paydownCents(1, 1, 10001));
const group = [{id:"A",limit:1000000,balance:800000},
  {id:"B",limit:500000,balance:50000}, {id:"C",limit:500000,balance:0}];
assert.equal(aggregate(group).valueBps, 4250);
assert.equal(paydownCents(aggregate(group).balance, aggregate(group).limit, 1000), 650000);
assert.equal(group.reduce((n,c) => n + paydownCents(c.balance,c.limit,1000)!,0),700000);
assert.equal(aggregate([...group,{id:"D",balance:0,limit:null}]).status,"PARTIAL");
assert.equal(aggregate([]).status,"NOT_APPLICABLE");
assert.throws(() => aggregate([group[0],group[0]]));
assert.equal(readiness([]),"REVIEW");
assert.equal(readiness([{required:true,result:"UNKNOWN"}]),"REVIEW");
assert.equal(readiness([{required:true,result:"PASS"},{required:false,result:"FAIL"}]),"PASS");
assert.equal(readiness([{required:true,result:"FAIL"},{required:true,result:"UNKNOWN"}]),"FAIL");
assert.equal(dtiBps(180000,600000),3000);
assert.equal(dtiBps(0,600000),0);
assert.equal(dtiBps(180000,0),null);
assert.equal(completedMonths("2025-01-31","2026-01-30"),11);
assert.equal(completedMonths("2025-02-29","2026-01-30"),null);
assert.equal(completedMonths("2027-01-01","2026-01-30"),null);
const s={value:670,bureau:"EXPERIAN",family:"FICO",version:"8",variant:"GENERIC",date:"2026-09-01"};
assert.equal(scoreDelta(s,{...s,value:695,date:"2026-10-01"}),25);
assert.equal(scoreDelta(s,{...s,family:"VANTAGE",version:"3.0",date:"2026-10-01"}),null);
assert.equal(scoreDelta({...s,version:null},{...s,version:null,date:"2026-10-01"}),null);
const budgetCards = [{id:"A",limit:1000000,balance:800000},
  {id:"B",limit:500000,balance:200000}, {id:"C",limit:500000,balance:30000}];
const plan=allocateUtilizationBudget(budgetCards,200000);
assert.equal(plan.cards.find(c=>c.id==="A")!.balance,600000);
assert.equal(plan.spent,200000);
assert.equal(aggregate(plan.cards).valueBps,4150);
assert.equal(allocateUtilizationBudget(budgetCards,0).spent,0);
assert.equal(allocateUtilizationBudget(budgetCards,2000000).remaining,970000);
assert.deepEqual(budgetCards.map(c=>c.balance),[800000,200000,30000]);
// Barrido sintético de invariantes, no calibración financiera.
for (let i=0;i<300;i++) {
  const accounts=[{id:"A",balance:i*37,limit:10000},{id:"B",balance:i*11,limit:5000}];
  const available=i*19;
  const out=allocateUtilizationBudget(accounts,available);
  assert.ok(out.spent<=available && out.remaining>=0);
  assert.equal(out.spent+out.remaining,available);
  assert.equal(out.cards.reduce((n,c)=>n+c.payment,0),out.spent);
  for (let j=0;j<accounts.length;j++) {
    assert.ok(out.cards[j].balance>=0);
    assert.equal(out.cards[j].balance+out.cards[j].payment,accounts[j].balance);
  }
}
console.log("Referencias matemáticas: comprobaciones y 300 escenarios aprobados");
```

La suite del CRM aún necesita permisos, Prisma, idempotencia, UI, cobertura del parser y corpus etiquetado de identidad. Esos casos se especifican en T24/T26/T28.
