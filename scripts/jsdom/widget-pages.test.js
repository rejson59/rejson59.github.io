/* Coverage, rendering and privacy checks; no real network or submitted reports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const widget = read('rejson-widgets/widget.js');
const media = read('js/media-capture.js');
const pages = ['index.html','404.html','admin.html','logowanie.html','partnerstwo.html','uslugi.html','profil.html','rejchat.html','rejfile.html','tablica-pomyslow.html','widzety.html','rejson-widgets/index.html'];
const wait = () => new Promise(resolve => setTimeout(resolve, 30));
async function main() {
  for (const page of pages) {
    const html = read(page);
    const dom = new JSDOM(html, { url: 'https://rejson59.github.io/' + page, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole: new VirtualConsole() });
    const w = dom.window;
    const scripts = [...w.document.querySelectorAll('script[src]')];
    assert.equal(scripts.filter(s => /(?:^|\/)widget\.js(?:\?|$)/.test(s.getAttribute('src'))).length, 1, page + ' widget once');
    assert.equal(scripts.filter(s => /(?:^|\/)media-capture\.js(?:\?|$)/.test(s.getAttribute('src'))).length, 1, page + ' media once');
    const mediaIndex = scripts.findIndex(s => /media-capture\.js/.test(s.getAttribute('src')));
    const widgetIndex = scripts.findIndex(s => /(?:^|\/)widget\.js(?:\?|$)/.test(s.getAttribute('src')));
    assert.ok(mediaIndex < widgetIndex, page + ' media before widget');
    w.fetch = async () => ({ ok:true, json: async () => [] });
    w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
    w.eval(media); w.eval(widget);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await wait();
    const host = w.document.getElementById('rejson-liquid-widget-root');
    assert.ok(host && host.shadowRoot.querySelector('.rj-closed'), page + ' pill mounted');
    w.RejsonWidget.open();
    assert.ok(host.shadowRoot.querySelector('#rj-min-form'), page + ' form opens');
    assert.ok(w.RJMedia && host.shadowRoot.querySelector('[data-rj-dom]'), page + ' attachment controls');
    w.RejsonWidget.destroy(); dom.window.close();
  }
  console.log(`PASS: pigułka i załączniki na ${pages.length} dokumentach`);

  const dom = new JSDOM('<!doctype html><html><body><div data-rj-private id="private">tajne dane</div><input id="name" value="osobiste"><input id="pin" type="password" value="sekret"><textarea id="message">prywatne</textarea><select id="select"><option>prywatne</option></select><div contenteditable id="edit">prywatne</div><p id="public">public</p></body></html>', {url:'https://rejson59.github.io/rejfile?secret=query#f=secret',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w = dom.window; w.matchMedia = () => ({ matches:false });
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  let body;
  w.fetch = async (url,init={}) => {
    if (String(url).includes('submit_feedback')) body=JSON.parse(init.body);
    return {ok:true,json:async()=>String(url).includes('submit_feedback') ? { id:'test' } : []};
  };
  w.eval(media);
  let clone;
  w.html2canvas = async (_el, opts) => {
    clone = w.document.cloneNode(true); opts.onclone(clone);
    return {toBlob: fn => fn(new w.Blob(['image'],{type:'image/jpeg'}))};
  };
  await w.RJMedia.captureDom();
  for (const id of ['private','name','pin','message','select','edit']) {
    assert.equal(clone.getElementById(id).style.getPropertyValue('display'), 'none', `${id} hidden in copy`);
    assert.notEqual(w.document.getElementById(id).style.getPropertyValue('display'), 'none', `${id} original remains untouched`);
  }
  assert.notEqual(clone.getElementById('public').style.display, 'none');
  w.eval(widget); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await wait();
  w.RejsonWidget.captureError('secret password and sensitive link');
  w.RejsonWidget.open();
  const shadow = w.document.getElementById('rejson-liquid-widget-root').shadowRoot;
  const text = shadow.querySelector('#rj-msg-in'); text.value = 'Przykładowy błąd'; text.dispatchEvent(new w.Event('input',{bubbles:true}));
  shadow.querySelector('#rj-min-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(); assert.ok(body,'formularz wysłał zgłoszenie do mocka');
  assert.equal(body.p_page_url, 'https://rejson59.github.io/rejfile');
  assert.ok(!JSON.stringify(body.p_diagnostics).includes('secret'));
  assert.ok(JSON.stringify(body.p_diagnostics).includes('Liczba błędów'));
  w.RejsonWidget.destroy(); w.close();
  console.log('PASS: URL bez sekretów; migawka bez pól i oznaczonych obszarów; diagnostyka bez treści błędów');

  const listeners = {};
  let pageHtml = '<html><head></head><body><!-- rejson-widgets/widget.js --></body></html>';
  const mockFetch = async req => typeof req === 'string' ? new Response('{}') : new Response(pageHtml, {status:200,headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"}});
  const context = {self:{location:{origin:'https://rejson59.github.io'},addEventListener:(event,fn)=>listeners[event]=fn,skipWaiting(){},clients:{claim(){}}}, fetch:mockFetch,URL,Response,Headers,Date,Promise,console};
  vm.runInNewContext(read('sw.js'), context);
  async function response() {
    let result; const event={request:{method:'GET',mode:'navigate',destination:'document',url:'https://rejson59.github.io/MyProject/'},waitUntil(){},respondWith(p){result=p;}};
    listeners.fetch(event); assert.ok(result); return result;
  }
  let res = await response(), html = await res.text();
  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js\?v=12"/g)||[]).length,1);
  assert.equal((html.match(/src="\/js\/media-capture\.js\?v=2"/g)||[]).length,1);
  assert.equal((html.match(/src="\/js\/mobile-ads\.js\?v=4"/g)||[]).length,1);
  assert.equal(res.headers.get('content-security-policy'),"default-src 'self'");
  pageHtml='<html><head></head><body><script src="/js/media-capture.js?v=1"></script><script src="/rejson-widgets/widget.js?v=8"></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js\?v=12"/g)||[]).length,1);
  assert.equal((html.match(/src="\/js\/media-capture\.js\?v=2"/g)||[]).length,1);
  pageHtml='<html><head></head><body><script src="/rejson-widgets/widget.js?v=10"></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js\?v=12"/g)||[]).length,1,'aktualizuje pigułkę v10');
  pageHtml='<html><head></head><body><script src="/rejson-widgets/widget.js?v=11"></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js\?v=12"/g)||[]).length,1,'aktualizuje v11 bez duplikatu');
  pageHtml='<html><head></head><body><script src="/rejson-widgets/widget.js?v=12"></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js\?v=12"/g)||[]).length,1,'nie duplikuje bieżącej wersji');
  pageHtml='<html><head><link rel="stylesheet" href="/css/mobile-ads.css?v=1"></head><body><script src="/js/mobile-ads.js?v=1" defer></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/js\/mobile-ads\.js\?v=4"/g)||[]).length,1,'aktualizuje skrypt bez duplikatu');
  assert.equal((html.match(/href="\/css\/mobile-ads\.css\?v=4"/g)||[]).length,1,'aktualizuje arkusz');
  pageHtml='<html><head><link rel="stylesheet" href="/css/mobile-ads.css?v=3"></head><body><script src="/js/mobile-ads.js?v=3" defer></script></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/js\/mobile-ads\.js\?v=4"/g)||[]).length,1,'aktualizuje v3');
  assert.equal((html.match(/href="\/css\/mobile-ads\.css\?v=4"/g)||[]).length,1,'aktualizuje arkusz v3');
  pageHtml='<html><head><link rel="stylesheet" href="/css/portal.css?v=12" data-rj-portal-style><script src="/js/portal-arrival.js?v=11"></script></head><body></body></html>';
  res=await response(); html=await res.text();
  assert.equal((html.match(/src="\/js\/portal-arrival\.js\?v=16"/g)||[]).length,1);
  assert.equal((html.match(/href="\/css\/portal\.css\?v=17"/g)||[]).length,1);
  let handled=false; listeners.fetch({request:{method:'GET',mode:'navigate',destination:'document',url:'https://rejson59.github.io/podroz/?projekt=Test'},waitUntil(){handled=true;},respondWith(){handled=true;}});
  assert.equal(handled,false,'przejściowa podróż nie jest rejestrowana jako projekt');
  console.log('PASS: service worker dodaje/aktualizuje skrypty bez duplikatu i nie osłabia CSP');
}
main().catch(err => {console.error(err);process.exitCode=1;});
