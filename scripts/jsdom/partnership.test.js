/* Testy formularza i prywatnej skrzynki. Zachęta „✨ Twój profil. Twoje
   rozmowy.” została usunięta — pilnujemy, żeby nie wróciła. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const tick = () => new Promise(r => setTimeout(r,5));
(async () => {
  const dom = new JSDOM(read('partnerstwo.html'), {url:'https://rejson59.github.io/partnerstwo',runScripts:'outside-only'});
  const w=dom.window, d=w.document, form=d.getElementById('partner-form');
  let response={received:true}, calls=[];
  w.RejsonCloud={rpc:(fn,data,auth)=>{ calls.push({fn,data,auth}); return response instanceof Error ? Promise.reject(response) : Promise.resolve(response); }};
  w.eval(read('js/partnerstwo.js'));
  form.elements.namedItem('name').value='Partner';
  form.elements.namedItem('email').value='partner@example.org';
  form.elements.namedItem('kind').value='banner';
  form.elements.namedItem('message').value='Chcę omówić wspólną kampanię reklamową.';
  form.elements.namedItem('consent').checked=true;
  response=new Error('offline');
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.match(d.getElementById('partner-feedback').textContent,/Nie mogę potwierdzić wysłania/);
  assert.match(form.elements.namedItem('message').value,/kampanię/);
  assert.equal(calls[0].fn,'submit_partnership_inquiry');
  assert.equal(calls[0].auth,false);
  assert.equal(calls[0].data.p_consent,true);
  response={received:true};
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.match(d.getElementById('partner-feedback').textContent,/dotarła do panelu/);
  assert.equal(form.elements.namedItem('message').value,'');
  assert.ok(!read('partnerstwo.html').includes('view-tracker.js'));
  assert.match(read('sw.js'),/logowanie\|partnerstwo/);
  dom.window.close();

  const adm=new JSDOM('<div id="partner-admin-list"></div><button id="partner-admin-refresh"></button>',{url:'https://rejson59.github.io/admin',runScripts:'outside-only'});
  const a=adm.window, ad=a.document, adminCalls=[];
  const row={id:'test-id', name:'<img src=x onerror=alert(1)>', email:'p@example.org', message:'<script>evil()</script>', kind:'card', status:'new', created_at:'2026-10-29T12:00:00Z'};
  a.RejsonCloud={rpc:(fn,args,auth)=>{adminCalls.push({fn,args,auth}); return Promise.resolve(fn==='admin_partnership_inquiries'?[row]:true);}};
  a.eval(read('js/admin-partner.js')); await a.RJAdminPartner.load();
  assert.equal(adminCalls[0].auth,true);
  assert.equal(ad.querySelectorAll('img,script').length,0);
  assert.match(ad.getElementById('partner-admin-list').textContent,/<script>evil/);
  assert.match(ad.querySelector('a').href,/^mailto:/);
  ad.querySelector('button.btn').click(); await tick();
  assert.equal(adminCalls[1].fn,'admin_partnership_action');
  assert.equal(adminCalls[1].args.p_action,'read');
  adm.window.close();

  /* Wyskakujące okienko „✨ Twój profil. Twoje rozmowy.” zostało usunięte
     w całości: ani kodu, ani wywołania, ani zapisanej decyzji o zamknięciu. */
  const tracker=read('js/view-tracker.js');
  ['setupJoinNudge','join-nudge','JOIN_NUDGE','rejson_join_nudge','Twój profil. Twoje rozmowy']
    .forEach((needle) => assert.ok(!tracker.includes(needle), 'w trackerze zostało: ' + needle));
  assert.ok(!read('css/mobile-ads.css').includes('join-nudge'), 'CSS nie ma już reguły dla okienka');

  console.log('Partnerstwo i skrzynka — testy OK (bez okienka z profilami)');
})().catch(e=>{console.error(e);process.exitCode=1});
