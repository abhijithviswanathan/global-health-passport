import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
globalThis.__DEV__ = true;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, ...options });
  return { ok: true, status: 200, text: async () => JSON.stringify(url.endsWith('/csrf') ? { token: 'fresh-csrf' } : [{ created_at: '2026-09-10', grantee_name: 'Care team' }]) };
};
test('writes fetch fresh CSRF and preserve cookie credentials', async () => {
  await api.request('/consents', 'POST', { scopes: ['allergy'] });
  assert.equal(calls[0].url.endsWith('/csrf'), true);
  assert.equal(calls[1].headers['X-CSRF-TOKEN'], 'fresh-csrf');
  assert.equal(calls[1].credentials, 'include');
  assert.equal(calls[1].cache, 'no-store');
});
test('normalizes backend field names for native views', async () => {
  const rows = await api.request('/consents');
  assert.deepEqual(rows[0], { createdAt: '2026-09-10', granteeName: 'Care team' });
});
test('release refuses cleartext transport before requesting data', async () => {
  globalThis.__DEV__ = false;
  await assert.rejects(api.request('/me'), /secure HTTPS/);
  globalThis.__DEV__ = true;
});
test('unauthorized response preserves status for session removal', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'Sign in required' }) });
  await assert.rejects(api.request('/me'), e => e instanceof api.ApiError && e.status === 401);
});
test('normalizes single appointment and draft responses like list responses', async () => {
 globalThis.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({patient_id:'p',starts_at:123,duration_minutes:30,updated_at:'now',completed_record_id:null})});
 assert.deepEqual(await api.request('/clinician/appointments/a'),{patientId:'p',startsAt:123,durationMinutes:30,updatedAt:'now',completedRecordId:null});
});
test('surfaces actionable stale-write conflicts from the shared backend',async()=>{
 globalThis.fetch=async url=>url.endsWith('/csrf')?{ok:true,status:200,text:async()=>JSON.stringify({token:'csrf'})}:{ok:false,status:409,text:async()=>JSON.stringify({message:'Visit changed. Refresh and review the latest note.'})};
 await assert.rejects(api.request('/clinician/appointments/a/draft','PUT',{}),e=>e.status===409&&e.message.includes('Visit changed'));
});

test('photo upload preserves multipart boundaries and sends CSRF with cookies', async()=>{
 const photoCalls=[];
 globalThis.fetch=async(url,options)=>{photoCalls.push({url,...options});return {ok:true,status:200,text:async()=>JSON.stringify(url.endsWith('/csrf')?{token:'photo-csrf'}:{id:'photo-id'})};};
 const body=new FormData();body.append('file',new Blob(['fixture'],{type:'image/jpeg'}),'portrait.jpg');
 await api.request('/profile/photo','POST',body,45000);
 assert.equal(photoCalls[1].body,body);
 assert.equal(photoCalls[1].headers['Content-Type'],undefined);
 assert.equal(photoCalls[1].headers['X-CSRF-TOKEN'],'photo-csrf');
 assert.equal(photoCalls[1].credentials,'include');
});
