/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Nowe aplikacje RejHuba: RejPlanner, RejGames, RejMusic, RejMeme,
 * RejAsystent i strona /aplikacje + instalacja jako aplikacja (PWA).
 *
 * Testy działają bez sieci i bez przeglądarki: ładują prawdziwy HTML strony,
 * a potem uruchamiają w nim prawdziwy skrypt aplikacji. Sprawdzają to, co
 * użytkownik naprawdę widzi — liczbę dni w kalendarzu, działanie filtrów,
 * rozpoznawanie linków i polecenia asystenta.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PAGES = {
  'aplikacje.html': { script: null, title: 'Aplikacje RejHuba' },
  'rejplanner.html': { script: 'js/rejplanner.js', title: 'RejPlanner' },
  'rejgames.html': { script: 'js/rejgames.js', title: 'RejGames' },
  'rejmusic.html': { script: 'js/rejmusic.js', title: 'RejMusic' },
  'rejmeme.html': { script: 'js/rejmeme.js', title: 'RejMeme' },
  'rejasystent.html': { script: 'js/rejassistant.js', title: 'RejAsystent' }
};

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

function dom(file) {
  const html = read('rejhub2/' + file);
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, {
    url: 'https://rejhub.vercel.app/' + file.replace('.html', ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
}

/* jsdom wczytuje HTML synchronicznie, ale DOMContentLoaded wysyła dopiero
   w kolejnym kroku — dlatego czekamy na „load”, zanim uruchomimy skrypt. */
function boot(file) {
  const page = dom(file);
  const w = page.window;
  return new Promise((resolve) => {
    w.addEventListener('load', () => {
      w.eval(read(PAGES[file].script));
      resolve(page);
    });
  });
}

/* ------------------------------------------------------------- wspólna rama */
async function main() {
console.log('\n=== A. STRONY APLIKACJI ===');

await check('wszystkie nowe strony istnieją i mają tytuł, opis i kanoniczny adres', async () => {
  Object.entries(PAGES).forEach(([file, meta]) => {
    const html = read('rejhub2/' + file);
    assert.match(html, /<title>[^<]*Rej/, file + ': brak tytułu');
    assert.match(html, new RegExp(meta.title), file + ': tytuł nie mówi, co to za strona');
    assert.match(html, /<meta name="description" content="[^"]{40,}"/, file + ': brak opisu');
    assert.match(html, /<link rel="canonical" href="\/[a-z]+">/, file + ': brak adresu kanonicznego');
    assert.match(html, /<html lang="pl"/, file + ': brak języka');
  });
});

await check('każda strona ma jedną topbarę, wyspę, licencję i stopkę', async () => {
  Object.keys(PAGES).forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.equal((html.match(/class="site-header rj-shared-header/g) || []).length, 1, file + ': liczba topbarów');
    assert.ok(html.includes('/hub/island.js?v='), file + ': brak wyspy');
    assert.ok(html.includes('class="license-line"'), file + ': brak informacji o licencji');
    assert.ok(html.includes('/js/install-prompt.js?v=1'), file + ': brak zachęty do instalacji');
    assert.ok(html.includes('aria-label="Aplikacje'), file + ': brak linku do aplikacji w menu');
  });
});

await check('menu „Więcej” prowadzi do aplikacji na każdej podstronie', async () => {
  const pages = fs.readdirSync(path.join(root, 'rejhub2')).filter((file) => file.endsWith('.html'));
  const withNav = pages.filter((file) => read('rejhub2/' + file).includes('nav-more-label'));
  assert.ok(withNav.length >= 16, 'za mało stron z menu: ' + withNav.length);
  withNav.forEach((file) => {
    assert.ok(read('rejhub2/' + file).includes('href="/aplikacje"'), file + ': brak Aplikacji w menu');
  });
});

await check('strony aplikacji nie mają zieleni ani poziomego przewijania', async () => {
  const css = read('css/rejapps.css');
  assert.ok(!/#34d399|#22c55e|#10b981|#32d74b|#4ade80|#30d158/i.test(css), 'zieleń w rejapps.css');
  Object.keys(PAGES).forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.ok(!/#34d399|#22c55e|#10b981|#32d74b/i.test(html), file + ': zieleń w stylach inline');
    assert.ok(!/overflow-x:\s*scroll/.test(html), file + ': wymuszone przewijanie w bok');
  });
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/, 'siatki nie zwijają się do jednej kolumny');
  assert.match(css, /min-height: 46px/, 'brak minimalnej wysokości przycisków');
});

/* ------------------------------------------------------- aplikacja mobilna */
console.log('\n=== B. INSTALACJA JAKO APLIKACJA ===');

await check('manifest ma nazwę, ikony, kolory i skróty', async () => {
  const manifest = JSON.parse(read('rejhub2/manifest.webmanifest'));
  assert.equal(manifest.short_name, 'RejHub');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'brak ikony maskowalnej');
  assert.ok(manifest.shortcuts.length >= 3, 'brak skrótów');
  manifest.icons.forEach((icon) => {
    assert.ok(fs.existsSync(path.join(root, 'rejhub2', icon.src)), 'brak pliku ' + icon.src);
  });
});

await check('strona mówi, jak dodać skrót na iPhonie i Androidzie', async () => {
  const script = read('js/install-prompt.js');
  assert.ok(script.includes('Do ekranu początkowego'), 'brak instrukcji dla iPhone');
  assert.ok(script.includes('beforeinstallprompt'), 'brak obsługi Androida/Chrome');
  assert.match(script, /30 \* DAY/, 'zachęta nie chowa się na 30 dni');
  assert.ok(script.includes('display-mode: standalone'), 'zachęta pokazuje się w zainstalowanej aplikacji');
  assert.match(script, /max-width: 900px/, 'zachęta nie jest ograniczona do telefonów');
});

/* ----------------------------------------------------------------- planner */
console.log('\n=== C. REJPLANNER ===');

await check('kalendarz pokazuje cały miesiąc, a dodane zadanie zostaje w planie', async () => {
  const page = await boot('rejplanner.html');
  const w = page.window;
  const d = w.document;
  assert.equal(d.querySelectorAll('#plan-days .plan-day').length, 42, 'miesiąc ma mieć 42 dni (6 tygodni)');
  assert.ok(d.querySelector('#plan-month').textContent.trim().length > 4, 'brak nazwy miesiąca');

  d.getElementById('plan-title').value = 'Kupić kawę';
  d.getElementById('plan-kind').value = 'task';
  d.getElementById('plan-date').value = '2026-11-20';
  d.getElementById('plan-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const saved = JSON.parse(w.localStorage.getItem('rj_planner_v1'));
  assert.equal(saved.length, 1, 'zadanie nie trafiło do pamięci');
  assert.equal(saved[0].title, 'Kupić kawę');
  assert.equal(saved[0].kind, 'task');
  assert.equal(saved[0].date, '2026-11-20');
  assert.ok(d.querySelector('#plan-daytitle').textContent.includes('20 listopada'), 'nagłówek nie pokazuje wybranego dnia');
  assert.ok(d.querySelectorAll('#plan-list .plan-item').length === 1, 'lista dnia nie pokazuje zadania');

  d.querySelector('#plan-list [data-toggle]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(JSON.parse(w.localStorage.getItem('rj_planner_v1'))[0].done, true, 'zadania nie da się odhaczyć');
  page.window.close();
});

await check('wyszukiwanie i usuwanie pozycji działają', async () => {
  const page = await boot('rejplanner.html');
  const w = page.window;
  const d = w.document;
  w.localStorage.setItem('rj_planner_v1', JSON.stringify([
    { id: 'a', title: 'Dentysta', date: '2026-11-20', time: '12:30', kind: 'event', note: '' },
    { id: 'b', title: 'Projekt', date: '2026-11-21', time: '', kind: 'task', note: '' }
  ]));
  /* Ponowne uruchomienie skryptu wczytuje zapisany plan. */
  w.eval(read('js/rejplanner.js'));
  const search = d.getElementById('plan-search');
  search.value = 'dent';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.ok(d.querySelector('#plan-daytitle').textContent.includes('Wyniki'), 'brak trybu wyszukiwania');
  assert.equal(d.querySelectorAll('#plan-list .plan-item').length, 1, 'wyszukiwanie nie filtruje');

  search.value = '';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('#plan-days [data-day="2026-11-20"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  d.querySelector('#plan-list [data-remove]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(JSON.parse(w.localStorage.getItem('rj_planner_v1')).length, 1, 'usuwanie nie działa');
  page.window.close();
});

await check('eksport .ics opisuje wydarzenia i zadania', async () => {
  const script = read('js/rejplanner.js');
  assert.ok(script.includes('BEGIN:VCALENDAR'), 'brak nagłówka kalendarza');
  assert.ok(script.includes('DTSTART;VALUE=DATE:'), 'brak wydarzeń całodniowych');
  assert.ok(script.includes('CATEGORIES:ZADANIE'), 'zadania nie są oznaczone');
  assert.ok(script.includes('icsEscape'), 'brak escapowania przecinków i średników');
  assert.match(script, /new Notification\(/, 'brak przypomnień');
});

/* ------------------------------------------------------------------- gry */
console.log('\n=== D. REJGAMES ===');

await check('lista gier, filtry i wyszukiwanie działają', async () => {
  const page = await boot('rejgames.html');
  const w = page.window;
  const d = w.document;
  const all = d.querySelectorAll('#games-grid .game-card').length;
  assert.ok(all >= 8, 'za mało gier: ' + all);
  assert.ok(d.querySelectorAll('#games-filters .rjapp-chip').length >= 5, 'brak filtrów');

  const sandbox = d.querySelector('#games-filters [data-cat="sandbox"]');
  sandbox.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const filtered = d.querySelectorAll('#games-grid .game-card').length;
  assert.ok(filtered < all && filtered > 0, 'filtr nie zawęża listy');

  d.querySelector('#games-filters [data-cat="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const search = d.getElementById('games-search');
  search.value = 'minecraft';
  search.dispatchEvent(new w.Event('input', { bubbles: true }));
  const found = [...d.querySelectorAll('#games-grid .game-card h2')].map((el) => el.textContent.toLowerCase());
  assert.ok(found.length >= 1 && found.every((title) => title.includes('mc') || title.includes('minecraft')), 'wyszukiwanie nie działa: ' + found.join(','));
  page.window.close();
});

await check('każda gra ma działający link i nie udaje wersji online', async () => {
  const script = read('js/rejgames.js');
  const urls = [...script.matchAll(/url: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(urls.length >= 8);
  urls.forEach((url) => assert.match(url, /^https:\/\//, 'link bez https: ' + url));
  assert.match(script, /status: 'soon'/, 'brak oznaczenia gier w przygotowaniu');
  assert.ok(script.includes('rjapp-badge--soon'), 'gry w przygotowaniu nie są oznaczone wizualnie');
});

/* ------------------------------------------------------------------ muzyka */
console.log('\n=== E. REJMUSIC ===');

await check('RejMusic rozpoznaje linki Spotify, YouTube, SoundCloud i Deezer', async () => {
  const page = await boot('rejmusic.html');
  const w = page.window;
  const cases = [
    ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'Spotify'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube'],
    ['https://soundcloud.com/artist/track', 'SoundCloud'],
    ['https://www.deezer.com/track/3135556', 'Deezer']
  ];
  cases.forEach(([url, service]) => {
    const parsed = w.RejMusic.addLink(url);
    assert.ok(parsed, 'nie rozpoznano ' + url);
    assert.equal(parsed.service, service, url + ': zła usługa');
    assert.match(parsed.embed, /^https:\/\//, url + ': osadzenie bez https');
  });
  assert.equal(w.RejMusic.addLink('https://example.com/whatever'), null, 'obcy link nie może być przyjęty');
  const saved = JSON.parse(w.localStorage.getItem('rj_music_links_v1'));
  assert.equal(saved.length, 5, 'playlista nie zapisała się');
  page.window.close();
});

await check('RejMusic szuka utworów w katalogach Deezer i Apple Music', async () => {
  const html = read('rejhub2/rejmusic.html');
  ['music-search-form', 'music-query', 'music-results', 'music-platforms', 'music-more',
   'music-tabs', 'music-count', 'music-fav-count']
    .forEach((id) => assert.ok(html.includes('id="' + id + '"'), 'brak #' + id));
  ['deezer', 'itunes'].forEach((platform) => {
    assert.ok(html.includes('data-platform="' + platform + '"'), 'brak filtra ' + platform);
  });
  assert.ok(html.includes('open.spotify.com/search'), 'brak przejścia do Spotify');
  assert.ok(html.includes('soundcloud.com/search'), 'brak przejścia do SoundCloud');

  const script = read('js/rejmusic.js');
  assert.ok(script.includes('api.deezer.com/search'), 'brak wyszukiwania w Deezerze');
  assert.ok(script.includes('itunes.apple.com/search'), 'brak wyszukiwania w Apple Music');
  assert.ok(script.includes('previewUrl'), 'brak oficjalnych zapowiedzi');
  assert.ok(script.includes('rj_music_favs_v1'), 'brak ulubionych');
  assert.ok(script.includes('rj_music_history_v1'), 'brak historii');
  assert.ok(!/spotify.*download|pobierz.*spotify/i.test(script), 'obietnica pobierania z platform');
});

await check('odtwarzacz ma pliki lokalne, osadzenia i uczciwą informację', async () => {
  const html = read('rejhub2/rejmusic.html');
  assert.ok(html.includes('type="file" accept="audio/*"'), 'brak wyboru plików');
  assert.ok(html.includes('id="music-audio"'), 'brak elementu audio');
  assert.ok(html.includes('music-embed'), 'brak miejsca na osadzony odtwarzacz');
  const script = read('js/rejmusic.js');
  assert.ok(script.includes('URL.createObjectURL'), 'pliki nie są odtwarzane lokalnie');
  assert.ok(script.includes('osadzony odtwarzacz'), 'brak wyjaśnienia, jak działa Spotify');
  assert.ok(!/spotify.*download|pobierz.*spotify/i.test(script), 'obietnica pobierania z Spotify');
});

/* -------------------------------------------------------------------- memy */
console.log('\n=== F. REJMEME ===');

await check('RejMeme to galeria, szablony, wgrywanie i kolejka moderacji', async () => {
  const html = read('rejhub2/rejmeme.html');
  ['meme-gallery', 'meme-search', 'meme-sort', 'meme-templates', 'meme-form', 'meme-file',
   'meme-title', 'meme-tags', 'meme-ethics', 'meme-submit', 'meme-mine', 'meme-lightbox']
    .forEach((id) => assert.ok(html.includes('id="' + id + '"'), 'brak #' + id));
  ['gallery', 'templates', 'upload', 'mine']
    .forEach((view) => assert.ok(html.includes('data-meme-view="' + view + '"'), 'brak zakładki ' + view));
  assert.ok(/accept="image\/jpeg,image\/png,image\/gif,image\/webp"/.test(html), 'zły zestaw formatów plików');
  const script = read('js/rejmeme.js');
  assert.ok(script.includes("meme-status--'"), 'brak oznaczenia statusu moderacji');
  assert.ok(script.includes('rejmeme_submit'), 'wgranie mema nie idzie przez kolejkę moderacji');
  assert.ok(script.includes('rejmeme_gallery'), 'galeria nie czyta zatwierdzonych memów');
  assert.ok(script.includes('rejmeme_mine'), 'brak listy własnych zgłoszeń');
  assert.ok(script.includes('rejmeme_withdraw'), 'brak wycofania zgłoszenia');
  assert.ok(script.includes('knowyourmeme.com'), 'brak źródeł popularnych formatów');
  assert.ok(!/rejmeme_moderate/.test(script), 'strona publiczna nie może moderować memów');
  assert.ok(!script.includes('document.write'), 'niebezpieczne wstawianie HTML');
  assert.ok(!script.includes('innerHTML'), 'renderowanie przez innerHTML zamiast textContent');
});

await check('kolejka memów jest w panelu admina i wymaga zatwierdzenia', async () => {
  const html = read('rejhub2/admin.html');
  assert.ok(html.includes('id="tab-memes"'), 'brak zakładki memów w panelu');
  assert.ok(html.includes('data-tab="memes"'), 'zakładka memów nie jest podpięta');
  assert.ok(html.includes('/js/admin-memes.js'), 'panel nie ładuje obsługi memów');
  assert.ok(html.includes('/css/admin-memes.css'), 'brak arkusza zakładki memów');

  const admin = read('js/admin-memes.js');
  assert.ok(admin.includes('rejmeme_admin_queue'), 'brak wczytywania kolejki');
  assert.ok(admin.includes('rejmeme_moderate'), 'brak decyzji moderacji');
  assert.ok(admin.includes("'approve'") && admin.includes("'reject'"), 'brak zatwierdzania i odrzucania');
  assert.ok(admin.includes('rejmeme_admin_image'), 'admin nie widzi pliku mema przed decyzją');

  const panel = read('js/admin-panel.js');
  assert.ok(panel.includes('memes: "tab-memes"'), 'panel nie zna zakładki memów');
  assert.ok(panel.includes('RJAdminMemes'), 'panel nie uruchamia widoku memów');
});

/* --------------------------------------------------------------- asystent */
console.log('\n=== G. REJASYSTENT ===');

await check('asystent wita się i odpowiada na „pomoc”', async () => {
  const page = await boot('rejasystent.html');
  const w = page.window;
  const d = w.document;
  assert.ok(d.querySelector('#ai-log .ai-msg--bot'), 'brak powitania');
  d.getElementById('ai-input').value = 'pomoc';
  d.getElementById('ai-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const last = [...d.querySelectorAll('#ai-log .ai-msg--bot')].pop();
  assert.match(last.textContent, /otwierać strony/i, 'brak listy możliwości');
  page.window.close();
});

await check('asystent dodaje zadanie do RejPlannera i przełącza motyw', async () => {
  const page = await boot('rejasystent.html');
  const w = page.window;
  const d = w.document;
  d.getElementById('ai-input').value = 'dodaj zadanie kupić kawę na jutro';
  d.getElementById('ai-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const plan = JSON.parse(w.localStorage.getItem('rj_planner_v1'));
  assert.equal(plan.length, 1, 'zadanie nie trafiło do planera');
  assert.equal(plan[0].title, 'kupić kawę', 'zły tytuł zadania (zgubione polskie znaki?): ' + plan[0].title);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  assert.equal(plan[0].date, tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate()), 'zła data zadania');

  d.getElementById('ai-input').value = 'włącz jasny motyw';
  d.getElementById('ai-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(d.documentElement.dataset.theme, 'light', 'motyw się nie przełączył');
  assert.equal(w.localStorage.getItem('theme'), 'light', 'motyw nie został zapamiętany');
  page.window.close();
});

await check('asystent nie wysyła niczego bez własnego klucza i ostrzega o HTTPS', async () => {
  const script = read('js/rejassistant.js');
  assert.ok(script.includes("if (settings.key && settings.base && settings.model)"), 'model uruchamia się bez klucza');
  assert.match(script, /\^https:\\\/\\\//, 'brak wymogu https dla adresu API');
  assert.ok(script.includes('rj_assistant_ai_v1'), 'klucz nie jest trzymany lokalnie');
  assert.ok(!/fetch\('\/api\//.test(script), 'asystent wysyła dane na serwer RejHuba');
});

/* ------------------------------------------------------------- bezpieczeństwo */
console.log('\n=== H. BEZPIECZEŃSTWO I POWIADOMIENIA ===');

await check('Vercel dokłada nagłówki bezpieczeństwa i CSP', async () => {
  const config = JSON.parse(read('rejhub2/vercel.json'));
  const global = config.headers.find((entry) => entry.source === '/(.*)');
  const keys = global.headers.map((entry) => entry.key);
  ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']
    .forEach((key) => assert.ok(keys.includes(key), 'brak nagłówka ' + key));
  const csp = global.headers.find((entry) => entry.key === 'Content-Security-Policy-Report-Only').value;
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /supabase\.co/);
});

await check('logowanie ma limit prób i sprawdza pochodzenie żądania', async () => {
  const api = read('rejhub2/api/session.js');
  assert.ok(api.includes('too_many_attempts'), 'brak limitu prób');
  assert.ok(api.includes('Retry-After'), 'brak informacji, kiedy spróbować ponownie');
  assert.ok(api.includes('forbidden_origin'), 'brak sprawdzenia Origin');
  assert.ok(api.includes('noteFailure'), 'nieudane próby nie są liczone');
  assert.ok(api.includes('clearFailures'), 'udane logowanie nie czyści licznika');
});

await check('powiadomienia mają test i jasny komunikat dla iPhone', async () => {
  const script = read('js/push.js');
  assert.ok(script.includes('sendTest'), 'brak testu');
  assert.ok(script.includes('iOS 16.4'), 'brak informacji o iPhonie');
  assert.ok(read('rejhub2/push-sw.js').includes("data.type === 'RJ_NOTIFY_TEST'"), 'worker nie obsługuje testu');
});

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
console.log('PASS: RejPlanner, RejGames, RejMusic, RejMeme, RejAsystent, instalacja jako aplikacja, bezpieczeństwo i test powiadomień');
process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
