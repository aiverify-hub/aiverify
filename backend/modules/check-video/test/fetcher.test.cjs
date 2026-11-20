'use strict';
// Focused tests for the deployed safe fetcher in backend/index.js (v3700PublicAddress / v3700PublicGet).
// The two functions are loaded from index.js source into a sandbox with fake https/dns modules: no network.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), net = require('net');
const { EventEmitter } = require('events');

const INDEX = path.join(__dirname, '..', '..', '..', 'index.js');
function fetcherSource() {
  const src = fs.readFileSync(INDEX, 'utf8');
  const a = src.indexOf('function v3700PublicAddress('), b = src.indexOf('function fetchUrlRawForChild(');
  assert.ok(a > 0 && b > a, 'fetcher functions found in index.js');
  return src.slice(a, b);
}
// pages: host -> {status, body, location, contentType}; addrs: host -> address or [addresses]
function fakeNet(pages, addrs) {
  const dns = { lookup: (name, o, cb) => setImmediate(() => { const v = addrs[name]; if (!v) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })); cb(null, (Array.isArray(v) ? v : [v]).map(x => ({ address: x, family: net.isIPv6(x) ? 6 : 4 }))); }) };
  const request = (u, opts, cb) => {
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => opts.lookup(u.hostname, {}, err => {
      if (err) return req.emit('error', err);
      const p = pages[u.hostname] || { status: 404, body: '' };
      const res = new EventEmitter(); res.statusCode = p.status; res.headers = p.location ? { location: p.location } : { 'content-type': p.contentType || 'text/html' }; res.destroy = () => {};
      cb(res);
      setImmediate(() => {
        if (!p.location) { const body = Buffer.from(p.body || ''); for (let i = 0; i < body.length; i += 65536) res.emit('data', body.subarray(i, i + 65536)); }
        res.emit('end');
      });
    });
    return req;
  };
  return { https: { request }, http: { request }, dns, net };
}
function load(mods, sourceOverride) {
  const ctx = vm.createContext({ require: n => mods[n] || require(n), https: mods.https, http: mods.http, URL, Buffer, Promise, setTimeout, clearTimeout, Date, Math, Number, String, Array, Object, Error });
  vm.runInContext((sourceOverride || fetcherSource()) + '\n;globalThis.__get=v3700PublicGet;globalThis.__addr=v3700PublicAddress;', ctx);
  return { get: ctx.__get, addr: ctx.__addr };
}

const ALLOW = ['192.0.66.161', '192.0.66.108', '192.2.1.1', '23.56.237.86', '104.18.5.110', '192.31.196.1', '192.175.48.1', '192.0.1.5', '192.0.3.1', '2606:4700::1', '2620:4f:8000::1'];
const DENY = ['192.0.0.8', '192.0.0.1', '192.0.0.170', '192.0.0.9', '192.0.2.10', '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1',
  '192.88.99.1', '198.18.0.1', '198.19.255.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::1', '::', '::ffff:10.0.0.1', '::ffff:192.0.66.161',
  '64:ff9b::a00:1', 'fc00::1', 'fe80::1', 'fe80::1%eth0', '2001::1', '2001:db8::1', '2002::1', '3fff::1', '5f00::1', '100::1'];

test('address check follows the IANA special-purpose registry for 192.0.0.0/24 and 192.0.2.0/24 only', () => {
  const f = load(fakeNet({}, {}));
  assert.deepEqual(ALLOW.filter(a => !f.addr(a)), [], 'public addresses allowed');
  assert.deepEqual(DENY.filter(a => f.addr(a)), [], 'special-purpose addresses rejected');
});

test('the only behaviour change versus the deployed expression is the 192.0.0.0/16 and 192.2.0.0/16 public ranges', () => {
  const fixed = fetcherSource();
  const original = fixed.replace('(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))', '(a===192&&(b===168||b===0||b===2||(b===88&&c===99)))');
  assert.notEqual(original, fixed, 'deployed expression reconstructed');
  const f = load(fakeNet({}, {})), o = load(fakeNet({}, {}), original);
  const changed = ALLOW.concat(DENY).filter(a => f.addr(a) !== o.addr(a)).sort();
  assert.deepEqual(changed, ['192.0.1.5', '192.0.3.1', '192.0.66.108', '192.0.66.161', '192.2.1.1']);
});

test('NASA-style host on 192.0.66.x is fetched; DNS answers containing any private address are refused', async () => {
  const f = load(fakeNet({ 'vip.test': { status: 200, body: '<p>ok</p>' } }, { 'vip.test': '192.0.66.161', 'rebind.test': ['192.0.66.161', '10.0.0.7'] }));
  assert.equal((await f.get('https://vip.test/', { redirects: 4 })).ok, true);
  assert.match((await f.get('https://rebind.test/', { redirects: 4 })).error, /unsafe_destination/);
});

test('redirects to special-purpose or loopback addresses are still refused', async () => {
  const f = load(fakeNet({ 'r1.test': { status: 302, location: 'https://dummy.test/' }, 'r2.test': { status: 302, location: 'https://127.0.0.1/' }, 'r3.test': { status: 301, location: 'http://10.0.0.5/' } },
    { 'r1.test': '93.184.216.40', 'r2.test': '93.184.216.41', 'r3.test': '93.184.216.42', 'dummy.test': '192.0.0.8' }));
  for (const h of ['r1.test', 'r2.test', 'r3.test']) assert.match((await f.get('https://' + h + '/', { redirects: 4 })).error, /unsafe_destination/, h);
  assert.match((await f.get('https://db.internal/', { redirects: 4 })).error, /unsafe_destination/);
});

test('large pages: refused without allowTruncate, returned bounded with allowTruncate (evidence fetches)', async () => {
  const big = '<p>' + 'x'.repeat(2 * 1024 * 1024) + '</p>';
  const f = load(fakeNet({ 'big.test': { status: 200, body: big } }, { 'big.test': '93.184.216.50' }));
  const strict = await f.get('https://big.test/', { limit: 524288 });
  assert.equal(strict.ok, false); assert.equal(strict.error, 'response_too_large');
  const bounded = await f.get('https://big.test/', { limit: 1500000, allowTruncate: true });
  assert.equal(bounded.ok, true); assert.equal(bounded.truncated, true);
  assert.ok(Buffer.byteLength(bounded.html) <= 1500000, 'body never exceeds the limit');
  assert.ok(bounded.html.startsWith('<p>xxx'));
});
