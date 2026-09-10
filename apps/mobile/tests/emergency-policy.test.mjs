import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/emergency-policy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const policy = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = Date.parse('2026-09-10T12:00:00Z');
const item = { id: 'a', kind: 'allergy', title: 'Synthetic allergy', details: 'Synthetic record', source: 'Patient entered', status: 'active', createdAt: '2026-09-09T12:00:00Z' };
test('selected emergency records expire exactly at 24 hours', () => {
  const summary = policy.createEmergencySnapshot('patient', [item], now);
  assert.equal(Date.parse(summary.expiresAt) - now, 86400000);
  assert.equal(policy.parseEmergencySnapshot(JSON.stringify(summary), now + 86399999).entries.length, 1);
  assert.throws(() => policy.parseEmergencySnapshot(JSON.stringify(summary), now + 86400000), /expired/);
});
test('cannot persist whole chart, amended records, or oversized narrative', () => {
  assert.throws(() => policy.createEmergencySnapshot('patient', [{ ...item, kind: 'condition' }], now), /Select/);
  assert.throws(() => policy.createEmergencySnapshot('patient', [{ ...item, status: 'amended' }], now), /Select/);
  assert.throws(() => policy.createEmergencySnapshot('patient', Array(6).fill(item), now), /Select/);
  assert.throws(() => policy.createEmergencySnapshot('patient', [{ ...item, details: '界'.repeat(800) }], now), /storage limits/);
});
test('rejects extended expiry and backwards clock beyond generation', () => {
  const summary = policy.createEmergencySnapshot('patient', [item], now);
  assert.throws(() => policy.parseEmergencySnapshot(JSON.stringify(summary), now - 1), /invalid/);
  summary.expiresAt = new Date(now + 172800000).toISOString();
  assert.throws(() => policy.parseEmergencySnapshot(JSON.stringify(summary), now), /invalid/);
});
test('preserves selected text without truncation and removes unrelated fields', () => {
  const summary = policy.createEmergencySnapshot('patient', [{ ...item, unrelatedClinicalRecord: 'do not persist' }], now);
  assert.equal(summary.entries[0].details, item.details);
  assert.equal('unrelatedClinicalRecord' in summary.entries[0], false);
  assert.equal(policy.utf8Bytes('a界🙂'), Buffer.byteLength('a界🙂'));
});
