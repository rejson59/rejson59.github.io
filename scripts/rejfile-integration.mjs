// Opt-in live smoke test. Uploads/downloads 100 MiB and revokes it afterwards.
import { randomBytes, createHash } from 'node:crypto';
const base='https://hzbqzfimtroixnldzjeq.supabase.co';
const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhcm9sZSI6InN1cGFiYXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
const owner=randomBytes(32).toString('hex'), share=randomBytes(32).toString('hex'), bytes=104857600, chunk=10485760;
let id;
async function api(action, fields={}) {const r=await fetch(base+'/functions/v1/rejfile',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});const data=await r.json();if(!r.ok)throw new Error(action+': '+(data.error||r.status));return data;}
try {
 const init=await api('create',{name:'rejfile-test-100mb.bin',size:bytes,owner,share});id=init.id;
 if(init.chunkSize!==chunk || init.urls.length!==10)throw new Error('Niepoprawne podzielenie pliku 100 MiB');
 const hashes=[];
 for(let i=0;i<10;i++) {const data=Buffer.alloc(chunk,i+1);hashes.push(createHash('sha256').update(data).digest('hex'));const res=await fetch(init.urls[i],{method:'PUT',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/octet-stream'},body:data});if(!res.ok)throw new Error('Błąd wysyłania części '+i+': '+res.status);}
 const done=await api('finish',{id,owner});if(!done.expires_at)throw new Error('Brak terminu ważności');
 let denied=false;try{await api('info',{id,share:randomBytes(32).toString('hex')});}catch{denied=true;}if(!denied)throw new Error('Błędny klucz nie został odrzucony');
 const info=await api('info',{id,share});if(info.size!==bytes||info.chunks!==10)throw new Error('Niepoprawne metadane');
 for(let i=0;i<10;i++){const signed=await api('chunk',{id,share,index:i});const response=await fetch(signed.url);if(!response.ok)throw new Error('Błąd pobierania części '+i+': '+response.status);const got=Buffer.from(await response.arrayBuffer());if(got.length!==chunk||createHash('sha256').update(got).digest('hex')!==hashes[i])throw new Error('Niezgodna część '+i);}
 await api('revoke',{id,owner});let revoked=false;try{await api('info',{id,share});}catch{revoked=true;}if(!revoked)throw new Error('Dostęp nie został cofnięty');
 console.log('PASS: prawdziwy upload/download 100 MiB, integralność, błędny klucz i cofnięcie dostępu');
} finally { if(id) await api('revoke',{id,owner}).catch(()=>{}); }
