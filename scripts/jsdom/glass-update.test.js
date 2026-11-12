/* Wspólna warstwa jest ładowana wyłącznie na stronach witryny. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const pages=['rejhub2/index','rejhub2/rejchat','rejhub2/rejclass','rejhub2/rejfile','rejhub2/rejsejf','rejhub2/rejtools','rejhub2/logowanie','rejhub2/profil','rejhub2/admin','rejhub2/partnerstwo','rejhub2/uslugi','rejhub2/licencja','rejhub2/konto-demo','rejhub2/404'];
for(const page of pages){const html=fs.readFileSync(path.join(root,page+'.html'),'utf8');assert.match(html,/<link rel="stylesheet" href="\/css\/glass-update\.css\?v=5">/,page);}
for(const page of [...pages,'rejson-widgets/index']){const html=fs.readFileSync(path.join(root,page+'.html'),'utf8');const matches=html.match(/<summary>Więcej <span class="rj-more-icon"[\s\S]*?<\/summary>/g)||[];assert.equal(matches.length,1,page+' menu Więcej');assert.ok(/class="rj-more-icon"/.test(matches[0]),page+' ikona Więcej');}
const css=fs.readFileSync(path.join(root,'css/glass-update.css'),'utf8');
assert.match(css,/prefers-reduced-motion:\s*reduce/);assert.match(css,/html\[data-theme="light"\]/);assert.match(css,/@supports\s*\(\(backdrop-filter/);
assert.match(fs.readFileSync(path.join(root,'rejson-widgets/index.html'),'utf8'),/glass-update\.css\?v=5/, 'wspólny nagłówek studia');
console.log('PASS: wspólne szkło na stronach witryny, motywy, fallback i ograniczenie ruchu');
