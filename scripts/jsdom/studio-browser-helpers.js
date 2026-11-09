const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');
async function setup(){
 if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
 const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u==='/testy')u='/testy.html';const f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});
 async function context(options={}){const c=await browser.newContext({viewport:{width:1500,height:1000},serviceWorkers:'block',...options});await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());return c;}
 async function close(){await browser.close();await new Promise(r=>server.close(r));}
 return {origin,browser,context,close};
}
module.exports={setup};
