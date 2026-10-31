/* Strony usług, lokalne banery i ścieżka zapytania bez zewnętrznej sieci. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
assert.match(read('sw.js'),/partnerstwo\|uslugi\|rejfile/);
const home=new JSDOM(read('index.html')).window.document;
assert.equal(home.querySelector('.services-home a').getAttribute('href'),'uslugi');
assert.match(home.querySelector('.partner-home h2').textContent,/coś/);
assert.doesNotMatch(home.querySelector('.partner-home h2').textContent,/Masz projekt/);
const service=new JSDOM(read('uslugi.html'),{url:'https://rejson59.github.io/uslugi',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
assert.match(service.window.document.querySelector('h1').textContent,/stronę/);
assert.equal(service.window.document.querySelectorAll('a[href="partnerstwo?temat=strona#propozycja"]').length,2);
service.window.eval(read('js/uslugi.js'));const menu=service.window.document.getElementById('services-menu');menu.click();assert.equal(menu.getAttribute('aria-expanded'),'true');service.window.document.getElementById('services-theme').click();assert.equal(service.window.document.documentElement.dataset.theme,'light');service.window.close();
for(const file of ['index.html','partnerstwo.html','uslugi.html','rejchat.html','rejfile.html','tablica-pomyslow.html','widzety.html','404.html','admin.html','logowanie.html','profil.html','rejson-widgets/index.html']) {
 const dom=new JSDOM(read(file),{url:'https://rejson59.github.io/'+file,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const w=dom.window;w.sessionStorage.setItem('rj_side_ads_dismissed_v1','1');assert.ok(w.document.querySelector('script[src^="/js/side-ads.js"]'),file);assert.ok(w.document.querySelector('link[href^="/css/side-ads.css"]'),file);
 w.eval(read('js/side-ads.js'));w.eval(read('js/side-ads.js'));
 assert.equal(w.document.querySelectorAll('.rj-side-ads').length,1,file);
 assert.equal(w.document.querySelectorAll('.rj-side-ad').length,3,file);assert.equal(w.document.querySelectorAll('.rj-side-ad-icon svg[aria-hidden="true"]').length,3,file + ': dekoracyjne ikony');
 assert.equal(w.document.querySelectorAll('.rj-side-ad--offer[href="/partnerstwo#propozycja"]').length,1,file);
 assert.match(w.document.querySelector('.rj-side-ads-title').textContent,/mini reklamy i promocje/);assert.ok(w.document.querySelector('.rj-side-ad[href="/rejchat"]'));assert.ok(w.document.querySelector('.rj-side-ad[href="/rejfile"]'));
 assert.equal(w.document.querySelectorAll('.rj-side-ads button, .rj-side-ads-close').length,0,file + ': bez przycisku zamykania');
 assert.ok(w.document.body.classList.contains('rj-side-ads-enabled'));w.close();
}
const inquiry=new JSDOM(read('partnerstwo.html'),{url:'https://rejson59.github.io/partnerstwo?temat=strona#propozycja',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
const w=inquiry.window,form=w.document.getElementById('partner-form');let sent;
w.RejsonCloud={rpc:(name,data)=>{sent={name,data};return Promise.resolve({received:true});}};
w.eval(read('js/partnerstwo.js'));assert.equal(form.elements.namedItem('kind').value,'other');assert.match(form.elements.namedItem('message').value,/stworzeniu strony/);assert.match(w.document.querySelector('#form-title').textContent,/stronie/);assert.ok(w.document.querySelector('.partner-options').hidden);
form.elements.namedItem('name').value='Osoba';form.elements.namedItem('email').value='test@example.org';form.elements.namedItem('consent').checked=true;
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
setTimeout(()=>{try{assert.equal(sent.name,'submit_partnership_inquiry');assert.equal(sent.data.p_kind,'other');assert.equal(sent.data.p_website,null);assert.match(sent.data.p_message,/strony internetowej/);assert.match(w.document.querySelector('#partner-feedback').textContent,/dotarła/);w.close();console.log('PASS: usługi, kontakt, otwarta oferta reklamy i boczne banery');}catch(e){console.error(e);process.exitCode=1;}},15);
