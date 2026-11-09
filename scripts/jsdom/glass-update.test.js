/* Wspólna warstwa jest ładowana wyłącznie na stronach witryny. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pages=['index','rejchat','rejclass','rejfile','rejsejf','rejtools','logowanie','profil','admin','tablica-pomyslow','partnerstwo','uslugi','widzety','konto-demo','404'];
for(const page of pages){const html=fs.readFileSync(path.join(root,page+'.html'),'utf8');assert.match(html,/<link rel="stylesheet" href="\/css\/glass-update\.css\?v=2">/,page);}
const css=fs.readFileSync(path.join(root,'css/glass-update.css'),'utf8');
assert.match(css,/prefers-reduced-motion:\s*reduce/);assert.match(css,/html\[data-theme="light"\]/);assert.match(css,/@supports\s*\(\(backdrop-filter/);
assert.match(fs.readFileSync(path.join(root,'rejson-widgets/index.html'),'utf8'),/glass-update\.css\?v=2/, 'wspólny nagłówek studia');
console.log('PASS: wspólne szkło na stronach witryny, motywy, fallback i ograniczenie ruchu');
