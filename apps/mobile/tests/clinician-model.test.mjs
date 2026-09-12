import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/clinician-model.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('rejects impossible dates and normalized overflow times before booking', () => {
 for(const [day,time] of [['2026-02-30','09:00'],['2026-10-20','24:00'],['2026-10-20','10:70'],['20/10/2026','09:00']])assert.throws(()=>model.localInstant(day,time));
});
test('booking uses the web API contract and retains retry key',()=>{
 const payload=model.bookingPayload('patient','2026-12-01','09:15','30',' Follow up ','in_person','stable-key');
 assert.equal(payload.startsAt,new Date('2026-12-01T09:15:00').toISOString());assert.equal(payload.duration,30);assert.equal(payload.reason,'Follow up');assert.equal(payload.requestKey,'stable-key');assert.equal(payload.mode,'in_person');
 assert.throws(()=>model.bookingPayload('patient','2026-12-01','09:15','181','reason','video','key'));
 assert.throws(()=>model.bookingPayload('patient','2026-12-01','09:15','30','','video','key'));
});
test('schedule ranges use local calendar days, including month and year boundaries',()=>{
 assert.equal(model.shiftDay('2026-12-31',1),'2027-01-01');assert.equal(model.shiftDay('2026-03-01',-1),'2026-02-28');
 const range=model.dayRange('2026-12-31');assert.equal(model.localDay(new Date(range.from)),'2026-12-31');assert.equal(model.localDay(new Date(range.to)),'2027-01-01');
});
test('completed, cancelled and no-show visits cannot expose an editable workflow',()=>{
 for(const status of ['completed','cancelled','no_show'])assert.equal(model.closed({status}),true);
 for(const status of ['scheduled','checked_in','in_progress'])assert.equal(model.closed({status}),false);
});
