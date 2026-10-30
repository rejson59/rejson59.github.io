// RejFile API. Service role stays exclusively in this function, never in the browser.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE = SUPABASE_URL + '/storage/v1';
const BUCKET = 'rejfile';
const CHUNK = 10485760;
const MAX = 104857600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;
const CORS_ORIGINS = new Set(['https://rejson59.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
function headers(req) {
  const origin = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': CORS_ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
}
function reply(req, data, code = 200) { return new Response(JSON.stringify(data), { status:code, headers:headers(req) }); }
async function call(url, method, body) {
  const res = await fetch(url, { method, headers:{ apikey:SERVICE_KEY, Authorization:'Bearer ' + SERVICE_KEY, 'Content-Type':'application/json' }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Nie udało się połączyć z magazynem.');
  return data;
}
async function rpc(name, args = {}) { return await call(SUPABASE_URL + '/rest/v1/rpc/' + name, 'POST', args); }
function part(id, index) { return id + '/' + index; }
function validId(id) { return typeof id === 'string' && UUID.test(id); }
function validKey(key) { return typeof key === 'string' && HEX.test(key); }
function session(body) { return typeof body.session === 'string' && body.session.length <= 512 ? body.session : null; }
async function ipHash(req) {
  // Last address is appended by the trusted gateway, rather than the caller's first XFF value.
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SERVICE_KEY + ':rejfile:' + ip.slice(0,128)));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
}
async function getAccess(body) {
  if (!validId(body.id)) throw new Error('Plik jest niedostępny lub wygasł');
  return await rpc('rejfile_access', {p_id:body.id,p_share:validKey(body.share) ? body.share : null,p_owner:validKey(body.owner) ? body.owner : null,p_session:session(body)});
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:headers(req) });
  if (req.method !== 'POST') return reply(req,{error:'Niedozwolona metoda.'},405);
  try {
    if (Number(req.headers.get('content-length') || 0) > 16384) return reply(req,{error:'Zbyt duże żądanie.'},413);
    const text = await req.text(); if (text.length > 16384) return reply(req,{error:'Zbyt duże żądanie.'},413);
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Nieprawidłowe żądanie.');
    if (body.action === 'create') {
      if (!validKey(body.owner) || !Number.isSafeInteger(body.size) || Number(body.size) < 1 || Number(body.size) > MAX || typeof body.name !== 'string') throw new Error('Nieprawidłowy plik.');
      const recipient = typeof body.recipient === 'string' && body.recipient.trim() ? body.recipient.trim() : null;
      if (recipient && !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(recipient)) throw new Error('Nieprawidłowa nazwa odbiorcy.');
      if (!recipient && !validKey(body.share)) throw new Error('Nieprawidłowy link.');
      const result = await rpc('rejfile_create',{p_name:body.name,p_bytes:body.size,p_owner:body.owner,p_share:recipient ? null : body.share,p_session:session(body),p_recipient:recipient,p_ip:await ipHash(req)});
      if (!result || !validId(result.id) || !Number.isInteger(result.chunks) || result.chunks < 1 || result.chunks > 10) throw new Error('Nieprawidłowa odpowiedź magazynu.');
      const urls = [];
      for (let i=0; i<result.chunks; i++) {
        const signed = await call(STORAGE + '/object/upload/sign/' + BUCKET + '/' + part(result.id,i), 'POST', {});
        const url = new URL(STORAGE + signed.url);
        if (url.origin !== new URL(SUPABASE_URL).origin || !url.searchParams.has('token')) throw new Error('Nieprawidłowy adres przesyłania.');
        urls.push(url.href);
      }
      return reply(req,{id:result.id,chunkSize:CHUNK,urls});
    }
    if (body.action === 'finish') {
      if (!validId(body.id) || !validKey(body.owner)) throw new Error('Nieprawidłowe żądanie.');
      return reply(req,await rpc('rejfile_finish',{p_id:body.id,p_owner:body.owner}));
    }
    if (body.action === 'info') return reply(req,await getAccess(body));
    if (body.action === 'chunk') {
      const n = Number(body.index);
      if (!validId(body.id) || !Number.isInteger(n) || n < 0 || n > 9) throw new Error('Nieprawidłowa część pliku.');
      const info = await rpc('rejfile_sign_chunk', {p_id:body.id,p_share:validKey(body.share) ? body.share : null,p_owner:validKey(body.owner) ? body.owner : null,p_session:session(body),p_index:n,p_ip:await ipHash(req)});
      const left = Math.floor((new Date(info.expires_at).getTime() - Date.now()) / 1000);
      if (!Number.isFinite(left) || left < 1) throw new Error('Plik jest niedostępny lub wygasł');
      const signed = await call(STORAGE + '/object/sign/' + BUCKET + '/' + part(info.id,n),'POST',{expiresIn:Math.min(60,left)});
      const url = new URL(STORAGE + signed.signedURL);
      if (url.origin !== new URL(SUPABASE_URL).origin || !url.searchParams.has('token')) throw new Error('Nieprawidłowy adres pobierania.');
      return reply(req,{url:url.href});
    }
    if (body.action === 'inbox') {
      if (!session(body)) throw new Error('Zaloguj się do społeczności.');
      return reply(req,await rpc('rejfile_inbox',{p_session:session(body)}));
    }
    if (body.action === 'revoke') {
      if (!validId(body.id)) throw new Error('Nieprawidłowe żądanie.');
      return reply(req,{ok:await rpc('rejfile_revoke',{p_id:body.id,p_owner:validKey(body.owner) ? body.owner : null,p_session:session(body)})});
    }
    if (body.action === 'cleanup') {
      // This operation can ONLY remove already-expired or revoked files.
      const list = await rpc('rejfile_cleanup_list'); let removed = 0;
      for (const item of list) {
        if (!validId(item.id) || !Number.isInteger(item.chunks) || item.chunks < 1 || item.chunks > 10) continue;
        const paths = Array.from({length:item.chunks}, (_,i) => part(item.id,i));
        try { await call(STORAGE + '/object/' + BUCKET, 'DELETE', {prefixes:paths}); if (await rpc('rejfile_cleanup_done',{p_id:item.id})) removed++; }
        catch { /* zostaw rekord do następnej próby */ }
      }
      return reply(req,{removed});
    }
    return reply(req,{error:'Nieznane działanie.'},400);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe = /^(Nieprawidłow|Nie znaleziono odbiorcy|Plik |Przesyłanie wygasło|Nie wszystkie części|Dzienny limit|Limit miejsca|Wspólne miejsce|Brak uprawnień|Musisz być zalogowany|Sesja wygasła|Zaloguj się)/i.test(message);
    return reply(req,{error:safe ? message : 'Nie udało się wykonać operacji. Spróbuj ponownie.'},400);
  }
});
