# Podgląd zmian: mconline

Wyłącznie do czytania; pełne pliki i ich sumy są w planie.

```diff
--- /dev/null
+++ b/.harness/account.tsx
@@ -0,0 +1,140 @@
+/** Offline tests of the account transport and actual form; no real accounts. */
+import assert from 'node:assert/strict';
+const cases: Array<{ name: string; run: () => void | Promise<void> }> = [];
+const test = (name: string, run: () => void | Promise<void>) => { cases.push({ name, run }); };
+import { act } from 'react';
+import { JSDOM } from 'jsdom';
+import { authenticateCommunity, COMMUNITY_SESSION_KEY, readCommunitySession, validCredentials, verifyCommunitySession } from '../src/game/communityAccount';
+
+const token = 'a'.repeat(48);
+const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
+test('PIN only for old accounts, registration requires a password with correct UTF-8 limits', () => {
+  assert.equal(validCredentials('login', 'Rejson', '1234'), true);
+  assert.equal(validCredentials('register', 'Rejson', '1234'), false);
+  assert.equal(validCredentials('register', 'Rejson', 'Poprawne hasło!'), true);
+  assert.equal(validCredentials('register', 'Rejson', 'ą'.repeat(37)), false);
+  assert.equal(validCredentials('login', '../../bad', '1234'), false);
+});
+test('login and registration call the existing RPC and verify identity without URL secrets', async () => {
+  for (const mode of ['login', 'register'] as const) {
+    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
+    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
+      const text = String(url); const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
+      assert.ok(!text.includes(token) && !text.includes('Haslo-bardzo-dlugie'));
+      seen.push({ url: text, body });
+      return text.endsWith('community_whoami') ? json({ username: 'Rejson' }) : json({ token, username: 'forged' });
+    };
+    const result = await authenticateCommunity(mode, '  Rejson ', 'Haslo-bardzo-dlugie', fetcher as typeof fetch);
+    assert.deepEqual(result, { token, username: 'Rejson' });
+    assert.equal(seen[0].url.endsWith(mode === 'login' ? 'community_login' : 'community_register'), true);
+    assert.deepEqual(seen[0].body, { p_username: 'Rejson', p_pin: 'Haslo-bardzo-dlugie' });
+    assert.deepEqual(seen[1].body, { p_token: token });
+  }
+});
+test('errors and invalid sessions do not masquerade as an authenticated user', async () => {
+  const failed = (async () => json({ message: 'Nieprawidłowa nazwa lub hasło / PIN.' }, 401)) as typeof fetch;
+  await assert.rejects(authenticateCommunity('login', 'Rejson', '1234', failed), /Nieprawidłowa/);
+  assert.equal(await verifyCommunitySession({ token, username: 'forged' }, (async () => json({ username: null })) as typeof fetch), null);
+  const offline = (async () => { throw new Error('offline'); }) as typeof fetch;
+  await assert.rejects(verifyCommunitySession({ token, username: 'forged' }, offline), /Nie udało się połączyć/);
+  let n = 0;
+  const partial = (async () => ++n === 1 ? json({ token, username: 'Rejson' }) : json({}, 503)) as typeof fetch;
+  await assert.rejects(authenticateCommunity('register', 'Rejson', 'Password long enough', partial), /Konto utworzono/);
+});
+test('the game menu opens an optional in-place login, verifies it and leaves worlds untouched', async () => {
+  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://rejson59.github.io/mconline/', pretendToBeVisual: true });
+  const w = dom.window;
+  const g = globalThis as unknown as Record<string, unknown>;
+  for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLCanvasElement','Element','Node','Event','MouseEvent','KeyboardEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage','matchMedia']) {
+    if (key in w) Object.defineProperty(g, key, { value: (w as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
+  }
+  g.IS_REACT_ACT_ENVIRONMENT = true;
+  const originalFetch = globalThis.fetch;
+  globalThis.fetch = (async (url: string | URL | Request) => String(url).endsWith('community_whoami') ? json({ username: 'Rejson' }) : json({ token, username: 'Rejson' })) as typeof fetch;
+  w.localStorage.setItem('blockcraft-saves-v2', '[{"id":"world1","seed":42}]');
+  w.localStorage.setItem('blockcraft-profile-v1', 'p1234567890123456789');
+  const { createRoot } = await import('react-dom/client');
+  const App = (await import('../src/App')).default;
+  const container = w.document.getElementById('root')!;
+  const root = createRoot(container);
+  try {
+    await act(async () => { root.render(<App />); });
+    const accountButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Konto Rejson'));
+    assert.ok(accountButton, 'konto dostępne w menu bez zakładania konta');
+    await act(async () => { accountButton.click(); });
+    const dialog = container.querySelector('[role="dialog"][aria-labelledby="community-title"]');
+    assert.ok(dialog);
+    assert.match(dialog.textContent || '', /światy|Światy/);
+    const fields = [...dialog.querySelectorAll('input')];
+    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')!.set!;
+    await act(async () => { setter.call(fields[0], 'Rejson'); fields[0].dispatchEvent(new w.Event('input', { bubbles: true })); });
+    await act(async () => { setter.call(fields[1], '1234'); fields[1].dispatchEvent(new w.Event('input', { bubbles: true })); });
+    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
+    assert.match(dialog.textContent || '', /Zalogowano jako/);
+    assert.equal(readCommunitySession(w.localStorage)?.username, 'Rejson');
+    assert.ok(!w.localStorage.getItem(COMMUNITY_SESSION_KEY)?.includes('1234'));
+    assert.equal(w.localStorage.getItem('blockcraft-saves-v2'), '[{"id":"world1","seed":42}]');
+    assert.equal(w.localStorage.getItem('blockcraft-profile-v1'), 'p1234567890123456789');
+    const logout = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Wyloguj na tym urządzeniu'))!;
+    await act(async () => { logout.click(); });
+    assert.equal(w.localStorage.getItem(COMMUNITY_SESSION_KEY), null);
+    const registerMode = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Utwórz konto')!;
+    await act(async () => { registerMode.click(); });
+    const reg = [...dialog.querySelectorAll('input')];
+    for (const [input, value] of [[reg[0], 'Rejson'], [reg[1], 'haslo co najmniej 10 znakow'], [reg[2], 'haslo co najmniej 10 znakow']] as const) {
+      await act(async () => { setter.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); });
+    }
+    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
+    assert.match(dialog.textContent || '', /Zalogowano jako/);
+    assert.ok(!w.localStorage.getItem(COMMUNITY_SESSION_KEY)?.includes('haslo co najmniej'));
+    assert.equal(w.localStorage.getItem('blockcraft-saves-v2'), '[{"id":"world1","seed":42}]');
+    await act(async () => { dialog.querySelector<HTMLButtonElement>('button[aria-label="Zamknij konto"]')!.click(); });
+    assert.equal(container.querySelector('[aria-labelledby="community-title"]'), null);
+  } finally {
+    await act(async () => { root.unmount(); });
+    globalThis.fetch = originalFetch; dom.window.close();
+  }
+});
+
+test('late identity response cannot replace a newer shared session', async () => {
+  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://rejson59.github.io/mconline/', pretendToBeVisual: true });
+  const w = dom.window;
+  const g = globalThis as unknown as Record<string, unknown>;
+  for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent','KeyboardEvent','localStorage']) {
+    if (key in w) Object.defineProperty(g, key, { value: (w as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
+  }
+  g.IS_REACT_ACT_ENVIRONMENT = true;
+  const first = 'a'.repeat(48), second = 'b'.repeat(48);
+  w.localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify({ token: first, username: 'untrusted' }));
+  let finishFirst: (r: Response) => void = () => {};
+  const originalFetch = globalThis.fetch;
+  globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
+    const req = JSON.parse(String(init?.body)) as { p_token: string };
+    if (req.p_token === first) return new Promise<Response>((resolve) => { finishFirst = resolve; });
+    return json({ username: 'NoweKonto' });
+  }) as typeof fetch;
+  const { createRoot } = await import('react-dom/client');
+  const Account = (await import('../src/components/CommunityAccount')).default;
+  const container = w.document.getElementById('root')!;
+  const root = createRoot(container);
+  try {
+    await act(async () => { root.render(<Account onClose={() => {}} />); });
+    await act(async () => {
+      w.localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify({ token: second, username: 'forged' }));
+      w.dispatchEvent(new w.StorageEvent('storage', { key: COMMUNITY_SESSION_KEY, newValue: w.localStorage.getItem(COMMUNITY_SESSION_KEY) }));
+      await new Promise((resolve) => setTimeout(resolve, 10));
+    });
+    await act(async () => { finishFirst(json({ username: 'StareKonto' })); await new Promise((resolve) => setTimeout(resolve, 10)); });
+    assert.match(container.textContent || '', /NoweKonto/);
+    assert.doesNotMatch(container.textContent || '', /StareKonto/);
+    assert.equal(readCommunitySession(w.localStorage)?.token, second);
+  } finally { await act(async () => { root.unmount(); }); globalThis.fetch = originalFetch; w.close(); }
+});
+
+let failures = 0;
+for (const item of cases) {
+  try { await item.run(); console.log(`✓ ${item.name}`); }
+  catch (error) { failures++; console.error(`✗ ${item.name}`, error); }
+}
+console.log(`${cases.length - failures}/${cases.length} account checks passed`);
+process.exit(failures ? 1 : 0);
--- a/.harness/run.mjs
+++ b/.harness/run.mjs
@@ -25,6 +25,7 @@
 const SUITES = [
   { name: 'smoke', entry: path.join(here, 'smoke.ts'), label: 'Silnik (headless)' },
   { name: 'ui', entry: path.join(here, 'ui.tsx'), label: 'Interfejs (React)' },
+  { name: 'account', entry: path.join(here, 'account.tsx'), label: 'Konto społeczności' },
 ];

 const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
--- a/README.md
+++ b/README.md
@@ -803,3 +803,9 @@
 ## Przejście z portalu Rejson

 Na `https://rejson59.github.io` dokument rozpoznaje jednorazowy znacznik przejścia i wczytuje animację wyjścia przed startem aplikacji — również wtedy, gdy projekt ma własny service worker. Bez znacznika, w ramce, na innych domenach i przy niedostępnej pamięci sesji kod nie pobiera zasobów portalu. Skrypt nie przenosi kont ani danych między domenami; na innych originach wyjście z portalu nie jest gwarantowane.
