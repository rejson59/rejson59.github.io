const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'rejhub2/rejclass.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/rejclass-countdown.js'), 'utf8');
const english = Date.parse('2026-11-09T10:10:00Z'); // 11:10 w Polsce, CET
const biology = Date.parse('2026-11-10T08:20:00Z'); // 9:20 w Polsce, CET
function setup(now) {
  const dom = new JSDOM(html, { url: 'https://rejson59.github.io/rejclass', runScripts: 'outside-only' });
  const w = dom.window, d = w.document; let current = now, next = 0; const timers = new Map();
  Object.defineProperty(d, 'visibilityState', {value: 'visible', configurable: true});
  w.Date.now = () => current;
  w.setTimeout = (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.eval(source);
  return { w, d, timers, setNow: time => { current = time; }, tick() { const entry = [...timers.entries()][0]; assert(entry, 'Zaplanowany timer'); timers.delete(entry[0]); entry[1].fn(); } };
}
function values(d, prefix='countdown') { return ['days', 'hours', 'minutes', 'seconds'].map(x => d.getElementById(prefix + '-' + x).textContent); }
let { w, d, timers, setNow, tick } = setup(english - 93784000);
assert.equal(Date.parse(d.getElementById('countdown-date').dateTime), english);
assert.equal(Date.parse(d.getElementById('bio-countdown-date').dateTime), biology);
assert.deepEqual(values(d), ['01','02','03','04']);
assert.equal(d.getElementById('countdown-clock').hidden, false);
assert.equal(d.getElementById('bio-countdown-clock').hidden, false);
assert.equal(timers.size, 1);
setNow(english - 93783000); tick(); assert.deepEqual(values(d), ['01','02','03','03']);
// Spóźniony tick odczytuje zegar ponownie, nie zgubi czasu w tle.
setNow(english - 1001); tick(); assert.deepEqual(values(d), ['00','00','00','02']); assert.equal([...timers.values()][0].delay, 1);
setNow(english - 1000); tick(); assert.deepEqual(values(d), ['00','00','00','01']);
setNow(english - 1); d.dispatchEvent(new w.Event('visibilitychange')); assert.deepEqual(values(d), ['00','00','00','01']);
setNow(english); tick(); assert.equal(d.getElementById('countdown-clock').hidden, true); assert.match(d.getElementById('countdown-status').textContent, /rozpoczęła się/); assert.equal(timers.size, 1);
setNow(biology - 93784000); w.dispatchEvent(new w.Event('pageshow')); assert.deepEqual(values(d,'bio-countdown'), ['01','02','03','04']);
setNow(biology - 1001); tick(); assert.deepEqual(values(d,'bio-countdown'), ['00','00','00','02']); assert.equal([...timers.values()][0].delay,1);
setNow(biology - 1); d.dispatchEvent(new w.Event('visibilitychange')); assert.deepEqual(values(d,'bio-countdown'), ['00','00','00','01']);
setNow(biology); tick(); assert.equal(d.getElementById('bio-countdown-clock').hidden,true); assert.match(d.getElementById('bio-countdown-status').textContent,/rozpoczęła/); assert.equal(timers.size,0);
w.close();
({w,d,timers} = setup(biology + 5000)); assert.equal(d.getElementById('countdown-clock').hidden,true); assert.equal(d.getElementById('bio-countdown-clock').hidden,true); assert.equal(timers.size,0); w.close();
console.log('PASS: angielski i biologia, czas polski, sekundy, brak dryfu, wznowienie i zakończenie');
