/* Testuje wyłącznie dwa nowe, jawnie nazwane konta testowe.
 * Po uruchomieniu administrator usuwa oba konta przez bazę. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const name=process.env.TEST_USERNAME;
if (!/^rjtest[a-z0-9]{6,12}$/.test(name || '')) throw new Error('Wymagana unikalna nazwa testowa rjtest…');
const key=readFileSync('js/community.js','utf8').match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)[0];
const base='https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/';
async function rpc(fn, body, extra={}) {
  const res=await fetch(base+'rpc/'+fn,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  const data=await res.json();
  return {status:res.status,data};
}
const legacy=await rpc('community_register',{p_username:name,p_pin:'6327'});
assert.equal(legacy.status,200,JSON.stringify(legacy.data));
assert.ok(legacy.data.token);
const token=legacy.data.token;
assert.equal((await rpc('community_password_status',{p_token:token})).data.has_password,false);
assert.equal((await rpc('community_login',{p_username:name,p_pin:'6327'})).status,200);
assert.equal((await rpc('community_set_password',{p_token:token,p_current_secret:'0000',p_new_password:'BezpieczneHasloTestowe!'})).status,401);
assert.equal((await rpc('community_set_password',{p_token:token,p_current_secret:'6327',p_new_password:'BezpieczneHasloTestowe!'})).data.ok,true);
assert.equal((await rpc('community_password_status',{p_token:token})).data.has_password,true);
assert.equal((await rpc('community_whoami',{p_token:token})).data.username,name);
assert.equal((await rpc('community_login',{p_username:name,p_pin:'6327'})).status,401);
assert.equal((await rpc('community_login',{p_username:name,p_pin:'BezpieczneHasloTestowe!'})).status,200);
const second=await rpc('community_register',{p_username:name+'b',p_pin:'DrugieHasloTestowe!'});
assert.equal(second.status,200,JSON.stringify(second.data));
assert.equal((await rpc('community_login',{p_username:name+'b',p_pin:'DrugieHasloTestowe!'})).status,200);
const rollback=await rpc('community_login',{p_username:name,p_pin:'zle-haslo'}, {Prefer:'tx=rollback'});
assert.notEqual(rollback.status,200,'rollback nie może umożliwić pominięcia limitu');
for(let i=0;i<5;i++) assert.equal((await rpc('community_login',{p_username:name,p_pin:'zle-haslo'})).status,401);
assert.equal((await rpc('community_login',{p_username:name,p_pin:'BezpieczneHasloTestowe!'})).status,429);
const table=await fetch(base+'community_login_attempts?select=*',{headers:{apikey:key,Authorization:'Bearer '+key}});
assert.notEqual(table.status,200,'anon nie ma dostępu do tabeli ograniczeń');
console.log('PASS: konta',name,'i',name+'b','— starszy PIN, migracja, hasło, sesje i limit HTTP');
