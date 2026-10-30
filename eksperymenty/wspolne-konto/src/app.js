/* Prototyp lokalny. Bez połączenia ze starym kontem, Supabase ani danymi projektów. */
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const clients = Object.freeze({
  '/projekt-a/': { id:'projekt-a', name:'Projekt A' },
  '/projekt-b/': { id:'projekt-b', name:'Projekt B' },
});
const prefix = Object.keys(clients).find(path => location.pathname === path || location.pathname === path + 'callback.html');
if (!prefix) throw new Error('Nieznany projekt demonstracyjny.');
const config = clients[prefix];
const callback = location.origin + prefix + 'callback.html';
const store = new WebStorageStateStore({ store: window.sessionStorage });
const manager = new UserManager({
  authority: 'http://localhost:8080/realms/rejson-demo',
  client_id: config.id,
  redirect_uri: callback,
  response_type: 'code',
  scope: 'openid profile',
  userStore: store,
  stateStore: store,
  automaticSilentRenew: false,
  loadUserInfo: false,
});
const title = document.getElementById('project');
const message = document.getElementById('message');
const signin = document.getElementById('signin');
const clear = document.getElementById('clear');
title.textContent = config.name;
function setMessage(text) { message.textContent = text; }
async function refresh() {
  const user = await manager.getUser();
  const active = user && !user.expired;
  signin.hidden = !!active;
  clear.hidden = !active;
  setMessage(active ? 'Zalogowano jako: ' + (user.profile.preferred_username || user.profile.sub) : 'To lokalne demo. Nie używaj prawdziwego hasła.');
}
async function run() {
  if (location.pathname === prefix + 'callback.html') {
    // Zachowaj adres dla biblioteki i nie zostawiaj kodu autoryzacyjnego w historii.
    const responseUrl = location.href;
    history.replaceState(null, '', prefix);
    try { await manager.signinRedirectCallback(responseUrl); }
    catch (e) { signin.hidden = false; clear.hidden = true; setMessage('Nie udało się potwierdzić logowania. Rozpocznij je ponownie.'); return; }
  }
  await refresh();
}
signin.addEventListener('click', async () => {
  signin.disabled = true;
  try { await manager.signinRedirect({ nonce: crypto.randomUUID() }); }
  catch (e) { setMessage('Nie można uruchomić logowania. Sprawdź, czy lokalny Keycloak działa.'); signin.disabled = false; }
});
clear.addEventListener('click', async () => {
  // Czyści jedynie sesję tej aplikacji w karcie. Sesja SSO u dostawcy nadal istnieje.
  await manager.removeUser();
  signin.hidden = false; clear.hidden = true;
  setMessage('Usunięto sesję projektu w tej karcie. Sesja u dostawcy logowania może nadal być aktywna.');
});
run().catch(() => setMessage('Nie udało się odczytać sesji w tej przeglądarce.'));