+
+## Wspólne konto Rejson
+
+W menu można zalogować się lub założyć konto bez opuszczania gry. To opcjonalne konto używa istniejącego Supabase Rejsona, hasła albo dotychczasowego PIN-u. Na tym samym originie sesja jest wspólna ze stroną główną i innymi zgodnymi projektami; na innej domenie trzeba się zalogować osobno. Zmiana PIN-u/hasła jest dostępna na stronie konta Rejsona. Bez e-maila nie ma automatycznego odzyskania zapomnianego hasła.
+
+**Konto nie synchronizuje jeszcze światów.** Światy jednoosobowe pozostają w lokalnej przeglądarce, a profil multiplayer jest niezależny. Nie importujemy, nie usuwamy i nie łączymy żadnych zapisów przy logowaniu; transfer na inne urządzenie wymaga obecnie ręcznej kopii plikowej. Import może zastąpić zapis o tym samym identyfikatorze i ograniczyć listę do 8 światów, dlatego przed importem zachowaj osobną kopię istniejących światów. Gra nadal działa bez konta, również bez połączenia. Dostęp do serwera kont, gdy sieć nie działa, nie jest możliwy. Wylogowanie usuwa lokalną sesję, ale nie unieważnia jej po stronie serwera.
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,10 +1,11 @@
-import { useEffect, useState } from 'react';
+import { useCallback, useEffect, useState } from 'react';
 import GameView from './components/GameView';
 import { MainMenu, type WorldCard, type WorldType } from './components/Menus';
 import Launcher from './components/Launcher';
 import { type GameMode, type SaveData } from './game/engine';
 import MultiplayerScreen, { type NetStart } from './components/MultiplayerScreen';
 import OrientationGuard from './components/OrientationGuard';
+import CommunityAccount from './components/CommunityAccount';
 import type { NetLike } from './game/net';
 import { deleteSave, duplicateSave, loadSaves, MAX_SAVES, renameSave, toggleFavoriteSave } from './game/saves';
 import { onViewportChange } from './utils/viewport';
@@ -73,6 +74,8 @@
   const [saves, setSaves] = useState<WorldCard[]>(cards);
   const [shared, setShared] = useState(readSharedWorld);
   const [multiplayer, setMultiplayer] = useState(false);
+  const [accountOpen, setAccountOpen] = useState(false);
+  const closeAccount = useCallback(() => setAccountOpen(false), []);
   // 2.24.1: pierwszym ekranem znów jest klasyczne menu gry. Launcher został
   // w projekcie, ale domyślnie się nie pokazuje – wchodzi się do niego tylko
   // pod adresem #launcher (i wychodzi „Klasycznym menu”).
@@ -216,6 +219,7 @@
       <OrientationGuard variant="menu" />
       <div className="relative min-h-0 w-full flex-1">
         <MainMenu
+          onAccount={() => setAccountOpen(true)}
           onMultiplayer={() => setMultiplayer(true)}
           saves={saves}
           sharedSeed={shared.seed}
@@ -241,6 +245,7 @@
           onPlay={playWorld}
           onNew={newWorld}
         />
+        {accountOpen && <CommunityAccount onClose={closeAccount} />}
       </div>
     </div>
   );
--- /dev/null
+++ b/src/components/CommunityAccount.tsx
@@ -0,0 +1,110 @@
+import { useEffect, useRef, useState, type FormEvent } from 'react';
+import { authenticateCommunity, COMMUNITY_SESSION_KEY, forgetCommunitySession, readCommunitySession, saveCommunitySession, validCredentials, verifyCommunitySession, type CommunitySession } from '../game/communityAccount';
+
+type View = 'checking' | 'guest' | 'connected' | 'unavailable';
+
+/** Opcjonalne konto w menu: nie modyfikuje identyfikatora gracza ani zapisów. */
+export default function CommunityAccount({ onClose }: { onClose: () => void }) {
+  const [view, setView] = useState<View>('checking');
+  const [session, setSession] = useState<CommunitySession | null>(null);
+  const [mode, setMode] = useState<'login' | 'register'>('login');
+  const [name, setName] = useState('');
+  const [secret, setSecret] = useState('');
+  const [confirm, setConfirm] = useState('');
+  const [message, setMessage] = useState('');
+  const [busy, setBusy] = useState(false);
+  const serial = useRef(0);
+  const panel = useRef<HTMLDivElement>(null);
+  const busyRef = useRef(false);
+  busyRef.current = busy;
+
+  useEffect(() => {
+    let alive = true;
+    const previous = document.activeElement as HTMLElement | null;
+    panel.current?.focus();
+    const refresh = async () => {
+      const sequence = ++serial.current;
+      let stored: CommunitySession | null = null;
+      try { stored = readCommunitySession(window.localStorage); } catch { /* Pamięć może być zablokowana. */ }
+      if (!stored) { setSession(null); setView('guest'); return; }
+      setView('checking');
+      try {
+        const verified = await verifyCommunitySession(stored);
+        if (!alive || sequence !== serial.current) return;
+        try { if (readCommunitySession(window.localStorage)?.token !== stored.token) return; } catch { return; }
+        setSession(verified);
+        setView(verified ? 'connected' : 'guest');
+        if (!verified) setMessage('Sesja wygasła. Zaloguj się ponownie.');
+      } catch {
+        if (alive && sequence === serial.current) { setSession(null); setView('unavailable'); }
+      }
+    };
+    const storage = (event: StorageEvent) => { if (event.key === COMMUNITY_SESSION_KEY || event.key === null) void refresh(); };
+    const changed = () => { void refresh(); };
+    const keydown = (event: KeyboardEvent) => {
+      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); onClose(); }
+      if (event.key !== 'Tab' || !panel.current) return;
+      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'));
+      if (!items.length) { event.preventDefault(); panel.current.focus(); return; }
+      const first = items[0], last = items[items.length - 1];
+      if (!panel.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
+      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
+      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
+    };
+    void refresh();
+    window.addEventListener('storage', storage);
+    window.addEventListener('rj:session-change', changed);
+    window.addEventListener('keydown', keydown);
+    return () => { alive = false; ++serial.current; window.removeEventListener('storage', storage); window.removeEventListener('rj:session-change', changed); window.removeEventListener('keydown', keydown); previous?.focus(); };
+  }, [onClose]);
+
+  const submit = async (event: FormEvent) => {
+    event.preventDefault();
+    if (!validCredentials(mode, name, secret)) { setMessage('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.'); return; }
+    if (mode === 'register' && secret !== confirm) { setMessage('Hasła nie są takie same.'); return; }
+    const sequence = ++serial.current;
+    const password = secret;
+    setSecret(''); setConfirm(''); setMessage(''); setBusy(true);
+    try {
+      const verified = await authenticateCommunity(mode, name, password);
+      if (sequence !== serial.current) return;
+      try { saveCommunitySession(localStorage, verified); }
+      catch { throw new Error('Nie można zapisać sesji w tej przeglądarce.'); }
+      setSession(verified); setView('connected');
+      window.dispatchEvent(new Event('rj:session-change'));
+    } catch (error) {
+      if (sequence === serial.current) setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować.');
+    } finally { setBusy(false); }
+  };
+  const logout = () => {
+    ++serial.current;
+    try { forgetCommunitySession(localStorage); }
+    catch { setMessage('Nie udało się usunąć sesji z tej przeglądarki.'); return; }
+    setSession(null); setView('guest'); setMessage('Wylogowano na tym urządzeniu.');
+    window.dispatchEvent(new Event('rj:session-change'));
+  };
+
+  return <div className="absolute inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/80 p-3" role="presentation">
+    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="community-title" className="my-auto w-full max-w-md border-2 border-black bg-[#272119] p-5 text-white shadow-2xl">
+      <div className="flex items-center justify-between gap-3"><h2 id="community-title" className="mc-text text-xl">Konto Rejson</h2><button type="button" className="mc-btn !w-auto !px-3" onClick={onClose} disabled={busy} aria-label="Zamknij konto">✕</button></div>
+      <p className="my-3 text-sm text-white/80">To samo konto co w RejChat i RejStream. Gra nadal działa bez konta.</p>
+      <p className="mb-3 text-sm text-amber-100">Światy jednoosobowe nadal są tylko na tym urządzeniu. Konto nie przenosi ich jeszcze automatycznie; multiplayer ma osobny profil.</p>
+      {view === 'checking' && <p role="status">Sprawdzam konto…</p>}
+      {view === 'unavailable' && <p role="status">Nie można teraz sprawdzić konta. Spróbuj później; Twoje zapisy pozostają na urządzeniu.</p>}
+      {view === 'connected' && session && <div><p>Zalogowano jako <strong>{session.username}</strong>.</p><p className="mt-2 text-sm"><a className="underline" href="https://rejson59.github.io/logowanie" target="_blank" rel="noopener noreferrer">Ustaw lub zmień hasło na stronie konta</a> (na innej domenie może być potrzebne ponowne logowanie).</p><button type="button" className="mc-btn mt-3" onClick={logout}>Wyloguj na tym urządzeniu</button></div>}
+      {view === 'guest' && <>
+        <div className="my-3 flex gap-2" role="group" aria-label="Tryb konta">
+          <button type="button" className="mc-btn !w-auto" disabled={busy} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setSecret(''); setConfirm(''); setMessage(''); }}>Zaloguj</button>
+          <button type="button" className="mc-btn !w-auto" disabled={busy} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setSecret(''); setConfirm(''); setMessage(''); }}>Utwórz konto</button>
+        </div>
+        <form onSubmit={submit} className="flex flex-col gap-3">
+          <label className="flex flex-col gap-1 text-sm">Nazwa użytkownika<input className="border border-white/40 bg-black/50 p-2 text-white" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={24} required disabled={busy} /></label>
+          <label className="flex flex-col gap-1 text-sm">{mode === 'login' ? 'Hasło lub dotychczasowy PIN' : 'Hasło'}<input className="border border-white/40 bg-black/50 p-2 text-white" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={secret} onChange={(e) => setSecret(e.target.value)} required disabled={busy} /></label>
+          {mode === 'register' && <><label className="flex flex-col gap-1 text-sm">Powtórz hasło<input className="border border-white/40 bg-black/50 p-2 text-white" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} /></label><p className="text-xs text-white/75">Minimum 10 znaków i maksymalnie 72 bajty. Nie ma automatycznego odzyskiwania zapomnianego hasła.</p></>}
+          <button type="submit" className="mc-btn mc-btn-primary" disabled={busy}>{busy ? 'Łączenie…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button>
+        </form>
+      </>}
+      {message && <p className="mt-3 text-sm text-amber-100" role="status">{message}</p>}
+    </div>
+  </div>;
+}
--- a/src/components/Menus.tsx
+++ b/src/components/Menus.tsx
@@ -300,10 +300,13 @@
   onToggleFavorite,
   onImported,
   onMultiplayer,
+  onAccount,
 }: {
   saves: WorldCard[];
   /** 2.10: otwiera poczekalnię multiplayer. */
   onMultiplayer?: () => void;
+  /** Opcjonalne wspólne konto; nie jest wymagane do gry. */
+  onAccount?: () => void;
   /** called after a save file was imported so the list can refresh */
   onImported?: () => void;
   /** seed / mode taken from the URL hash (shareable world links) */
@@ -422,6 +425,7 @@
                     Gra razem · multiplayer
                   </button>
                 )}
+                {onAccount && <button className="mc-btn" type="button" onClick={onAccount}>Konto Rejson</button>}
                 <div className="grid grid-cols-2 gap-2.5">
                   <button className="mc-btn !px-2" onClick={() => setView('controls')}>
                     Sterowanie
--- /dev/null
+++ b/src/game/communityAccount.ts
@@ -0,0 +1,75 @@
+/** Wspólne konto Rejsona, niezależne od lokalnych danych aplikacji. */
+const API = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/';
+// Publiczny klucz anon. Dostęp do kont wymaga hasła/PIN-u lub tokenu sesji.
+const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
+export const COMMUNITY_SESSION_KEY = 'rejson_community_session_v1';
+export type CommunitySession = { token: string; username: string };
+type Stored = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
+type Requester = typeof fetch;
+
+function sessionShape(value: unknown): CommunitySession | null {
+  if (!value || typeof value !== 'object') return null;
+  const item = value as Record<string, unknown>;
+  return typeof item.token === 'string' && item.token.length >= 16 &&
+    typeof item.username === 'string' && item.username.length > 0
+    ? { token: item.token, username: item.username } : null;
+}
+export function readCommunitySession(storage: Pick<Storage, 'getItem'>): CommunitySession | null {
+  try { return sessionShape(JSON.parse(storage.getItem(COMMUNITY_SESSION_KEY) || 'null')); }
+  catch { return null; }
+}
+export function validCredentials(mode: 'login' | 'register', username: string, secret: string): boolean {
+  return /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username.trim()) &&
+    secret.length > 0 && new TextEncoder().encode(secret).length <= 72 &&
+    (mode === 'login' || Array.from(secret).length >= 10);
+}
+async function rpc(name: string, params: object, request: Requester): Promise<unknown> {
+  let response: Response;
+  const controller = new AbortController();
+  const timer = setTimeout(() => controller.abort(), 12000);
+  try {
+    response = await request(API + name, {
+      method: 'POST', cache: 'no-store',
+      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
+      body: JSON.stringify(params), signal: controller.signal,
+    });
+  } catch { throw new Error('Nie udało się połączyć z kontem. Spróbuj ponownie później.'); }
+  finally { clearTimeout(timer); }
+  const body: unknown = await response.json().catch(() => null);
+  if (!response.ok) {
+    const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Nie udało się połączyć z kontem.';
+    throw new Error(message);
+  }
+  return body;
+}
+/** Nie ufamy nazwie przechowywanej w przeglądarce; potwierdza ją serwer. */
+export async function verifyCommunitySession(session: CommunitySession, request: Requester = fetch): Promise<CommunitySession | null> {
+  const result = await rpc('community_whoami', { p_token: session.token }, request);
+  if (!result || typeof result !== 'object' || !('username' in result)) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
+  const { username } = result;
+  if (username === null) return null;
+  if (typeof username !== 'string' || !username) throw new Error('Nieprawidłowa odpowiedź serwera konta.');
+  return { token: session.token, username };
+}
+/** Konto jest tworzone/logowane w grze; hasło/PIN nigdy nie trafia do URL ani localStorage. */
+export async function authenticateCommunity(mode: 'login' | 'register', username: string, secret: string, request: Requester = fetch): Promise<CommunitySession> {
+  const name = username.trim();
+  if (!validCredentials(mode, name, secret)) throw new Error('Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.');
+  const response = await rpc(mode === 'register' ? 'community_register' : 'community_login', { p_username: name, p_pin: secret }, request);
+  const session = sessionShape(response);
+  if (!session) throw new Error(mode === 'register' ? 'Serwer przyjął rejestrację, ale odpowiedź była nieprawidłowa. Spróbuj się zalogować.' : 'Nieprawidłowa odpowiedź serwera konta.');
+  try {
+    const verified = await verifyCommunitySession(session, request);
+    if (!verified) throw new Error('Sesja wygasła.');
+    return verified;
+  } catch (error) {
+    if (mode === 'register') throw new Error('Konto utworzono, ale nie udało się potwierdzić sesji. Spróbuj się zalogować.');
+    throw error;
+  }
+}
+export function saveCommunitySession(storage: Stored, session: CommunitySession): void {
+  storage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(session));
+}
+export function forgetCommunitySession(storage: Pick<Stored, 'removeItem'>): void {
+  storage.removeItem(COMMUNITY_SESSION_KEY);
+}
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -27,5 +27,5 @@
     "noUnusedParameters": true,
     "noFallthroughCasesInSwitch": true
   },
-  "include": ["src", "vite.config.ts", ".harness/smoke.ts", ".harness/ui.tsx", ".harness/bench.ts", ".harness/jsdom.d.ts"]
+  "include": ["src", "vite.config.ts", ".harness/smoke.ts", ".harness/ui.tsx", ".harness/account.tsx", ".harness/bench.ts", ".harness/jsdom.d.ts"]
 }

```
