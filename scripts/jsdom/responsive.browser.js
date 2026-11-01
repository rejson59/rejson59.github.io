/* Test responsywności i dostępności bez analizy zrzutów ekranu.
 * CHROME_BIN=/ścieżka/chromium node responsive.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-webgl']});
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function configure(context) {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/')) return route.continue();
      if (url.endsWith('/community_whoami')) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({username:'Tester'})});
      if (url.endsWith('/rejchat_get_profiles')) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify([{username:'Tester',avatar:'cat',color:'mint'}])});
      return route.abort();
    });
  }
  try {
    const context = await browser.newContext({viewport:{width:320,height:850}});
    await configure(context);
    const page = await context.newPage();
    const visit = async url => { await page.goto(origin + url, {waitUntil:'domcontentloaded'}); await page.evaluate(() => document.querySelector('#rj-page-loader')?.remove()); };
    await visit('/index.html');
    const toggle = page.locator('#metric-more-toggle');
    const panel = page.locator('#metric-more-panel');
    await toggle.waitFor({state:'visible'});
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.locator('#site-total-online-badge').isVisible(), true);
    assert.equal(await page.locator('.mobile-account').isVisible(), true);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await panel.isVisible(), true);
    assert.equal(await page.locator('#site-views-badge').isVisible(), true);
    assert.equal(await page.locator('#site-unique-badge').isVisible(), true);
    const bounds = await panel.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'panel liczników mieści się na ekranie');
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await toggle.evaluate(el => document.activeElement === el),true);
    await toggle.click();
    await page.locator('h1').click();
    assert.equal(await panel.isVisible(), false);
    await toggle.click();
    await page.setViewportSize({width:800,height:850});
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#site-views-badge').isVisible(),true);
    assert.equal(await toggle.isVisible(),false);
    let geometry = await page.locator('.showcase-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(geometry,2,'tablet: dwa słupki projektów');
    assert.equal(await page.locator('#rj-club .rj-premium').isVisible(),true);
    assert.equal(await page.locator('#rj-mobile-ads').isVisible(),true);
    assert.equal(await page.locator('#rj-club .rj-premium__glow').evaluate(el => getComputedStyle(el).animationName),'rj-premium-sweep');
    assert.equal(await page.locator('#rj-club .rj-premium__sheen').evaluate(el => getComputedStyle(el).animationName),'rj-premium-sheen');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#rj-club .rj-premium__sheen').evaluate(el => getComputedStyle(el).animationName),'rj-premium-sheen');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for (const width of [320,375,560,640,760,1024]) {
      await page.setViewportSize({width,height:850});
      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.origins .project-card')];
        const preview = cards.map(c => {
          const el = c.querySelector('.card-preview'), r = el.getBoundingClientRect();
          return {width:r.width,height:r.height,iframe:!!el.querySelector('iframe[data-card-preview]'),portal:el.getAttribute('data-journey') !== null,
            tilt:c.hasAttribute('data-tilt'), dates:c.querySelector('.card-meta')?.textContent || '', button:!!c.querySelector('.btn-journey[data-journey][target="_blank"]')};
        });
        const header = [...document.querySelectorAll('.site-header .brand,.site-header .rj-home-link,.site-header .mobile-account,.site-header .rj-bell,.site-header .metric-badge,.site-header .metric-more-toggle,.site-header .hamburger-btn')].filter(el => el.getClientRects().length).map(el => {const r=el.getBoundingClientRect();return {name:el.className, left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
        return {preview,scroll:document.documentElement.scrollWidth,header};
      });
      assert(result.scroll <= width, `${width}: poziome przewijanie`);
      assert(result.preview.length >= 5);
      for (const p of result.preview) {
        assert(p.iframe && p.portal && p.tilt && p.button, `${width}: podgląd, portal i 3D`);
        assert.match(p.dates,/Utworzono:/); assert.match(p.dates,/Aktualizacja:/);
        if (width <= 760) assert(Math.abs(p.width / p.height - (width <= 640 ? 2 : 16/9)) < .03, `${width}: kompaktowy podgląd ${JSON.stringify(p)}`);
      }
      for (let i=0;i<result.header.length;i++) for (let j=i+1;j<result.header.length;j++) {
        const a=result.header[i], b=result.header[j];
        assert(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1), `${width}: nakładające się elementy ${a.name} i ${b.name}`);
      }
    }
    await page.setViewportSize({width:1440,height:850});
    await page.locator('#nav-more summary').click();
    assert.equal(await page.locator('#nav-more').evaluate(el => el.open),true);
    for (const href of ['partnerstwo','widzety','https://github.com/rejson59']) assert.equal(await page.locator('#nav-more a[href="'+href+'"]').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#nav-more').evaluate(el => el.open),false);
    await page.locator('#nav-more summary').click();
    await page.locator('h1').click();
    assert.equal(await page.locator('#nav-more').evaluate(el => el.open),false);
    await page.setViewportSize({width:375,height:850});
    await page.locator('#menu-toggle').click();
    await page.locator('#nav-more summary').click();
    assert.equal(await page.locator('#nav-more a[href="partnerstwo"]').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#nav-more').evaluate(el => el.open),false);
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#nav-more summary').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
    await visit('/rejchat.html');
    assert.equal(await page.locator('#panel-chat').isVisible(), true);
    await page.locator('#posts-tab').click();
    assert.equal(await page.locator('#panel-posts').isVisible(), true);
    await page.locator('#chat-tab').click();
    assert.equal(await page.locator('#panel-chat').isVisible(), true);
    await visit('/rejfile.html');
    assert.equal(await page.locator('#file-input').getAttribute('type'),'file');
    assert.equal(await page.locator('#dropzone').isVisible(),true);
    await context.close();

    const logged = await browser.newContext({viewport:{width:320,height:850}});
    await configure(logged);
    await logged.addInitScript(() => localStorage.setItem('rejson_community_session_v1', JSON.stringify({username:'Tester',token:'0123456789abcdef0123456789abcdef'})));
    const lp = await logged.newPage();
    for (const url of ['/index.html','/rejchat.html','/widzety.html','/partnerstwo.html','/tablica-pomyslow.html']) {
      await lp.goto(origin + url,{waitUntil:'domcontentloaded'});
      await lp.locator('.rj-header-profile').waitFor({state:'visible'});
      assert.equal(await lp.locator('header a[href$="logowanie"]').filter({visible:true}).count(),0,`${url}: konto nie jest zdublowane`);
      assert((await lp.evaluate(() => document.documentElement.scrollWidth)) <= 320, `${url}: zalogowany nagłówek nie przepełnia strony`);
    }
    await logged.close();
    const nojs = await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:850}});
    await configure(nojs);
    const np = await nojs.newPage();
    await np.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    assert.equal(await np.locator('#site-views-badge').isVisible(),true,'fallback bez JS');
    assert.equal(await np.locator('#site-unique-badge').isVisible(),true,'fallback bez JS');
    assert((await np.evaluate(() => document.documentElement.scrollWidth)) <= 320,'fallback bez przewijania poziomego');
    await nojs.close();
    console.log('PASS: liczniki, klawiatura, sesja, telefon/tablet, podglądy, podróże, daty, 3D i animacja premium');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });
