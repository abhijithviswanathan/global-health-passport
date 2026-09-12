import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../shared/agenda.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildAgenda}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const at=time=>+new Date(`2026-09-10T${time}:00`);
test('agenda sorts visits and identifies exact unbooked intervals',()=>{
 const rows=buildAgenda('2026-09-10',[{id:'b',start:at('10:00'),minutes:45,status:'checked_in'},{id:'a',start:at('09:00'),minutes:30,status:'scheduled'}]);
 assert.deepEqual(rows.filter(r=>r.eventId).map(r=>r.eventId),['a','b']);assert.ok(rows.some(r=>!r.eventId&&r.start===at('09:30')&&r.end===at('10:00')));
});
test('cancelled and no-show visits do not occupy time; completed visits do',()=>{
 const rows=buildAgenda('2026-09-10',['cancelled','no_show','completed'].map((status,i)=>({id:status,start:at(`${9+i}:00`.padStart(5,'0')),minutes:30,status})));
 assert.deepEqual(rows.filter(r=>r.eventId).map(r=>r.eventId),['completed']);
});
test('empty agenda has one labelled window; cross-midnight visits are clipped',()=>{
 assert.deepEqual(buildAgenda('2026-09-10',[]),[{start:at('08:00'),end:at('18:00')}]);
 const rows=buildAgenda('2026-09-10',[{id:'night',start:+new Date('2026-09-09T23:30:00'),minutes:90,status:'scheduled'}]);
 assert.equal(rows[0].start,at('00:00'));assert.equal(rows[0].end,at('01:00'));assert.equal(rows[0].eventId,'night');
});
