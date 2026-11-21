'use strict';
// Check Video grading helper (evaluation tooling only; does not affect how videos are checked).
// disputes.json in the runs folder lists claims where AIVerify and the independent reviewer disagree; Cary settles each one.
// His answers are saved to disputes-answers.json (one entry per dispute id; the latest answer wins).
const fs = require('fs'), path = require('path');
const CHOICES = ['aiverify', 'reviewer', 'neither', 'unsure'];

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_e) { return fallback; } }
function listDisputes(dir) {
  const list = readJson(path.join(dir, 'disputes.json'), { disputes: [] });
  const answers = readJson(path.join(dir, 'disputes-answers.json'), {});
  return { title: list.title || 'Disputes', disputes: (list.disputes || []).map(d => Object.assign({}, d, { answer: answers[d.id] || null })) };
}
function saveAdjudication(dir, id, choice, note) {
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(String(id || '')) || !CHOICES.includes(choice)) return false;
  const list = readJson(path.join(dir, 'disputes.json'), { disputes: [] });
  if (!(list.disputes || []).some(d => d.id === id)) return false;
  const file = path.join(dir, 'disputes-answers.json'), answers = readJson(file, {});
  answers[id] = { choice, note: String(note || '').slice(0, 1000), at: new Date().toISOString() };
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(answers, null, 2)); fs.renameSync(tmp, file);
  return true;
}
module.exports = { listDisputes, saveAdjudication, CHOICES };
