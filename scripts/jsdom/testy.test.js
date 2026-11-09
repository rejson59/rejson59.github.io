const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'testy.html'),'utf8');
const gate=fs.readFileSync(path.join(root,'js/private-studio-gate.js'),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 assert(!html.includes('data-loader-card'));assert(!fs.existsSync(path.join(root,'css/testy.css')));assert(!fs.existsSync(path.join(root,'js/testy.js')));
 assert.match(html,/noindex,nofollow/);assert(html.includes('/admin'));
 let dom=new JSDOM(html,{url:'https://example.org/testy',runScripts:'outside-only'}),w=dom.window,calls=0;
 w.RejsonCloud={getStoredSession:()=>null,getAccessToken:()=>Promise.resolve(null)};w.fetch=()=>{calls++;throw Error('guest should not fetch')};w.eval(gate);assert.match(w.document.querySelector('#private-status').textContent,/Zaloguj/);assert.equal(calls,0);w.close();
 dom=new JSDOM(html,{url:'https://example.org/testy',runScripts:'outside-only'});w=dom.window;w.RejsonCloud={url:'https://example.org',anonKey:'anon',getStoredSession:()=>({access_token:'token'}),getAccessToken:()=>Promise.resolve('token')};
 w.fetch=()=>Promise.resolve({status:403,ok:false});w.eval(gate);await tick();assert.match(w.document.querySelector('#private-status').textContent,/tylko dla zalogowanego administratora/);assert(!w.document.querySelector('.studio'));w.close();
 dom=new JSDOM(html,{url:'https://example.org/testy',runScripts:'outside-only'});w=dom.window;w.RejsonCloud={url:'https://example.org',anonKey:'anon',getStoredSession:()=>({access_token:'token'}),getAccessToken:()=>Promise.resolve('token')};
 let args;w.fetch=(url,opts)=>{args=opts;return Promise.resolve({status:200,ok:true,json:()=>Promise.resolve({html:'<!doctype html><html><head><link rel="stylesheet" href="/css/testy.css?v=11"><script defer src="/js/testy.js?v=11"></script></head><body><main class="studio">private</main></body></html>',css:'body{color:red}',javascript:'window.test=1;'})})};w.eval(gate);await tick();assert.equal(args.cache,'no-store');assert.equal(args.credentials,'omit');assert.equal(w.document.querySelector('.studio').textContent,'private');w.close();
 console.log('PASS: publiczna bramka, gość i odmowa dostępu, prywatna odpowiedź oraz brak cache');
})().catch(e=>{console.error(e);process.exitCode=1});
