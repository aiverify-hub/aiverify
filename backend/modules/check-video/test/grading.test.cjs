'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { listDisputes, saveAdjudication } = require('../grading.cjs');
test('disputes: list, save an answer, refuse bad ids and choices', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-grade-'));
  assert.deepEqual(listDisputes(dir).disputes, []);
  fs.writeFileSync(path.join(dir, 'disputes.json'), JSON.stringify({ disputes: [{ id: 'b1-v3-c2', claim: 'x' }] }));
  assert.equal(saveAdjudication(dir, 'b1-v3-c2', 'reviewer', 'Fred right'), true);
  assert.equal(listDisputes(dir).disputes[0].answer.choice, 'reviewer');
  assert.equal(saveAdjudication(dir, 'b1-v3-c2', 'maybe'), false);
  assert.equal(saveAdjudication(dir, '../x', 'aiverify'), false);
  assert.equal(saveAdjudication(dir, 'unknown-id', 'aiverify'), false);
});
