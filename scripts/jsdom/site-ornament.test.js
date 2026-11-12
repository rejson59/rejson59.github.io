/* Dekoracje witryny nie powinny wprowadzać nieuzgodnionego znaczka. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    if (entry.isDirectory() && ['.git', 'node_modules', 'vendor'].includes(entry.name)) return [];
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? files(p) : /\.(html|css|js|svg)$/i.test(entry.name) && !p.includes(`${path.sep}scripts${path.sep}`) ? [p] : [];
  });
}
const mark = String.fromCodePoint(0x2733);
for (const f of files(root)) {
  const text = fs.readFileSync(f, 'utf8');
  assert(!text.includes(mark) && !/&#(?:10035|x2733);|\\u2733|\\2733/i.test(text), `Dekoracja w ${path.relative(root,f)}`);
}
const page = fs.readFileSync(path.join(root,'rejhub2/rejchat.html'),'utf8');
assert(!page.includes('rc-chat-guide'));
assert(page.includes('Odczyty i reakcje'), 'RejChat nadal informuje o odczytach i reakcjach');
assert(!page.includes('rc-dm-privacy') && !page.includes('O prywatności'), 'brak przycisku „O prywatności”');
console.log('PASS: brak znaczka w dekoracjach stron, brak przycisku Prywatność i zachowane ważne informacje');
